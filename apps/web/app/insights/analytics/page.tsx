"use client";

import { ChartBar } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AnalyticsPage() {
  return (
    <StudioShell crumbs={[{ label: "Insights" }, { label: "Analytics" }]}>
      <ComingSoon title="Analytics" icon={ChartBar} />
    </StudioShell>
  );
}
