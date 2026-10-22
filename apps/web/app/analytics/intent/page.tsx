"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair } from "@phosphor-icons/react";
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

const IntentRadar = dynamic(
  () => import("../../overview-charts").then((m) => m.IntentRadarChart),
  {
    ssr: false,
    loading: () => <Skeleton className="min-h-[280px] w-full flex-1" />,
  }
);

export default function IntentAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("14d");
  const { data, loading, loadError } = useCompanyReport(
    company,
    (companyId) => apiClient.analytics.overview(companyId, range),
    [range]
  );

  const radarData = useMemo(
    () =>
      (data?.intentBreakdown ?? []).slice(0, 5).map((s) => ({
        intent: s.intent.split(" ")[0] ?? s.intent,
        full: s.intent,
        share: s.share,
      })),
    [data]
  );

  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Intent" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Intent
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            What visitors want, classified from their own words — plus the
            questions the assistant answers poorly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
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
              <option value="14d">Last 14 days</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
        </div>
      </div>

      {!data ? (
        loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-[280px] w-full" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-[60ch] rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center"
          >
            <p className="text-sm font-medium">Intent analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {loadError}
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Select a company to see its intent demand.
          </p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="min-w-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px] font-semibold">Breakdown</CardTitle>
                <CardDescription className="text-[13px]">
                  Sessions per detected intent.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.intentBreakdown.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">
                    No conversations yet.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Intent</TableHead>
                        <TableHead className="text-right">Share</TableHead>
                        <TableHead className="text-right">Sessions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.intentBreakdown.map((s) => (
                        <TableRow key={s.intent}>
                          <TableCell className="font-medium">{s.intent}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.share}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {s.sessions.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
            <Card className="flex min-w-0 flex-col lg:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px] font-semibold">
                  Demand concentration
                </CardTitle>
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <IntentRadar radarData={radarData} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-[15px] font-semibold">Blindspots</CardTitle>
              <CardDescription className="text-[13px]">
                Repeated questions answered with low confidence — content gaps
                worth closing first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.blindspots.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  No repeated gaps detected.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Question</TableHead>
                      <TableHead>Intent</TableHead>
                      <TableHead className="text-right">Miss rate</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.blindspots.map((b) => (
                      <TableRow key={b.query}>
                        <TableCell className="max-w-[320px] truncate text-[13px]">
                          {b.query}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {b.intent}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {b.confidence}%
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {b.volume}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Crosshair className="size-3.5" aria-hidden="true" />
            Intents come from the buyer vocabulary — whole-word matched, no model calls.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
