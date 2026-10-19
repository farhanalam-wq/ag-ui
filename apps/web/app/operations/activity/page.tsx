import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ActivityPage() {
  return (
    <StudioShell crumbs={[{ label: "Operations" }, { label: "Activity" }]}>
      <ComingSoon title="Activity" icon="list-bullets" />
    </StudioShell>
  );
}