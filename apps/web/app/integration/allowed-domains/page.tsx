"use client";

import { Globe } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AllowedDomainsPage() {
  return (
    <StudioShell crumbs={[{ label: "Integration" }, { label: "Allowed Domains" }]}>
      <ComingSoon title="Allowed Domains" icon={Globe} />
    </StudioShell>
  );
}
