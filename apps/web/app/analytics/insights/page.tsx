"use client";

import { useState } from "react";
import { Eye } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import { apiClient } from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { FreshnessBadge } from "@/components/analytics/freshness-badge";
import { MetricStory } from "@/components/analytics/metric-story";

const OPP_STYLE: Record<string, string> = {
  high: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  watch: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "insufficient-data": "",
};

export default function InsightsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("14d");
  const { data, loading, loadError, refreshKey, setRefreshKey } = useCompanyReport(
    company,
    (companyId) => apiClient.analytics.insights(companyId, range),
    [range]
  );
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Insights" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">Insights</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Quality, opportunity, journeys, and anomalies — computed from
            measured data. Correlations are shown as context, never as proven
            causes.
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
              <option value="14d">Last 14 days</option>
              <option value="30d">Last 30 days</option>
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
            <p className="text-sm font-medium">Insights unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{loadError}</p>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRefreshKey((k) => k + 1)}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">Select a company to see its insights.</p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          {data.anomalies.length > 0 && (
            <div className="space-y-3">
              {data.anomalies.map((a, i) => (
                <Card key={`${a.metric}-${a.day}-${i}`} className="border-amber-500/30">
                  <CardContent className="pt-5 text-sm">
                    <p className="font-medium">
                      {a.direction === "spike" ? "Spike" : "Dip"} in {a.metric} on {a.day}:{" "}
                      <span className="tabular-nums">
                        {a.observed.toLocaleString()} vs {a.expected.toLocaleString()} expected (z={a.z})
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Baseline {a.baselineWindow}. {a.note}</p>
                    {a.context.length > 0 && (
                      <p className="mt-2 font-mono text-xs text-muted-foreground">
                        Context: {a.context.map((c) => `${c.label} (${c.pageviews.toLocaleString()} views)`).join(", ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[15px]">Traffic Quality Matrix</CardTitle>
              <CardDescription className="text-xs">
                Score 0–100 (50% interaction share, 30% non-bounce share, 20% depth). A session active in two channels
                counts in both — see channel-overlap note.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.qualityMatrix.map((r) => (
                    <TableRow key={r.channel}>
                      <TableCell className="text-xs">{r.channel}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.sessions.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.qualityScore}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {r.confidence === "high" ? "high" : `low (<${data.thresholds.minChannelSessions} sessions)`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Landing Page Opportunity Map</CardTitle>
                <CardDescription className="text-xs">Entry paths ranked by fix potential.</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Page</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Signal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.opportunityMap.map((r) => (
                      <TableRow key={r.path} title={r.reason}>
                        <TableCell className="max-w-[200px] truncate font-mono text-xs">{r.path}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.sessions.toLocaleString()}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={`rounded-full font-normal ${OPP_STYLE[r.opportunity] ?? ""}`}>
                            {r.opportunity}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">Content Journey Explorer</CardTitle>
                <CardDescription className="text-xs">Top entry → next-page pairs (second step only).</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {data.journeys.length === 0 ? (
                  <p className="py-3 text-[13px] text-muted-foreground">
                    No repeated two-step journeys in this range (pairs need {data.thresholds.minJourneyCount}+ occurrences).
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>From → to</TableHead>
                        <TableHead className="text-right">Journeys</TableHead>
                        <TableHead className="text-right">Of entry</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.journeys.map((j) => (
                        <TableRow key={`${j.from}→${j.to}`}>
                          <TableCell className="font-mono text-xs">
                            {j.from} → {j.to}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{j.journeys.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{Math.round(j.shareOfEntry * 100)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <MetricStory metrics={["sessions", "pageviews"]} />
          <DataQualityNote notes={data.freshness.notes} />

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="size-3.5" aria-hidden="true" />
            Gates: channels and landings need {data.thresholds.minChannelSessions}+ sessions for full confidence;
            anomalies need {data.thresholds.anomalyMinDaily}+ daily baseline volume at |z| ≥ {data.thresholds.anomalyZ}.
            Numbers refresh on the 15-minute rollup.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
