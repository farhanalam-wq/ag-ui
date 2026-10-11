"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ChartLineUp,
  Flask,
  CheckCircle,
  WarningCircle,
  Funnel,
  ShieldCheck,
  ArrowRight,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import { StudioShell } from "@/components/studio-shell";
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
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { useSelectedCompany } from "@/stores/use-company-store";
import { getOverviewMock } from "@/mocks/overview";

const trendConfig = {
  assisted: { label: "Assisted", color: "hsl(var(--chart-1))" },
  baseline: { label: "Baseline", color: "hsl(var(--chart-7))" },
} satisfies ChartConfig;

function Sparkline({ data, id }: { data: number[]; id: string }) {
  const points = data.map((v, i) => ({ i, v }));
  return (
    <ChartContainer
      config={{ v: { label: "Trend", color: "hsl(var(--chart-1))" } }}
      className="h-8 w-full"
    >
      <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <Area
          dataKey="v"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          stroke="var(--color-v)"
          fill="var(--color-v)"
          fillOpacity={0.15}
        />
      </AreaChart>
    </ChartContainer>
  );
}

function DeltaPill({ text, good }: { text: string; good: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        good
          ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "rounded-full border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300"
      }
    >
      {text}
    </Badge>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const company = useSelectedCompany();
  const data = useMemo(
    () => (company ? getOverviewMock(company.id, company.name) : null),
    [company?.id, company?.name]
  );

  return (
    <StudioShell crumbs={[{ label: "Overview" }]}>
      <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Overview
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Demand, conversion, and what your assistant still can&apos;t answer.
          </p>
        </div>
      </div>

      {!data ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ChartLineUp className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium">No company selected</p>
          <p className="mt-1 text-sm text-muted-foreground max-w-[45ch]">
            Add a company to see its demand, conversions, and blindspots here.
          </p>
          <Button className="mt-4" onClick={() => router.push("/knowledge/ingest")}>
            Ingest a site
          </Button>
        </div>
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          {/* Hero: assisted conversion lift */}
          <Card className="min-w-0">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardDescription>Agent-assisted conversion rate</CardDescription>
                <DeltaPill text={`+${data.hero.deltaPp}pp vs baseline`} good />
              </div>
              <div className="flex items-baseline gap-3">
                <span className="font-sans text-4xl font-semibold tabular-nums tracking-tight">
                  {data.hero.assistedRate}%
                </span>
                <span className="font-sans text-sm tabular-nums text-muted-foreground">
                  baseline {data.hero.baselineRate}%
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={trendConfig} className="h-[260px] w-full">
                <AreaChart data={data.demandTrend} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="d"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    minTickGap={24}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    width={40}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area
                    dataKey="assisted"
                    strokeWidth={2}
                    dot={false}
                    stroke="var(--color-assisted)"
                    fill="var(--color-assisted)"
                    fillOpacity={0.18}
                  />
                  <Area
                    dataKey="baseline"
                    fill="none"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    stroke="var(--color-baseline)"
                  />
                </AreaChart>
              </ChartContainer>
              <p className="mt-2 text-sm text-muted-foreground">{data.hero.caption}</p>
            </CardContent>
          </Card>

          {/* Compact KPIs */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {data.kpis.map((kpi) => (
              <Card key={kpi.id}>
                <CardContent className="pt-5">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="font-sans text-[28px] leading-8 font-semibold tabular-nums tracking-tight">
                      {kpi.value}
                    </span>
                    <DeltaPill text={kpi.delta} good={kpi.deltaGood} />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{kpi.insight}</p>
                  <Sparkline data={kpi.spark} id={kpi.id} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Funnel: where the chain leaks */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Funnel className="size-4 text-muted-foreground" aria-hidden="true" />
                <CardTitle className="text-base">Visitor → outcome funnel</CardTitle>
              </div>
              <CardDescription>
                Biggest drop-off: {data.funnelDropout} — the one leak worth fixing first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.funnel.map((stage) => (
                <div key={stage.stage} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                  <span className="truncate text-sm">{stage.stage}</span>
                  <span className="font-sans text-sm tabular-nums">
                    {stage.count.toLocaleString()}
                  </span>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-[hsl(var(--chart-1))]"
                      style={{ width: `${Math.max(stage.pctOfTop, 2)}%` }}
                    />
                  </div>
                  <span className="font-sans text-xs tabular-nums text-muted-foreground">
                    {stage.stageConversion === null ? "100%" : `${stage.stageConversion}%`}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Demand split 2:1 */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Demand trend</CardTitle>
                <CardDescription>Assisted vs baseline sessions over the last 14 days.</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={trendConfig} className="h-[220px] w-full">
                  <AreaChart data={data.demandTrend} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="d"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      minTickGap={32}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                      width={40}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Area
                      dataKey="assisted"
                      strokeWidth={2}
                      dot={false}
                      stroke="var(--color-assisted)"
                      fill="var(--color-assisted)"
                      fillOpacity={0.18}
                    />
                    <Area
                      dataKey="baseline"
                      fill="none"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                      stroke="var(--color-baseline)"
                    />
                  </AreaChart>
                </ChartContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Intent breakdown</CardTitle>
                <CardDescription>Where high-intent demand concentrates.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.intentBreakdown.map((slice) => (
                  <div key={slice.intent}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{slice.intent}</span>
                      <span className="font-sans tabular-nums text-muted-foreground">
                        {slice.share}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-1.5 rounded-full bg-[hsl(var(--chart-1))]"
                        style={{ width: `${slice.share}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Trust strip */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 pt-5 md:grid-cols-4">
              <div>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5" aria-hidden="true" />
                  Grounded answers
                </p>
                <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight">
                  {data.trust.groundedCoverage}%
                </p>
                <p className="text-xs text-muted-foreground">turns with sources</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Fallback rate</p>
                <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight">
                  {data.trust.fallbackRate}%
                </p>
                <p className="text-xs text-muted-foreground">answers without grounding</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Latency p50 / p95</p>
                <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight">
                  {(data.trust.latencyP50 / 1000).toFixed(1)}s
                  <span className="text-sm font-normal text-muted-foreground">
                    {" "}/ {(data.trust.latencyP95 / 1000).toFixed(1)}s
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">time to first token</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Citation clicks</p>
                <p className="mt-1 font-sans text-2xl font-semibold tabular-nums tracking-tight">
                  {data.trust.citationCtr}%
                </p>
                <p className="text-xs text-muted-foreground">of responses with sources</p>
              </div>
            </CardContent>
          </Card>

          {/* Blindspots + health */}
          <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="min-w-0 lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Blindspots</CardTitle>
                <CardDescription>
                  High-intent questions the assistant answers weakly — each one is a doc fix or a Signal.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.blindspots.map((row) => (
                  <div key={row.query} className="border-b pb-4 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{row.query}</p>
                      <Badge variant="outline" className="shrink-0 rounded-full">
                        {row.intent}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{row.evidence}</p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-sans text-xs tabular-nums text-muted-foreground">
                        {row.volume} sessions · {row.confidence}% confidence
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => router.push(row.nextHref)}
                      >
                        {row.nextStep}
                        <ArrowRight className="size-3.5" data-icon="inline-end" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Knowledge health</CardTitle>
                <CardDescription>Is the assistant running on fresh knowledge?</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Snapshot</span>
                  <span className="font-sans tabular-nums">{data.health.snapshotVersion}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Crawl</span>
                  <span className="inline-flex items-center gap-1.5">
                    {data.health.crawlStatus === "READY" ? (
                      <CheckCircle className="size-4 text-emerald-500" aria-hidden="true" />
                    ) : (
                      <WarningCircle className="size-4 text-amber-500" aria-hidden="true" />
                    )}
                    {data.health.crawlStatus} · {data.health.lastCrawl}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Script ping</span>
                  <span className="font-sans tabular-nums">
                    {data.health.scriptLive ? `${data.health.pingMs}ms` : "offline"}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  <Flask className="size-4 shrink-0" aria-hidden="true" />
                  Preview data — live analytics wire up next.
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
      </div>
    </StudioShell>
  );
}
