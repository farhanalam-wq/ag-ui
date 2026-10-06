"use client";

import { Database } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function SourcesPage() {
  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Sources" }]}>
      <ComingSoon title="Sources" icon={Database} />
    </StudioShell>
  );
}
