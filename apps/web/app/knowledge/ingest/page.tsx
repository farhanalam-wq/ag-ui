"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StudioShell } from "@/components/studio-shell";
import { IngestionStudio } from "@/components/ingestion/ingestion-studio";
import { apiClient } from "@/lib/api-client";
import type { CompanyItem } from "@/components/sidebar/company-switcher";
import { useCompanyStore } from "@/stores/use-company-store";

export default function IngestRoutePage() {
  const router = useRouter();

  useEffect(() => {
    if (useCompanyStore.getState().companies.length > 0) return;
    async function loadCompanies() {
      try {
        const list = await apiClient.companies.list();
        if (list.length > 0) {
          const dynamicList: CompanyItem[] = list.map((c) => {
            const brandColor = c.brand?.tokens?.colors?.primary || "#3b82f6";
            const docCount = c.docCount ?? c.latestSnapshot?.pageCount ?? 0;
            return {
              id: c.id,
              name: c.name,
              domain: c.domain,
              description: `Indexed knowledge base for ${c.name} (${c.domain}).`,
              brandColor,
              badge: `${docCount} Docs • Indexed`,
              docCount,
              chunkCount: c.chunkCount ?? 0,
              factCount: c.factCount ?? 0,
              status: c.status || c.latestSnapshot?.status || "READY",
              suggestedQueries: [
                `What are the core products and APIs provided by ${c.name}?`,
                `What are the pricing tiers, limits, and plan options?`,
                `Where are ${c.name} headquarters and contact options?`,
              ],
            };
          });
          useCompanyStore.getState().setCompanies(dynamicList);
        }
      } catch {
        // Non-blocking
      }
    }
    loadCompanies();
  }, []);

  const handleCompanyIndexed = (company: CompanyItem) => {
    // Store the newly indexed company and navigate to the playground.
    useCompanyStore.getState().upsertAndSelect(company);
    router.push("/playground");
  };

  const handleCancel = () => {
    router.push("/playground");
  };

  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Ingest" }]}>
      <IngestionStudio
        onCompanyIndexed={handleCompanyIndexed}
        onCancel={handleCancel}
      />
    </StudioShell>
  );
}
