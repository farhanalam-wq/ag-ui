"use client";

/**
 * Agent → Overview.
 *
 * Did anyone use the assistant, and how many of them noticed it? Two ratios
 * with two different denominators sit next to the counts, and both are stated
 * on the tab: open rate divides by *all* visits (from the rollup), questions
 * per session divides by the visits that asked at least one question.
 *
 * The planned Visit → Opened → Asked → Grounded funnel is not here: conversions
 * are parked, and the grounded step lives on Quality, so drawing it would mean
 * joining reports into a shape no single query measured.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Robot } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentOverviewAnalytics } from "@/lib/api-client";
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

export function AgentOverviewTab({
  data,
  refreshKey,
}: {
  data: AgentOverviewAnalytics;
  refreshKey: number;
}) {
  const trend = useMemo(
    () => data.trend.map((t) => ({ ...t })),
    [data]
  );
  // Caption for the trend card: demand momentum — questions in the second
  // half of the range vs the first. Opens are also per day; questions are
  // the demand the tab watches.
  const demandInsight = useMemo(() => {
    if (data.trend.length < 4) return null;
    const half = Math.floor(data.trend.length / 2);
    const sum = (rows: typeof data.trend) =>
      rows.reduce((a, t) => a + Number(t.chatQuestions ?? 0), 0);
    const first = sum(data.trend.slice(0, half));
    const second = sum(data.trend.slice(half));
    if (first === 0 && second === 0) return null;
    if (first === 0) return `All ${second} questions arrived in the second half of the range.`;
    const pct = Math.round(((second - first) / first) * 1000) / 10;
    return `Questions ${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct)}% from the first to the second half of the range.`;
  }, [data]);

  return (
    <div className="space-y-4">
      <MetricGrid
        columns={3}
        items={[
          { id: "agentSessions", value: data.totals.agentSessions },
          {
            id: "chatOpens",
            value: data.totals.chatOpens,
            sparkline: data.trend.map((t) => t.chatOpens),
          },
          // No sparkline on the two ratios: their denominators are not per
          // day in this payload, and a series that cannot be derived is a
          // series the tile must not draw.
          { id: "chatOpenRate", value: data.totals.chatOpenRate },
          {
            id: "messages",
            value: data.totals.messages,
            sparkline: data.trend.map((t) => t.chatQuestions),
          },
          {
            id: "questionsPerSession",
            value: data.totals.questionsPerSession,
          },
        ]}
      />

      <TrendCard
        title="Questions and widget opens"
        description="Per day: questions asked (solid) and widget opens (dashed)."
        insight={demandInsight ?? undefined}
      >
        <SeriesTrendChart
          data={trend}
          series={[
            {
              key: "chatQuestions",
              label: "Questions",
              color: "hsl(var(--chart-1))",
            },
            {
              key: "chatOpens",
              label: "Widget opens",
              color: "hsl(var(--chart-7))",
            },
          ]}
          refreshKey={refreshKey}
        />
      </TrendCard>

      <MetricStory
        metrics={[
          "agentSessions",
          "chatOpens",
          "chatOpenRate",
          "messages",
          "questionsPerSession",
        ]}
      />
      <p className="text-xs text-muted-foreground">
        Open rate divides widget opens by every visit in the range; questions
        per session divides questions by the visits that asked at least one.
        Both denominators are stated because they are different numbers.
      </p>
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Robot className="size-3.5" aria-hidden="true" />
        Counts only — question text is never stored. Every event is emitted by
        the parent page, not by the embedded chat iframe.
      </p>
    </div>
  );
}
