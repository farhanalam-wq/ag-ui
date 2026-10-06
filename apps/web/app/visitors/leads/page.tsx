"use client";

import { UserPlus } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function LeadsPage() {
  return (
    <StudioShell crumbs={[{ label: "Visitors" }, { label: "Leads" }]}>
      <ComingSoon title="Leads" icon={UserPlus} />
    </StudioShell>
  );
}
