"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Globe, Lightning } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient, type WebsiteAnalytics, type RealtimeSnapshot } from "@/lib/api-client";
import { type Range } from "@/lib/analytics";

const TrafficTrendChart = dynamic(
  () => import("../../overview-charts").then((m) => m.MonitoringTrendChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full" />,
  }
);

export default function WebsiteAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<WebsiteAnalytics | null>(null);
  const [live, setLive] = useState<RealtimeSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveAt, setLiveAt] = useState<string | null>(null);

  useEffect(() => {
    if (!company) {
      setData(null);
      setLive(null);
      setLiveAt(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    Promise.all([
      apiClient.analytics.website(company.id, range),
      apiClient.analytics.realtime(company.id),
    ])
      .then(([w, r]) => {
        if (!cancelled) {
          setData(w);
          setLive(r);
          setLiveAt(new Date().toLocaleTimeString());
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [company?.id, range, refreshKey]);

  // Live strip polls on its own clock (30s): cheap 30-min window read behind
  // a 15s endpoint cache. Main analytics intentionally do NOT poll — they
  // move on the worker's 15-min rollup tick, so re-fetching them faster
  // would only burn DB for identical numbers.
  useEffect(() => {
    if (!company) return;
    const id = window.setInterval(() => {
      apiClient.analytics
        .realtime(company.id)
        .then((r) => {
          setLive(r);
          setLiveAt(new Date().toLocaleTimeString());
        })
        .catch(() => {
          /* transient — next tick retries, strip keeps last values */
        });
    }, 30_000);
    return () => window.clearInterval(id);
  }, [company?.id]);

  const demand = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        d: t.d.slice(5),
        assisted: t.pageviews,
        baseline: t.sessions,
      })),
    [data]
  );
  const maxViewport = useMemo(
    () => Math.max(1, ...(data?.viewports.map((v) => v.views) ?? [1])),
    [data]
  );

  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Website" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Website
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Human traffic from the on-site tracker. Bots are filtered at write
            time, never at query time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && !data.dataQuality.includes("tracking-off") && (
            <Badge
              variant="outline"
              className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
            >
              Live
            </Badge>
          )}
          <label className="inline-flex h-8 items-center rounded-md border px-2 text-[13px] text-muted-foreground">
            Range
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              aria-label="Date range"
              className="ml-2 h-full bg-transparent pr-1 text-[13px] text-foreground focus:outline-none"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </Button>
        </div>
      </div>

      {!data ? (
        loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[280px] w-full" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-[60ch] rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center"
          >
            <p className="text-sm font-medium">Website analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Retry
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Select a company to see its traffic.
          </p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          {live && (live.views > 0 || live.sessions > 0) && (
            <Card className="border-violet-500/30">
              <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5 text-sm">
                <span className="inline-flex items-center gap-2 font-medium">
                  <Lightning className="size-4 text-violet-500" aria-hidden="true" />
                  Last 30 min
                </span>                <span className="tabular-nums">
                  <strong>{live.views.toLocaleString()}</strong>{" "}
                  <span className="text-muted-foreground">views</span>
                </span>
                <span className="tabular-nums">
                  <strong>{live.sessions.toLocaleString()}</strong>{" "}
                  <span className="text-muted-foreground">sessions</span>
                </span>
                {live.topPaths[0] && (
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    Top: {live.topPaths[0].path} ({live.topPaths[0].views})
                  </span>
                )}
                {liveAt && (
                  <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                    Updated {liveAt} · refreshes every 30s
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "Sessions", value: data.totals.sessions.toLocaleString() },
              {
                label: "Unique visitors",
                value:
                  data.totals.uniques !== null
                    ? data.totals.uniques.toLocaleString()
                    : "—",
              },
              { label: "Pageviews", value: data.totals.pageviews.toLocaleString() },
              { label: "Conversions", value: data.totals.conversions.toLocaleString() },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-5">
                  <p className="text-[13px] text-muted-foreground">{k.label}</p>
                  <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                    {k.value}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          {data.totals.uniques === null && (
            <p className="text-xs text-muted-foreground">
              Unique-visitor estimates need a day of tracked traffic.
            </p>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-semibold">Traffic</CardTitle>
              <CardDescription className="text-[13px]">
                Pageviews (solid) vs sessions (dashed) per day.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TrafficTrendChart demand={demand} refreshKey={refreshKey} />
            </CardContent>
          </Card>

          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px] font-semibold">Top pages</CardTitle>
              </CardHeader>
              <CardContent>
                {data.topPages.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No pageviews yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">Views</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.topPages.map((r) => (
                        <TableRow key={r.label}>
                          <TableCell className="max-w-[280px] truncate font-mono text-xs">
                            {r.label}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.views.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px] font-semibold">Top referrers</CardTitle>
              </CardHeader>
              <CardContent>
                {data.referrers.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">No referrers yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Referrer</TableHead>
                        <TableHead className="text-right">Views</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.referrers.map((r) => (
                        <TableRow key={r.label}>
                          <TableCell className="max-w-[280px] truncate font-mono text-xs">
                            {r.label}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {r.views.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-semibold">Viewports</CardTitle>
              <CardDescription className="text-[13px]">
                Screen sizes behind the traffic — size the widget and pages for the leftmost bars.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.viewports.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">No data yet.</p>
              ) : (
                data.viewports.map((v) => (
                  <div key={v.label} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 font-mono tabular-nums">{v.label}</span>
                    <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[hsl(var(--chart-1))]"
                        style={{ width: `${Math.max(2, (v.views / maxViewport) * 100)}%` }}
                      />
                    </div>
                    <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                      {v.views.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {data.dataQuality.includes("tracking-off") && (
            <p className="text-[13px] text-muted-foreground">
              No tracked traffic in this range. Add <code>data-track="on"</code> to
              the embed snippet to start measuring.
            </p>
          )}
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Globe className="size-3.5" aria-hidden="true" />
            Humans only — bot traffic is filtered at write time. Totals refresh
            on the 15-minute rollup; the strip above is live within ~30s.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
