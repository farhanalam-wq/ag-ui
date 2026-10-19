import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function BehaviorPage() {
  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Behavior" }]}>
      <ComingSoon title="Behavior" icon="sliders-horizontal" />
    </StudioShell>
  );
}