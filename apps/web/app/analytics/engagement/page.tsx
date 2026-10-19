"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Smiley } from "@phosphor-icons/react";
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
import { apiClient } from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";

const TrafficTrendChart = dynamic(
  () => import("../../overview-charts").then((m) => m.MonitoringTrendChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full" />,
  }
);

export default function EngagementAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");
  const { data, loading, loadError, refreshKey, setRefreshKey } = useCompanyReport(
    company,
    (companyId) => apiClient.analytics.engagement(companyId, range),
    [range]
  );

  const demand = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        d: t.d.slice(5),
        assisted: t.engagedSessions,
        baseline: t.sessions,
      })),
    [data]
  );

  const t = data?.totals ?? {};

  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Engagement" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Engagement
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            How visitors interact once they arrive: engaged sessions, active
            time, scrolls, downloads, and configured clicks.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && !data.freshness.dataQuality.includes("tracking-off") && (
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
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRefreshKey((k) => k + 1)}>
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
            <p className="text-sm font-medium">Engagement analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRefreshKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Select a company to see its engagement.</p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "Views", value: Number(t.pageviews ?? 0).toLocaleString() },
              { label: "Sessions", value: Number(t.sessions ?? 0).toLocaleString() },
              { label: "Engaged sessions", value: Number(t.engagedSessions ?? 0).toLocaleString() },
              { label: "Engagement rate", value: `${Number(t.engagementRate ?? 0)}%` },
              { label: "Avg. active time", value: `${Number(t.avgEngagementTime ?? 0)}s` },
              { label: "Scrolls", value: Number(t.scrolls ?? 0).toLocaleString() },
              { label: "Downloads", value: Number(t.downloads ?? 0).toLocaleString() },
              { label: "Configured clicks", value: Number(t.clicks ?? 0).toLocaleString() },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-5">
                  <p className="text-[13px] text-muted-foreground">{k.label}</p>
                  <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Engagement trend</CardTitle>
              <CardDescription className="text-xs">Engaged vs total sessions per day.</CardDescription>
            </CardHeader>
            <CardContent>
              <TrafficTrendChart demand={demand} refreshKey={refreshKey} />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Pages</CardTitle>
                <CardDescription className="text-xs">Views and sessions by path.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Path</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byPath.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.pageviews.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sessions.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Devices</CardTitle>
                <CardDescription className="text-xs">Desktop vs mobile from viewport width.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead className="text-right">Views</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byDevice.map((r) => (
                      <TableRow key={r.label}>
                        <TableCell className="text-xs">{r.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.pageviews.toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sessions.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Smiley className="size-3.5" aria-hidden="true" />
            Engaged means 2+ pageviews or any chat interaction. Active time
            comes from 15s heartbeats while the tab is visible and the visitor
            is active. Totals refresh on the 15-minute rollup.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
