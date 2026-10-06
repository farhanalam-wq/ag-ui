"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ErrorsPage() {
  return (
    <StudioShell crumbs={[{ label: "Operations" }, { label: "Errors" }]}>
      <ComingSoon title="Errors" icon={WarningCircle} />
    </StudioShell>
  );
}
