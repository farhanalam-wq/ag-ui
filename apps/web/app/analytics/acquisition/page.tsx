"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ChartLine } from "@phosphor-icons/react";
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

const ALL_CHANNELS = ["Direct", "Organic Social", "Campaign", "Email", "Referral"];

function delta(cur: number, prev?: number): string | null {
  if (prev === undefined || prev <= 0) return null;
  const p = ((cur - prev) / prev) * 100;
  const sign = p > 0 ? "+" : "";
  return `${sign}${Math.round(p * 10) / 10}% vs prev`;
}

export default function AcquisitionAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");
  const [compare, setCompare] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);
  const { data, loading, loadError, refreshKey, setRefreshKey } = useCompanyReport(
    company,
    (companyId) =>
      apiClient.analytics.acquisition(companyId, range, {
        compare,
        channels: channels.length > 0 ? channels : undefined,
      }),
    [range, compare, channels.join(",")]
  );

  const demand = useMemo(
    () =>
      (data?.trend ?? []).map((t) => ({
        d: t.d.slice(5),
        assisted: t.pageviews,
        baseline: t.sessions,
      })),
    [data]
  );

  const toggleChannel = (c: string) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const breakdownTable = (title: string, desc: string, rows: { label: string; pageviews: number; sessions: number }[]) => (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[15px]">{title}</CardTitle>
        <CardDescription className="text-xs">{desc}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        {rows.length === 0 ? (
          <p className="py-3 text-[13px] text-muted-foreground">No attributed traffic in this range.</p>
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
                  <TableCell className="max-w-[280px] truncate font-mono text-xs">{r.label}</TableCell>
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
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Acquisition" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Acquisition
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Where human traffic comes from: first-party channels from referrer
            plus UTM tags. No third-party data involved.
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
          <Button
            variant={compare ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setCompare((c) => !c)}
            title="Compare against the previous equal-length period"
          >
            Compare
          </Button>
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
            <p className="text-sm font-medium">Acquisition analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRefreshKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Select a company to see its acquisition.</p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm">
              <span className="inline-flex items-center gap-2 font-medium">
                <ChartLine className="size-4 text-muted-foreground" aria-hidden="true" />
                Channels
              </span>
              {ALL_CHANNELS.map((c) => (
                <label key={c} className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]">
                  <input
                    type="checkbox"
                    checked={channels.includes(c)}
                    onChange={() => toggleChannel(c)}
                    className="size-3.5 accent-current"
                  />
                  {c}
                </label>
              ))}
              {channels.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setChannels([])}>
                  Clear
                </Button>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {[
              { label: "Sessions", value: (data.totals.sessions ?? 0).toLocaleString(), d: delta(data.totals.sessions ?? 0, data.previousTotals?.sessions) },
              {
                label: "Unique visitors",
                value: data.totals.uniques != null ? Number(data.totals.uniques).toLocaleString() : "—",
                d: delta(Number(data.totals.uniques ?? 0), data.previousTotals?.uniques),
              },
              { label: "Views", value: (data.totals.pageviews ?? 0).toLocaleString(), d: delta(data.totals.pageviews ?? 0, data.previousTotals?.pageviews) },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-5">
                  <p className="text-[13px] text-muted-foreground">{k.label}</p>
                  <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">{k.value}</p>
                  {k.d && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{k.d}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Traffic trend</CardTitle>
              <CardDescription className="text-xs">Views vs sessions per day.</CardDescription>
            </CardHeader>
            <CardContent>
              <TrafficTrendChart demand={demand} refreshKey={refreshKey} />
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            {breakdownTable("Channels", "Direct, Organic Social, Campaign, Email, Referral — derived on-site.", data.byChannel)}
            {breakdownTable("Source / medium", "UTM source/medium, else referrer host.", data.bySourceMedium)}
            {breakdownTable("Campaigns", "utm_campaign values; (not set) means untagged.", data.byCampaign)}
            {breakdownTable("Landing pages", "Entry path of each session.", data.byLandingPage)}
          </div>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ChartLine className="size-3.5" aria-hidden="true" />
            Totals refresh on the 15-minute rollup. Search-engine referrers
            report under Referral — there is no Organic Search bucket
            first-party, by design.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
