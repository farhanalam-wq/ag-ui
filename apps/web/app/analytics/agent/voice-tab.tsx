"use client";

/**
 * Agent → Voice.
 *
 * How often visitors talk instead of type, how deep a call gets, and how many
 * calls are lost before anyone speaks. Counts only: an ended call records its
 * duration and turn count, never the audio or a transcript (O-3).
 *
 * Voice share is a *session* ratio, not questions-vs-calls: a call is not a
 * question, and the only unit both modalities share is the visit.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Microphone, PhoneCall } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { VoiceAnalytics } from "@/lib/api-client";
import { CompositionBar } from "@/components/analytics/composition-bar";
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

export function VoiceTab({
  data,
  refreshKey,
}: {
  data: VoiceAnalytics;
  refreshKey: number;
}) {
  const trend = useMemo(() => data.trend.map((t) => ({ ...t })), [data]);
  // Caption: call momentum, halves of the range.
  const callsInsight = useMemo(() => {
    if (data.trend.length < 4) return null;
    const half = Math.floor(data.trend.length / 2);
    const sum = (rows: typeof data.trend) =>
      rows.reduce((a, t) => a + Number(t.voiceCalls ?? 0), 0);
    const first = sum(data.trend.slice(0, half));
    const second = sum(data.trend.slice(half));
    if (first === 0 && second === 0) return null;
    if (first === 0) return `All ${second} calls started in the second half of the range.`;
    const pct = Math.round(((second - first) / first) * 1000) / 10;
    return `Calls ${pct >= 0 ? "rose" : "fell"} ${Math.abs(pct)}% from the first to the second half of the range.`;
  }, [data]);

  return (
    <div className="space-y-4">
      <MetricGrid
        columns={4}
        items={[
          { id: "textVsVoice", value: data.totals.textVsVoice },
          {
            id: "voiceCalls",
            value: data.totals.voiceCalls,
            sparkline: data.trend.map((t) => t.voiceCalls),
          },
          { id: "voiceTurns", value: data.totals.voiceTurns },
          // Per-day average duration is over the calls that ended that day;
          // a day with no ended calls reports 0, which is a real value here.
          {
            id: "voiceAvgDuration",
            value: data.totals.voiceAvgDurationSec,
            sparkline: data.trend.map((t) => t.voiceAvgDurationSec),
          },
          { id: "voiceMaxDuration", value: data.totals.voiceMaxDurationSec },
          {
            id: "voiceAbandonedCalls",
            value: data.totals.voiceAbandonedCalls,
          },
          { id: "voiceAbandonRate", value: data.totals.voiceAbandonRate },
        ]}
      />

      <CompositionBar
        title="Text vs voice"
        description="Share of agent sessions that included a call; the rest typed. A call is not a question — the visit is the only unit both modalities share."
        metricLabel="Agent sessions"
        rows={[
          { label: "Voice", value: Number(data.totals.textVsVoice ?? 0) },
          {
            label: "Text only",
            value: Math.max(0, 100 - Number(data.totals.textVsVoice ?? 0)),
          },
        ]}
      />

      <TrendCard
        title="Calls and turns"
        description="Per day: calls started (solid) and visitor utterances in ended calls (dashed)."
        insight={callsInsight ?? undefined}
      >
        <SeriesTrendChart
          data={trend}
          series={[
            {
              key: "voiceCalls",
              label: "Calls",
              color: "hsl(var(--chart-1))",
            },
            {
              key: "voiceTurns",
              label: "Turns",
              color: "hsl(var(--chart-7))",
            },
          ]}
          refreshKey={refreshKey}
        />
      </TrendCard>

      <MetricStory
        metrics={[
          "textVsVoice",
          "voiceCalls",
          "voiceTurns",
          "voiceAvgDuration",
          "voiceMaxDuration",
          "voiceAbandonedCalls",
          "voiceAbandonRate",
        ]}
      />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <PhoneCall className="size-3.5" aria-hidden="true" />
        Silent calls connected but ended with zero visitor turns.
      </p>
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Microphone className="size-3.5" aria-hidden="true" />
        Counts only — no audio and no transcript is stored.
      </p>
    </div>
  );
}
