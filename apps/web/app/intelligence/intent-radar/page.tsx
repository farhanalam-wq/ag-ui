import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function IntentRadarPage() {
  return (
    <StudioShell crumbs={[{ label: "Intelligence" }, { label: "Intent Radar" }]}>
      <ComingSoon title="Intent Radar" icon="crosshair" />
    </StudioShell>
  );
}