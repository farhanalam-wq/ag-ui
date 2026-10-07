"use client";

import { SquaresFour } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function OverviewPage() {
  return (
    <StudioShell crumbs={[{ label: "Overview" }]}>
      <ComingSoon
        title="Overview"
        description="Company-wide overview and highlights are coming soon."
        icon={SquaresFour}
        backHref="/playground"
        backLabel="Go to Playground"
      />
    </StudioShell>
  );
}
