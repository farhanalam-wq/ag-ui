"use client";

import { SlidersHorizontal } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function BehaviorPage() {
  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Behavior" }]}>
      <ComingSoon title="Behavior" icon={SlidersHorizontal} />
    </StudioShell>
  );
}
