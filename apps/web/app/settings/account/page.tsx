"use client";

import { User } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function AccountSettingsPage() {
  return (
    <StudioShell crumbs={[{ label: "Settings" }, { label: "Account" }]}>
      <ComingSoon
        title="Account Profile"
        description="Your name, email, avatar, and workspace preferences will live here."
        icon={User}
      />
    </StudioShell>
  );
}
