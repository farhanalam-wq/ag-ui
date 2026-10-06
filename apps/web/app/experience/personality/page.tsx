"use client";

import { Smiley } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function PersonalityPage() {
  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Personality" }]}>
      <ComingSoon title="Personality" icon={Smiley} />
    </StudioShell>
  );
}
