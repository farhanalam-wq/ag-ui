"use client";

import { Users } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function TeamSettingsPage() {
  return (
    <StudioShell crumbs={[{ label: "Settings" }, { label: "Team" }]}>
      <ComingSoon
        title="Team"
        description="Role-based access (Admin, Editor, Viewer) and seat provisioning will live here."
        icon={Users}
      />
    </StudioShell>
  );
}
