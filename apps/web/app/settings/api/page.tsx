"use client";

import { Key } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ApiSettingsPage() {
  return (
    <StudioShell crumbs={[{ label: "Settings" }, { label: "API & Webhooks" }]}>
      <ComingSoon
        title="API & Webhooks"
        description="API keys, telemetry event webhooks (lead.captured, intent.blindspot_detected), and public SDK tokens will live here."
        icon={Key}
      />
    </StudioShell>
  );
}
