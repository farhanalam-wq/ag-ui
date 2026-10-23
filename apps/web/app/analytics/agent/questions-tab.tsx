"use client";

/**
 * Agent → Questions.
 *
 * How much is asked, how deep a conversation gets, and which pages trigger it.
 * Volume only: the report deliberately carries no question text (it is never
 * stored) and no intent labels — those belong to the Intelligence module's
 * Intent Radar, which is still a placeholder.
 */

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
        labelHeader="Path"
        rows={data.breakdowns.path}
        columns={[
          { key: "chatQuestions", label: "Questions" },
          { key: "chatOpens", label: "Opens" },
        ]}
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
