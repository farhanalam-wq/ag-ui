"use client";

import { Robot } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AgentsPage() {
  return (
    <StudioShell crumbs={[{ label: "Agents" }]}>
      <ComingSoon
        title="Agents"
        description="One workspace, many specialists — e.g. a Sales assistant on /pricing and a Docs guide on /docs, each bound to its own knowledge snapshot, domains, and voice. Single-agent today; multi-agent lands here."
        icon={Robot}
      />
    </StudioShell>
  );
}
