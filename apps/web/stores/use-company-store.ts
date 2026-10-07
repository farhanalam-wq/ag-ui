"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CompanyItem } from "@/components/sidebar/company-switcher";

interface CompanyState {
  companies: CompanyItem[];
  selectedId: string | null;
  isLoading: boolean;
  setLoading: (v: boolean) => void;
  setCompanies: (list: CompanyItem[]) => void;
  select: (id: string) => void;
  upsertAndSelect: (company: CompanyItem) => void;
}

export const useCompanyStore = create<CompanyState>()(
  persist(
    (set) => ({
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
