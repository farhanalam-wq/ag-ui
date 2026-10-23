"use client";

/**
 * Website → Acquisition.
 *
 * Where the traffic came from, decided on-site: referrer host plus UTM tags.
 * No third-party audience data, and no Organic Search bucket — the tag cannot
 * tell dark organic from direct, so search-engine referrers stay under
 * Referral with the host preserved (D6). Saying that on the tab is cheaper than
 * explaining a missing row later.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { ChartLine } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { AcquisitionAnalytics } from "@/lib/api-client";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { formatDelta } from "@/components/analytics/format";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { TrendCard } from "@/components/analytics/trend-card";

const TrafficTrendChart = dynamic(
  () =>
    import("@/components/analytics/traffic-trend-chart").then(
      (m) => m.TrafficTrendChart
    ),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> }
);

const ALL_CHANNELS = [
  "Direct",
  "Organic Social",
  "Campaign",
  "Email",
  "Referral",
];

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
  const trend = useMemo(
    () =>
      data.trend.map((t) => ({
        d: t.d,
        pageviews: t.pageviews,
        sessions: t.sessions,
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
            hint: formatDelta(data.totals.sessions, data.previousTotals?.sessions) ?? undefined,
          },
          {
            id: "uniques",
            value: data.totals.uniques,
            hint:
              formatDelta(data.totals.uniques, data.previousTotals?.uniques) ??
              undefined,
          },
          {
            id: "pageviews",
            value: data.totals.pageviews,
            hint:
              formatDelta(
                data.totals.pageviews,
                data.previousTotals?.pageviews
              ) ?? undefined,
          },
        ]}
      />

      <TrendCard
        title="Traffic trend"
        description="Views vs sessions per day."
      >
        <TrafficTrendChart data={trend} refreshKey={refreshKey} />
      </TrendCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Channels"
          description="Direct, Organic Social, Campaign, Email, Referral — derived on-site."
          rows={data.breakdowns.channel}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
        />
        <BreakdownTable
          title="Source / medium"
          description="UTM source/medium, else the referrer host."
          rows={data.breakdowns.sourceMedium}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
        />
        <BreakdownTable
          title="Campaigns"
          description="utm_campaign values; (not set) means untagged."
          rows={data.breakdowns.campaign}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
        />
        <BreakdownTable
          title="Landing pages"
          description="The entry path of each session."
          rows={data.breakdowns.landingPage}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
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
