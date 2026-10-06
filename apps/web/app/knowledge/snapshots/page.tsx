"use client";

import { Stack } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function SnapshotsPage() {
  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Snapshots" }]}>
      <ComingSoon title="Snapshots" icon={Stack} />
    </StudioShell>
  );
}
