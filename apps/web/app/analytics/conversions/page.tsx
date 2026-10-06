"use client";

import { Target } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ConversionsAnalyticsPage() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Conversions" }]}>
      <ComingSoon title="Conversions" icon={Target} />
    </StudioShell>
  );
}
