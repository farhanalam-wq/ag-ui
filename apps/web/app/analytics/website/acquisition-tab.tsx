"use client";

/**
 * Website → Acquisition.
 *
 * Where the traffic came from, decided on-site: referrer host plus UTM tags.
 * No third-party audience data, and no Organic Search bucket — the tag cannot
 * tell dark organic from direct, so search-engine referrers stay under
 * Referral with the host preserved (D6). Saying that on the tab is cheaper than
 * explaining a missing row later.
 *
 * No pageviews-vs-sessions trend here: the Overview tab is that chart's
 * home, and drawing the same daily pair twice on one surface would just
 * repeat a number. What this tab adds that Overview cannot say is the *mix*
 * — how sessions divide by channel, as a snapshot bar and as stacked columns
 * over time, because "is the mix shifting" is the question a channel owner
 * actually brings here.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { AcquisitionAnalytics } from "@/lib/api-client";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { CompositionBar } from "@/components/analytics/composition-bar";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { deltaPct } from "@/components/analytics/format";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { TrendCard } from "@/components/analytics/trend-card";
import { ChartLine } from "@phosphor-icons/react";

const ColumnChart = dynamic(
  () =>
    import("@/components/analytics/column-chart").then((m) => m.ColumnChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> }
);

const SeriesTrendChart = dynamic(
  () =>
    import("@/components/analytics/series-trend-chart").then(
      (m) => m.SeriesTrendChart
    ),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> }
);

const ALL_CHANNELS = [
  "Direct",
  "Organic Social",
  "Campaign",
  "Email",
  "Referral",
] as const;

/** One hue per channel, fixed so the mix reads the same wherever it is drawn. */
const CHANNEL_COLORS: Record<string, string> = {
  Direct: "hsl(var(--chart-1))",
  "Organic Social": "hsl(var(--chart-2))",
  Campaign: "hsl(var(--chart-3))",
  Email: "hsl(var(--chart-4))",
  Referral: "hsl(var(--chart-5))",
};

export function AcquisitionTab({
  data,
  refreshKey,
  compare,
  onCompareChange,
  channels,
  onToggleChannel,
  onClearChannels,
}: {
  data: AcquisitionAnalytics;
  refreshKey: number;
  compare: boolean;
  onCompareChange: (value: boolean) => void;
  channels: string[];
  onToggleChannel: (channel: string) => void;
  onClearChannels: () => void;
}) {
  const mix = data.breakdowns.channel.map((row) => ({
    label: row.label,
    value: Number(row.sessions ?? 0),
  }));
  const delta = (key: "sessions" | "uniques" | "pageviews") => {
    const pct = deltaPct(data.totals[key], data.previousTotals?.[key]);
    // More traffic is the goal this tab watches; the pill says so by colour.
    return pct === null ? null : { pct, good: true };
  };

  // Caption for the stacked chart: the biggest channel, and whether it grew
  // or shrank between the two halves of the range. Momentum, not a total —
  // the table above already has the totals.
  const mixInsight = useMemo(() => {
    const rows = data.breakdowns.channelTrend;
    if (!rows || rows.length < 4) return null;
    const half = Math.floor(rows.length / 2);
    const perChannel = new Map<string, [number, number]>();
    for (const c of ALL_CHANNELS) perChannel.set(c, [0, 0]);
    rows.forEach((r, i) => {
      for (const c of ALL_CHANNELS) {
        const cur = perChannel.get(c)!;
        cur[i < half ? 0 : 1] += Number(r[c] ?? 0);
      }
    });
    const [top, totals] = [...perChannel.entries()].reduce((a, b) =>
      b[1][0] + b[1][1] > a[1][0] + a[1][1] ? b : a
    );
    if (totals[0] + totals[1] === 0) return null;
    const pct =
      totals[0] === 0
        ? null
        : Math.round(((totals[1] - totals[0]) / totals[0]) * 1000) / 10;
    const verb =
      pct === null
        ? `emerged in the second half (${totals[1]} sessions after none in the first)`
        : pct >= 0
          ? `grew ${pct}% between the range's halves`
          : `fell ${Math.abs(pct)}% between the range's halves`;
    return `${top} is the largest channel and ${verb}.`;
  }, [data]);

  // The compare ghost: both periods keyed to the same day-offset axis, since
  // their real dates never overlap.
  const compareRows = useMemo(
    () =>
      data.trend.map((t, i) => ({
        d: t.d.slice(5),
        current: t.sessions,
        previous: data.previousTrend?.[i]?.sessions ?? 0,
      })),
    [data]
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <ChartLine
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Channels
          </span>
          {ALL_CHANNELS.map((channel) => (
            <label
              key={channel}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]"
            >
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={() => onToggleChannel(channel)}
                className="size-3.5 accent-current"
              />
              {channel}
            </label>
          ))}
          {channels.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onClearChannels}
            >
              Clear
            </Button>
          )}
          <Button
            variant={compare ? "default" : "outline"}
            size="sm"
            className="ml-auto h-8 text-xs"
            onClick={() => onCompareChange(!compare)}
            title="Compare against the previous equal-length period"
          >
            Compare
          </Button>
        </CardContent>
      </Card>

      <MetricGrid
        columns={3}
        items={[
          {
            id: "sessions",
            value: data.totals.sessions,
            delta: delta("sessions"),
          },
          {
            id: "uniques",
            value: data.totals.uniques,
            delta: delta("uniques"),
          },
          {
            id: "pageviews",
            value: data.totals.pageviews,
            delta: delta("pageviews"),
          },
        ]}
      />

      <CompositionBar
        title="Channel mix"
        description="How the range's sessions divide by channel. Untagged visits are Direct."
        rows={mix}
      />

      {data.breakdowns.channelTrend &&
        data.breakdowns.channelTrend.length > 0 && (
          <TrendCard
            title="Channel mix over time"
            insight={mixInsight ?? undefined}
            description="Sessions per day, stacked by channel — watch for one channel quietly taking over, or one collapsing."
            footer="A visit that touched two channels counts once in each, so columns can exceed the day's session total on multi-channel days."
          >
            <ColumnChart
              data={data.breakdowns.channelTrend}
              series={ALL_CHANNELS.map((c) => ({
                key: c,
                label: c,
                color: CHANNEL_COLORS[c],
              }))}
              stacked
              refreshKey={refreshKey}
              className="h-[280px]"
            />
          </TrendCard>
        )}

      {compare && data.previousTrend && data.previousTrend.length > 0 && (
        <TrendCard
          title="Current vs previous period"
          description={`Sessions per day — the last ${data.rangeDays} days (solid) against the equal-length period before it (dashed).`}
          insight={(() => {
            const pct = deltaPct(data.totals.sessions, data.previousTotals?.sessions);
            return pct === null
              ? undefined
              : `Sessions are ${pct >= 0 ? "up" : "down"} ${Math.abs(pct)}% vs the previous period.`;
          })()}
        >
          <SeriesTrendChart
            data={compareRows}
            refreshKey={refreshKey}
            series={[
              {
                key: "current",
                label: "Current period",
                color: "hsl(var(--chart-1))",
              },
              {
                key: "previous",
                label: "Previous period",
                color: "hsl(var(--chart-8))",
              },
            ]}
          />
        </TrendCard>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Channels"
          description="Direct, Organic Social, Campaign, Email, Referral — derived on-site."
          rows={data.breakdowns.channel}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
        <BreakdownTable
          title="Source / medium"
          description="UTM source/medium, else the referrer host."
          rows={data.breakdowns.sourceMedium}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
        <BreakdownTable
          title="Campaigns"
          description="utm_campaign values; (not set) means untagged."
          rows={data.breakdowns.campaign}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
        <BreakdownTable
          title="Landing pages"
          description="The entry path of each session."
          labelHeader="Path"
          rows={data.breakdowns.landingPage}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
      </div>

      <MetricStory metrics={["sessions", "uniques", "pageviews"]} />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ChartLine className="size-3.5" aria-hidden="true" />
        Totals refresh on the 15-minute rollup. Search-engine referrers report
        under Referral — there is no Organic Search bucket first-party, by
        design.
      </p>
    </div>
  );
}
