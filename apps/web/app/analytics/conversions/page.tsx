import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ConversionsAnalyticsPage() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Conversions" }]}>
      <ComingSoon title="Conversions" icon="target" />
    </StudioShell>
  );
}