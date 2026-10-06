"use client";

import { Crosshair } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function IntentAnalyticsPage() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Intent" }]}>
      <ComingSoon title="Intent" icon={Crosshair} />
    </StudioShell>
  );
}
