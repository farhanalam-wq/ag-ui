"use client";

import { Globe } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function WebsiteAnalyticsPage() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Website" }]}>
      <ComingSoon title="Website" icon={Globe} />
    </StudioShell>
  );
}
