import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function LeadsPage() {
  return (
    <StudioShell crumbs={[{ label: "Visitors" }, { label: "Leads" }]}>
      <ComingSoon title="Leads" icon="user-plus" />
    </StudioShell>
  );
}