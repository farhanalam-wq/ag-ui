import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function SignalsPage() {
  return (
    <StudioShell crumbs={[{ label: "Intelligence" }, { label: "Signals" }]}>
      <ComingSoon title="Signals" icon="lightning" />
    </StudioShell>
  );
}