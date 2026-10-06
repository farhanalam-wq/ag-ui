"use client";

import { Robot } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AgentAnalyticsPage() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Agent" }]}>
      <ComingSoon title="Agent" icon={Robot} />
    </StudioShell>
  );
}
