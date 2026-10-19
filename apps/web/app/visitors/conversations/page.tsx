import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function ConversationsPage() {
  return (
    <StudioShell crumbs={[{ label: "Visitors" }, { label: "Conversations" }]}>
      <ComingSoon title="Conversations" icon="chat-circle-text" />
    </StudioShell>
  );
}