"use client";

/**
 * Agent → Questions.
 *
 * How much is asked, how deep a conversation gets, and which pages trigger it.
 * Volume only: the report deliberately carries no question text (it is never
 * stored) and no intent labels — those belong to the Intelligence module's
 * Intent Radar, which is still a placeholder.
 */

import { useMemo } from "react";
import { ChatCircleText } from "@phosphor-icons/react";
import type { AgentQuestionsAnalytics } from "@/lib/api-client";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";

export function AgentQuestionsTab({
  data,
}: {
  data: AgentQuestionsAnalytics;
}) {
  // Caption: how often an open becomes a question, over the pages shown.
  const insight = useMemo(() => {
    const rows = data.breakdowns.path;
    const q = rows.reduce((a, r) => a + Number(r.chatQuestions ?? 0), 0);
    const o = rows.reduce((a, r) => a + Number(r.chatOpens ?? 0), 0);
    const lead = rows.find((r) => Number(r.chatQuestions ?? 0) > 0);
    if (q <= 0 || !lead) return null;
    // No share-of-total: the rows are a bounded top-10 scan, so a percentage
    // would claim coverage it does not have.
    const parts = [`${lead.label} draws the most questions (${Number(lead.chatQuestions)}).`];
    if (o > 0) {
      const perOpen = Math.round((q / o) * 100) / 100;
      parts.push(`Across these pages, each open leads to ${perOpen} questions on average.`);
    }
    return parts.join(" ");
  }, [data]);

  return (
    <div className="space-y-4">
      <MetricGrid
        columns={4}
        items={[
          { id: "messages", value: data.totals.messages, label: "Questions asked" },
          {
            id: "questionsPerSession",
            value: data.totals.questionsPerSession,
          },
          { id: "avgOpenDuration", value: data.totals.avgOpenDurationSec },
          { id: "maxOpenDuration", value: data.totals.maxOpenDurationSec },
        ]}
      />

      <BreakdownTable
        title="Questions by page"
        description="The host pages where visitors ask — the answer to “what makes people open the panel”."
        insight={insight ?? undefined}
        labelHeader="Path"
        rows={data.breakdowns.path}
        columns={[
          { key: "chatQuestions", label: "Questions" },
          { key: "chatOpens", label: "Opens" },
        ]}
        barKey="chatQuestions"
        empty="No agent activity in this range."
      />

      <MetricStory
        metrics={[
          "messages",
          "questionsPerSession",
          "avgOpenDuration",
          "maxOpenDuration",
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Panel time is measured by the parent page, not the chat iframe, so a
        panel left open in a background tab still counts. Unmet demand is not
        inferred here — it lives in Intelligence → Intent Radar, which is not
        built yet.
      </p>
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ChatCircleText className="size-3.5" aria-hidden="true" />
        Volume only — question text and transcripts are never stored.
      </p>
    </div>
  );
}
