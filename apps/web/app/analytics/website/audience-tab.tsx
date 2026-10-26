"use client";

/**
 * Website → Audience.
 *
 * Who the visitors are, as far as a first-party tag can know: device, browser,
 * operating system, and the hour of the day they browse. All four are the same
 * visit grid read four ways, so the numbers add up to the same sessions.
 *
 * The shape each card draws follows its question: viewport width is a
 * distribution over screen size (the histogram the device split is bucketed
 * from), device is composition *and* depth, so it draws two measures per
 * bucket side by side; browser and OS are composition, so they draw one
 * share bar each; hour of day is a distribution over a clock, so its columns
 * run 00:00 → 23:00 in time order, never ranked.
 *
 * Country is deliberately absent — there is no agreed GeoIP source (D12) — and
 * so is new-vs-returning (D3). A tab that pretends otherwise would be the only
 * place in the module where a number had no source.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Users } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AudienceAnalytics } from "@/lib/api-client";
import { CompositionBar } from "@/components/analytics/composition-bar";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { TrendCard } from "@/components/analytics/trend-card";

const ColumnChart = dynamic(
  () =>
    import("@/components/analytics/column-chart").then((m) => m.ColumnChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> }
);

export function AudienceTab({ data }: { data: AudienceAnalytics }) {
  // The hour breakdown is ordered 00:00 → 23:00 by the report: a distribution
  // over the day, not a ranking — so the columns keep that order on screen.
  const hours = useMemo(
    () =>
      data.breakdowns.hour.map((row) => ({
        label: String(row.label),
        sessions: Number(row.sessions ?? 0),
      })),
    [data]
  );
  const devices = useMemo(
    () =>
      data.breakdowns.device.map((row) => ({
        label: String(row.label),
        sessions: Number(row.sessions ?? 0),
        pageviews: Number(row.pageviews ?? 0),
      })),
    [data]
  );
  const toShare = (rows: AudienceAnalytics["breakdowns"]["browser"]) =>
    rows.map((row) => ({ label: row.label, value: Number(row.sessions ?? 0) }));

  return (
    <div className="space-y-4">
      <MetricGrid
        columns={3}
        items={[
          { id: "sessions", value: data.totals.sessions },
          { id: "pageviews", value: data.totals.pageviews },
        ]}
      />

      <TrendCard
        title="Viewport widths"
        description="Views by screen-width bucket, small to large — the distribution the device split is bucketed from."
        footer="Everything left of 768 is what the device rule calls Mobile. Pageview grain; the visit-level split is the Devices chart below."
      >
        <ColumnChart
          data={data.breakdowns.viewportWidth.map((row) => ({
            label: String(row.label),
            pageviews: Number(row.pageviews ?? 0),
          }))}
          series={[
            {
              key: "pageviews",
              label: "Views",
              color: "hsl(var(--chart-5))",
            },
          ]}
        />
      </TrendCard>

      <TrendCard
        title="Devices"
        description="Sessions (blue) vs views (grey) per device — the split, and how deep each kind of visit reads."
        footer="Desktop vs mobile, bucketed from viewport width."
      >
        <ColumnChart
          data={devices}
          series={[
            { key: "sessions", label: "Sessions", color: "hsl(var(--chart-1))" },
            { key: "pageviews", label: "Views", color: "hsl(var(--chart-7))" },
          ]}
        />
      </TrendCard>

      <div className="grid gap-4 xl:grid-cols-2">
        <CompositionBar
          title="Browsers"
          description="Share of sessions. Derived once at the collector, never re-parsed here."
          rows={toShare(data.breakdowns.browser)}
        />
        <CompositionBar
          title="Operating systems"
          description="Share of sessions. The same visit, from the same user agent."
          rows={toShare(data.breakdowns.os)}
        />
      </div>

      <TrendCard
        title="Hour of day"
        description="Sessions by the visitor's local hour, midnight to midnight — a day, not a leaderboard."
      >
        <ColumnChart
          data={hours}
          series={[
            {
              key: "sessions",
              label: "Sessions",
              color: "hsl(var(--chart-1))",
            },
          ]}
        />
      </TrendCard>

      <MetricStory metrics={["sessions", "pageviews"]} />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" aria-hidden="true" />
        {data.timezoneCoverage < 100
          ? `${data.timezoneCoverage}% of visits reported a timezone; the rest are bucketed in UTC.`
          : "Every visit reported a timezone."}{" "}
        No country and no new-vs-returning — neither has a first-party source
        here.
      </p>
    </div>
  );
}
