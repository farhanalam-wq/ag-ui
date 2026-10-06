"use client";

import { Lightning } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function SignalsPage() {
  return (
    <StudioShell crumbs={[{ label: "Intelligence" }, { label: "Signals" }]}>
      <ComingSoon title="Signals" icon={Lightning} />
    </StudioShell>
  );
}
