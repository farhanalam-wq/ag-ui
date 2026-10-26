"use client";

/**
 * Website → Overview.
 *
 * Is the site being read, and by whom? Sessions and views say how much,
 * engagement rate and time say how deeply, bounce rate says how often the
 * first page was also the last. Unusual days sit above the KPI row because
 * they are the one thing a reader should see before the totals.
 */

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { Globe } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import type { WebsiteAnalytics } from "@/lib/api-client";
import { AnomalyCard } from "@/components/analytics/anomaly-card";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { RealtimeStrip } from "@/components/analytics/realtime-strip";
import { TrendCard } from "@/components/analytics/trend-card";

const TrafficTrendChart = dynamic(
  () =>
    import("@/components/analytics/traffic-trend-chart").then(
      (m) => m.TrafficTrendChart
    ),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> }
);

const ColumnChart = dynamic(
  () =>
    import("@/components/analytics/column-chart").then((m) => m.ColumnChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> }
);

export function OverviewTab({
  data,
  companyId,
  refreshKey,
}: {
  data: WebsiteAnalytics;
  companyId: string;
  refreshKey: number;
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
  // Per-day series for the sparklines, derived the same way the totals are.
  // A day with no sessions has no rate — a gap, not a zero.
  const sparklines = useMemo(
    () => ({
      sessions: data.trend.map((t) => t.sessions),
      pageviews: data.trend.map((t) => t.pageviews),
      engagedSessions: data.trend.map((t) => t.engagedSessions),
      engagementRate: data.trend.map((t) =>
        t.sessions > 0 ? (t.engagedSessions / t.sessions) * 100 : null
      ),
      bounceRate: data.trend.map((t) =>
        t.sessions > 0 ? 100 - (t.engagedSessions / t.sessions) * 100 : null
      ),
      pagesPerSession: data.trend.map((t) =>
        t.sessions > 0 ? t.pageviews / t.sessions : null
      ),
    }),
    [data]
  );
  const uniquesMissing = data.totals.uniques === undefined;
  // Viewport labels are "WxH". Width is the axis that matters — sort by it,
  // so the chart reads small → large instead of big → small.
  const viewports = useMemo(
    () =>
      data.breakdowns.viewport
        .map((v) => ({ label: v.label, pageviews: v.pageviews }))
        .sort((a, b) => {
          const wa = parseInt(a.label, 10);
          const wb = parseInt(b.label, 10);
          const na = Number.isFinite(wa) ? wa : Number.MAX_SAFE_INTEGER;
          const nb = Number.isFinite(wb) ? wb : Number.MAX_SAFE_INTEGER;
          return na - nb;
        }),
    [data]
  );

  return (
    <div className="space-y-4">
      <AnomalyCard
        anomalies={data.anomalies}
        thresholds={data.anomalyThresholds}
      />

      <RealtimeStrip companyId={companyId} />

      <MetricGrid
        columns={4}
        items={[
          { id: "sessions", value: data.totals.sessions, sparkline: sparklines.sessions },
          {
            id: "uniques",
            value: data.totals.uniques,
            hint: uniquesMissing ? "Not computable for this range." : undefined,
          },
          { id: "pageviews", value: data.totals.pageviews, sparkline: sparklines.pageviews },
          {
            id: "engagedSessions",
            value: data.totals.engagedSessions,
            sparkline: sparklines.engagedSessions,
          },
          {
            id: "engagementRate",
            value: data.totals.engagementRate,
            sparkline: sparklines.engagementRate,
          },
          {
            id: "bounceRate",
            value: data.totals.bounceRate,
            sparkline: sparklines.bounceRate,
          },
          {
            id: "pagesPerSession",
            value: data.totals.pagesPerSession,
            sparkline: sparklines.pagesPerSession,
          },
          { id: "avgEngagementTime", value: data.totals.avgEngagementTime },
        ]}
      />

      <TrendCard
        title="Traffic"
        description="Pageviews (solid) vs sessions (dashed) per day. Flagged days are the unusual days above — amber spikes, red dips."
      >
        <TrafficTrendChart
          data={trend}
          refreshKey={refreshKey}
          markers={data.anomalies}
        />
      </TrendCard>

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        <BreakdownTable
          title="Top pages"
          labelHeader="Path"
          rows={data.breakdowns.path}
          columns={[{ key: "pageviews", label: "Views", mono: true }]}
          barKey="pageviews"
          empty="No pageviews in this range."
        />
        <BreakdownTable
          title="Top referrers"
          labelHeader="Referrer"
          rows={data.breakdowns.referrer}
          columns={[{ key: "pageviews", label: "Views", mono: true }]}
          barKey="pageviews"
          empty="No referrers in this range."
        />
      </div>

      <TrendCard
        title="Viewports"
        description="Screen widths behind the traffic, small to large — size the widget and pages for the tall columns."
        footer="Widths as the tracker reported them; a viewport that did not parse sits at the right edge."
      >
        <ColumnChart
          data={viewports}
          series={[
            {
              key: "pageviews",
              label: "Views",
              color: "hsl(var(--chart-1))",
            },
          ]}
          refreshKey={refreshKey}
        />
      </TrendCard>

      {data.freshness.dataQuality.includes("tracking-off") && (
        <p className="text-[13px] text-muted-foreground">
          No tracked traffic in this range. Add <code>data-track="on"</code> to
          the embed snippet to start measuring.
        </p>
      )}

      <MetricStory
        metrics={[
          "sessions",
          "uniques",
          "pageviews",
          "engagedSessions",
          "engagementRate",
          "bounceRate",
          "pagesPerSession",
          "avgEngagementTime",
        ]}
      />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="size-3.5" aria-hidden="true" />
        Humans only — bot traffic is flagged at write time and excluded from
        every report. Totals refresh on the 15-minute rollup; the strip above is
        live within ~30s.
      </p>
    </div>
  );
}
