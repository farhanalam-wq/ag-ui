"use client";

/**
 * Agent → Quality.
 *
 * Is the answer traceable, and how long did it take? Grounding is measured from
 * the evidence attached to each assistant message; answer time is the gap
 * between a user row and the assistant row that follows it — generation plus
 * streaming, with retrieval excluded. That exclusion is stated, not hidden:
 * the report cannot claim a time-to-first-token it never measured.
 *
 * "Answers without a source" is not a failure count. The answer may be right;
 * it is just not traceable, and that is the gap the content team can close.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { ShieldCheck } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentQualityAnalytics } from "@/lib/api-client";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { TrendCard } from "@/components/analytics/trend-card";

const SeriesTrendChart = dynamic(
  () =>
    import("@/components/analytics/series-trend-chart").then(
      (m) => m.SeriesTrendChart
    ),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> }
);

export function AgentQualityTab({
  data,
  refreshKey,
}: {
  data: AgentQualityAnalytics;
  refreshKey: number;
}) {
  const trend = useMemo(() => data.trend.map((t) => ({ ...t })), [data]);

  // Caption for the answers chart: volume momentum, halves of the range.
  const answersInsight = useMemo(() => {
    if (data.trend.length < 4) return null;
    const half = Math.floor(data.trend.length / 2);
    const sum = (rows: typeof data.trend) =>
      rows.reduce((a, t) => a + Number(t.answers ?? 0), 0);
    const first = sum(data.trend.slice(0, half));
    const second = sum(data.trend.slice(half));
    if (first === 0 && second === 0) return null;
    if (first === 0) return `All ${second} answers arrived in the second half of the range.`;
    const pct = Math.round(((second - first) / first) * 1000) / 10;
    return `Answers ${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct)}% from the first to the second half of the range.`;
  }, [data]);
  // Caption for the rate chart: the weakest day — dated and factual, never a
  // cause claim (the cause belongs to whoever reads it, as with anomalies).
  const rateInsight = useMemo(() => {
    const rated = data.trend.filter((t) => Number(t.answers ?? 0) > 0);
    if (rated.length < 2) return null;
    const worst = rated.reduce((a, b) =>
      Number(b.groundedAnswerRate ?? 0) < Number(a.groundedAnswerRate ?? 0) ? b : a
    );
    return `Weakest day: ${worst.d.slice(5)} grounded ${Number(worst.groundedAnswerRate).toFixed(1)}% of ${Number(worst.answers)} answers.`;
  }, [data]);

  return (
    <div className="space-y-4">
      <MetricGrid
        columns={4}
        items={[
          {
            id: "groundedAnswerRate",
            value: data.totals.groundedAnswerRate,
            sparkline: data.trend.map((t) =>
              Number(t.answers ?? 0) > 0 ? Number(t.groundedAnswerRate ?? 0) : null
            ),
          },
          { id: "answersWithoutEvidence", value: data.totals.answersWithoutEvidence },
          {
            id: "answerTimeP50",
            value: data.totals.answerTimeP50Sec,
          },
          { id: "answerTimeP95", value: data.totals.answerTimeP95Sec },
        ]}
      />

      <TrendCard
        title="Answers and grounding"
        description="Per day: answers written (solid) and answers that cited a source (dashed)."
        insight={answersInsight ?? undefined}
      >
        <SeriesTrendChart
          data={trend}
          series={[
            {
              key: "answers",
              label: "Answers",
              color: "hsl(var(--chart-1))",
            },
            {
              key: "groundedAnswers",
              label: "Grounded answers",
              color: "hsl(var(--chart-7))",
            },
          ]}
          refreshKey={refreshKey}
        />
      </TrendCard>

      <TrendCard
        title="Grounding rate"
        description="Grounded share of that day's answers — the quality signal the counts above only imply."
        insight={rateInsight ?? undefined}
        footer="Days with answers but no grounded ones read 0%; days without answers do not exist in the report."
      >
        <SeriesTrendChart
          data={trend}
          percent
          series={[
            {
              key: "groundedAnswerRate",
              label: "Grounding rate",
              color: "hsl(var(--chart-2))",
            },
          ]}
          refreshKey={refreshKey}
        />
      </TrendCard>

      <BreakdownTable
        title="Grounding by page"
        description="Which host pages the agent can answer from. Only conversations with a known path are counted."
        labelHeader="Path"
        rows={data.breakdowns.path}
        columns={[
          { key: "answers", label: "Answers" },
          { key: "groundedAnswers", label: "Grounded" },
          { key: "groundedAnswerRate", label: "Rate", format: "percent1" },
        ]}
        barKey="answers"
        empty="No answers in this range."
      />

      <MetricStory
        metrics={[
          "groundedAnswerRate",
          "answersWithoutEvidence",
          "answerTimeP50",
          "answerTimeP95",
        ]}
      />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden="true" />
        Answer time is generation + streaming, measured message-to-message.
        Retrieval is excluded, so it is not a time-to-first-token claim. Counts
        only: no question text or snippets are stored.
      </p>
    </div>
  );
}
