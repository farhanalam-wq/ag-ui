"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { StudioShell } from "@/components/studio-shell";
import { IngestionStudio } from "@/components/ingestion/ingestion-studio";
import type { CompanyItem } from "@/components/sidebar/company-switcher";
import { useCompanyStore } from "@/stores/use-company-store";

export default function IngestRoutePage() {
  const router = useRouter();

  useEffect(() => {
    // Single shared loader (store dedupes concurrent callers).
    useCompanyStore.getState().ensureCompanies();
  }, []);

  const handleCompanyIndexed = (company: CompanyItem) => {
    // Store the newly indexed company and deep-link its playground so the
    // switcher selects it without a refresh (param covers reloads/new tabs).
    useCompanyStore.getState().upsertAndSelect(company);
    router.push(`/playground?company=${encodeURIComponent(company.id)}`);
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
