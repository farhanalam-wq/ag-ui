"use client";

import { Robot } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AgentsPage() {
  return (
    <StudioShell crumbs={[{ label: "Agents" }]}>
      <ComingSoon title="Agents" icon={Robot} />
    </StudioShell>
  );
}
