"use client";

/**
 * Analytics → Website, Overview.
 *
 * One question: is the site being read, and by whom? Sessions and views say
 * how much, engagement rate and time say how deeply, and bounce rate says how
 * often the first page was also the last. The breakdowns underneath name the
 * pages, the referrers and the screen sizes behind those numbers.
 *
 * Everything here comes from the same rollup the other Website tabs read, so
 * "Sessions" cannot differ between this tab and Content. The live strip is the
 * one exception: it is the raw counter, and it says so.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Globe } from "@phosphor-icons/react";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient } from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";
import { AnalyticsSurface, type SurfaceStatus } from "@/components/analytics/analytics-surface";
import { BarList } from "@/components/analytics/bar-list";
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

export default function WebsiteAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");
  const { data, loading, loadError, refreshKey, setRefreshKey } =
    useCompanyReport(
      company,
      (companyId) => apiClient.analytics.website(companyId, range),
      [range]
    );

  const status: SurfaceStatus = !company
    ? "empty"
    : loadError
      ? "error"
      : loading && !data
        ? "loading"
        : "ready";

  const trend = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        d: t.d,
        pageviews: t.pageviews,
        sessions: t.sessions,
      })),
    [data]
  );

  const uniquesMissing = data ? data.totals.uniques === undefined : false;

  return (
    <AnalyticsSurface
      crumbs={[{ label: "Analytics" }, { label: "Website" }]}
      title="Website"
      subtitle="Human traffic from the on-site tracker. Bots are filtered at write time, never at query time."
      freshness={data?.freshness}
      range={range}
      onRangeChange={setRange}
      onRefresh={() => setRefreshKey((k) => k + 1)}
      status={status}
      error={loadError}
      onRetry={() => setRefreshKey((k) => k + 1)}
      emptyMessage="Select a company to see its traffic."
    >
      {data && company && (
        <div className="space-y-4">
          <RealtimeStrip companyId={company.id} />

          <MetricGrid
            columns={6}
            items={[
              { id: "sessions", value: data.totals.sessions },
              {
                id: "uniques",
                value: data.totals.uniques,
                hint: uniquesMissing ? "Not computable for this range." : undefined,
              },
              { id: "pageviews", value: data.totals.pageviews },
              { id: "engagementRate", value: data.totals.engagementRate },
              {
                id: "avgEngagementTime",
                value: data.totals.avgEngagementTime,
              },
              { id: "bounceRate", value: data.totals.bounceRate },
            ]}
          />

          <TrendCard
            title="Traffic"
            description="Pageviews (solid) vs sessions (dashed) per day."
          >
            <TrafficTrendChart data={trend} refreshKey={refreshKey} />
          </TrendCard>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <BreakdownTable
              title="Top pages"
              labelHeader="Path"
              rows={data.breakdowns.path}
              columns={[{ key: "pageviews", label: "Views", mono: true }]}
              empty="No pageviews in this range."
            />
            <BreakdownTable
              title="Top referrers"
              labelHeader="Referrer"
              rows={data.breakdowns.referrer}
              columns={[{ key: "pageviews", label: "Views", mono: true }]}
              empty="No referrers in this range."
            />
          </div>

          <BarList
            title="Viewports"
            description="Screen sizes behind the traffic — size the widget and pages for the leftmost bars."
            rows={data.breakdowns.viewport.map((v) => ({
              label: v.label,
              value: v.pageviews,
            }))}
          />

          {data.freshness.dataQuality.includes("tracking-off") && (
            <p className="text-[13px] text-muted-foreground">
              No tracked traffic in this range. Add <code>data-track="on"</code>{" "}
              to the embed snippet to start measuring.
            </p>
          )}

          <MetricStory
            metrics={[
              "sessions",
              "uniques",
              "pageviews",
              "engagementRate",
              "avgEngagementTime",
              "bounceRate",
            ]}
          />
          <DataQualityNote notes={data.freshness.notes} />
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" aria-hidden="true" />
            Humans only — bot traffic is flagged at write time and excluded from
            every report. Totals refresh on the 15-minute rollup; the strip
            above is live within ~30s.
          </p>
        </div>
      )}
    </AnalyticsSurface>
  );
}
