"use client";

import { Code } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { ComingSoon } from "@/components/coming-soon";

export default function EmbedSnippetPage() {
  return (
    <StudioShell crumbs={[{ label: "Integration" }, { label: "Embed Snippet" }]}>
      <ComingSoon title="Embed Snippet" icon={Code} />
    </StudioShell>
  );
}
