"use client";

import { Play } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function PlaygroundPage() {
  return (
    <StudioShell crumbs={[{ label: "Playground" }]}>
      <ComingSoon title="Playground" icon={Play} />
    </StudioShell>
  );
}
