"use client";

import { CreditCard } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function BillingSettingsPage() {
  return (
    <StudioShell crumbs={[{ label: "Settings" }, { label: "Usage & Billing" }]}>
      <ComingSoon
        title="Usage & Billing"
        description="Token consumption, voice minutes, and telemetry event storage quotas will live here."
        icon={CreditCard}
      />
    </StudioShell>
  );
}
