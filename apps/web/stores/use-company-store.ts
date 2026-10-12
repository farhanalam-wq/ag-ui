"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CompanyItem } from "@/components/sidebar/company-switcher";
import { apiClient } from "@/lib/api-client";

interface CompanyState {
  companies: CompanyItem[];
  selectedId: string | null;
  isLoading: boolean;
  setLoading: (v: boolean) => void;
  setCompanies: (list: CompanyItem[]) => void;
  select: (id: string) => void;
  upsertAndSelect: (company: CompanyItem) => void;
  /**
   * Idempotent loader: fetches the company list once (dedupes concurrent
   * callers) and no-ops when the store is already populated. Safe to call
   * from every mount point — this is the single fetch path.
   */
  ensureCompanies: () => Promise<void>;
}

type ApiCompany = Awaited<
  ReturnType<typeof apiClient.companies.list>
>[number];

/** Canonical API → store mapping (single copy; was triplicated). */
function toCompanyItem(apiComp: ApiCompany): CompanyItem {
  const brandColor = apiComp.brand?.tokens?.colors?.primary || "#3b82f6";
  const docCount = apiComp.docCount ?? apiComp.latestSnapshot?.pageCount ?? 0;
  return {
    id: apiComp.id,
    name: apiComp.name,
    domain: apiComp.domain,
    description: `Indexed knowledge base for ${apiComp.name} (${apiComp.domain}).`,
    brandColor,
    badge: `${docCount} Docs • Indexed`,
    docCount,
    chunkCount: apiComp.chunkCount ?? 0,
    factCount: apiComp.factCount ?? 0,
    status: apiComp.status || apiComp.latestSnapshot?.status || "READY",
    suggestedQueries: [
      `What are the core products and APIs provided by ${apiComp.name}?`,
      `What are the pricing tiers, limits, and plan options?`,
      `Where are ${apiComp.name} headquarters and contact options?`,
      `What compliance certifications and security features exist?`,
    ],
  };
}

// Module-level in-flight guard so concurrent mounters share one request.
let inflight: Promise<void> | null = null;

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set, get) => ({
      companies: [],
      selectedId: null,
      isLoading: true,
      setLoading: (v) => set({ isLoading: v }),
      setCompanies: (list) =>
        set((state) => {
          if (list.length === 0) return { companies: list, selectedId: null };
          const stillExists = state.selectedId
            ? list.some((c) => c.id === state.selectedId)
            : false;
          return {
            companies: list,
            selectedId: stillExists ? state.selectedId : list[0].id,
          };
        }),
      select: (id) =>
        set((state) =>
          state.companies.some((c) => c.id === id) ? { selectedId: id } : state
        ),
      upsertAndSelect: (company) =>
        set((state) => {
          const exists = state.companies.some(
            (c) => c.domain.toLowerCase() === company.domain.toLowerCase()
          );
          const companies = exists
            ? state.companies.map((c) =>
                c.domain.toLowerCase() === company.domain.toLowerCase()
                  ? company
                  : c
              )
            : [company, ...state.companies];
          return { companies, selectedId: company.id };
        }),
      ensureCompanies: () => {
        if (get().companies.length > 0) {
          set({ isLoading: false });
          return Promise.resolve();
        }
        if (inflight) return inflight;
        inflight = (async () => {
          set({ isLoading: true });
          try {
            const apiList = await apiClient.companies.list();
            if (apiList.length > 0) {
              get().setCompanies(apiList.map(toCompanyItem));
            }
          } catch {
            // Non-blocking: callers render empty states on failure.
          } finally {
            set({ isLoading: false });
            inflight = null;
          }
        })();
        return inflight;
      },
    }),
    {
      name: "ag-ui-company",
      partialize: (state) => ({ selectedId: state.selectedId }) as CompanyState,
    }
  )
);

export function useSelectedCompany(): CompanyItem | null {
  const companies = useCompanyStore((s) => s.companies);
  const selectedId = useCompanyStore((s) => s.selectedId);
  if (!selectedId) return companies[0] ?? null;
  return companies.find((c) => c.id === selectedId) ?? companies[0] ?? null;
}
