"use client";

import { Palette } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AppearancePage() {
  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Appearance" }]}>
      <ComingSoon title="Appearance" icon={Palette} />
    </StudioShell>
  );
}
