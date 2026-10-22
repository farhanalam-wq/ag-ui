"use client";

import { useState } from "react";
import { ListBullets } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
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
import { apiClient, type BreakdownRow } from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { FreshnessBadge } from "@/components/analytics/freshness-badge";
import { MetricStory } from "@/components/analytics/metric-story";

export default function ContentAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");
  const { data, loading, loadError, refreshKey, setRefreshKey } = useCompanyReport(
    company,
    (companyId) => apiClient.analytics.content(companyId, range),
    [range]
  );

  const splitTable = (title: string, desc: string, rows: BreakdownRow[], mono: boolean) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        <CardDescription className="text-xs">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="py-3 text-[13px] text-muted-foreground">No content traffic in this range.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.label}>
                  <TableCell className={`max-w-[280px] truncate text-xs ${mono ? "font-mono" : ""}`}>{r.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.pageviews.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sessions.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Content" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Content
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Which pages and titles earn attention, and from which channels and
            devices.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessBadge freshness={data?.freshness} />
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
            <p className="text-sm font-medium">Content analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRefreshKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Select a company to see its content.</p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              { label: "Views", value: Number(data.totals.pageviews ?? 0).toLocaleString() },
              { label: "Sessions", value: Number(data.totals.sessions ?? 0).toLocaleString() },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-5">
                  <p className="text-[13px] text-muted-foreground">{k.label}</p>
                  <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">{k.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {splitTable("Pages", "Views and sessions by path.", data.breakdowns.path, true)}
            {splitTable("Page titles", "document.title captured by the tracker.", data.breakdowns.title, false)}
            {splitTable("Channels", "Which channels read which content.", data.breakdowns.channel, false)}
            {splitTable("Devices", "Desktop vs mobile readership.", data.breakdowns.device, false)}
          </div>

          <MetricStory metrics={["pageviews", "sessions", "scrolls", "downloads", "clicks"]} />
          <DataQualityNote notes={data.freshness.notes} />

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ListBullets className="size-3.5" aria-hidden="true" />
            Humans only — bot traffic is flagged at write time and excluded
            from every report. Totals refresh on the 15-minute rollup.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
