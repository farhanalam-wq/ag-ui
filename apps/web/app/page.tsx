"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChartLineUp,
  Flask,
  CheckCircle,
  WarningCircle,
  Funnel,
  ArrowRight,
  ArrowClockwise,
  ArrowUpRight,
  ChatCircle,
  CircleNotch,
  Code,
  Database,
  Users,
  Info,
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceArea,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const INTENT_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const METRIC_HELP: Record<string, string> = {
  assisted:
    "Share of conversions where the assistant helped, vs visitors who never opened it.",
  grounded:
    "Share of assistant answers that cite a learned source page.",
  blindspot:
    "Share of high intent questions answered with low confidence. Change vs prior 7 days (week over week).",
  intent:
    "Sessions showing buying or research intent. Change vs prior 7 days (week over week).",
};

function MetricInfo({ metric }: { metric: keyof typeof METRIC_HELP }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`What does this metric mean`}
          className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[240px] text-xs">
        {METRIC_HELP[metric]}
      </TooltipContent>
    </Tooltip>
  );
}

function fmtDelta(delta: string) {
  return delta.replace("WoW", "vs prior 7d");
}

export default function OverviewPage() {
  const router = useRouter();
  const company = useSelectedCompany();
  const [range, setRange] = useState<"7" | "14">("14");
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const data = useMemo(
    () => (company ? getOverviewMock(company.id, company.name) : null),
    [company?.id, company?.name]
  );

  const rangeLabel = range === "7" ? "last 7 days" : "last 14 days";

  const demand = useMemo(() => {
    if (!data) return [];
    return range === "7" ? data.demandTrend.slice(-7) : data.demandTrend;
  }, [data, range]);

  const leakStage = useMemo(() => {
    if (!data) return null;
    let worst = data.funnel[1];
    for (const s of data.funnel.slice(1, -1)) {
      if ((s.stageConversion ?? 100) < (worst?.stageConversion ?? 100))
        worst = s;
    }
    return worst?.stage ?? null;
  }, [data]);

  function navigate(href: string) {
    if (pendingHref) return;
    setPendingHref(href);
    router.push(href);
  }

  function NavSpinner() {
    return <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />;
  }

  return (
    <TooltipProvider delayDuration={150}>
      <StudioShell crumbs={[{ label: "Overview" }]}>
        <div className="min-w-0">
          {/* Header: title + global range + status + actions */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
                Project dashboard
              </h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
                Demand, conversion, and blindspots for the selected
                assistant.
              </p>
            </div>
            {data && (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-8 items-center rounded-md border px-2 text-[13px] text-muted-foreground">
                  Range
                  <select
                    value={range}
                    onChange={(e) =>
                      setRange(e.target.value as "7" | "14")
                    }
                    aria-label="Date range for all metrics"
                    className="ml-2 h-full bg-transparent pr-1 text-[13px] text-foreground focus:outline-none"
                  >
                    <option value="14">Last 14 days</option>
                    <option value="7">Last 7 days</option>
                    <option value="custom" disabled>
                      Custom (live analytics)
                    </option>
                  </select>
                </label>
                <Badge
                  variant="outline"
                  className="rounded-full font-normal"
                >
                  <span
                    className={`mr-1.5 size-1.5 rounded-full ${
                      data.health.crawlStatus === "READY"
                        ? "bg-emerald-500"
                        : "bg-amber-500"
                    }`}
                  />
                  {data.health.crawlStatus === "READY"
                    ? "All OK"
                    : data.health.crawlStatus}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingHref !== null}
                  aria-busy={
                    pendingHref === "/integration/embed-snippet"
                  }
                  onClick={() =>
                    navigate("/integration/embed-snippet")
                  }
                >
                  {pendingHref === "/integration/embed-snippet" ? (
                    <NavSpinner />
                  ) : null}
                  Copy embed
                </Button>
                <Button
                  size="sm"
                  disabled={pendingHref !== null}
                  aria-busy={pendingHref === "/knowledge/ingest"}
                  onClick={() => navigate("/knowledge/ingest")}
                >
                  {pendingHref === "/knowledge/ingest" ? (
                    <NavSpinner />
                  ) : null}
                  Ingest site
                </Button>
              </div>
            )}
          </div>

          {!data ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <ChartLineUp
                className="size-8 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">
                No company selected
              </p>
              <p className="mt-1 text-sm text-muted-foreground max-w-[45ch]">
                Add a company to see its demand, conversions, and
                blindspots here.
              </p>
              <Button
                className="mt-4"
                disabled={pendingHref !== null}
                onClick={() => navigate("/knowledge/ingest")}
              >
                {pendingHref === "/knowledge/ingest" ? (
                  <NavSpinner />
                ) : null}
                Ingest a site
              </Button>
            </div>
          ) : (
            <div className="mt-6 min-w-0 space-y-4">
              {/* Starter: 4 action boxes, no outer card */}
              <div>
                <p className="text-[13px] text-muted-foreground">
                  Get started
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      icon: ChatCircle,
                      title: "Test chat",
                      body: "Open the Playground and ask your first pricing question.",
                      href: "/playground",
                    },
                    {
                      icon: Code,
                      title: "Embed snippet",
                      body: "Paste one script tag to add the bubble to any site.",
                      href: "/integration/embed-snippet",
                    },
                    {
                      icon: Database,
                      title: "Review sources",
                      body: "Verify the pages it learned before you share it.",
                      href: "/knowledge/sources",
                    },
                    {
                      icon: Users,
                      title: "Share preview",
                      body: "Send the team a link to try the assistant.",
                      href: "/visitors/leads",
                    },
                  ].map((s) => {
                    const pending = pendingHref === s.href;
                    return (
                      <button
                        key={s.title}
                        onClick={() => navigate(s.href)}
                        disabled={pendingHref !== null}
                        aria-busy={pending}
                        className="group flex min-h-[104px] flex-col justify-start rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/40 disabled:opacity-60"
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                            {pending ? (
                              <NavSpinner />
                            ) : (
                              <s.icon
                                className="size-4 shrink-0 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                            <span className="truncate">{s.title}</span>
                          </span>
                          <ArrowUpRight
                            className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-[hsl(var(--chart-1))]"
                            aria-hidden="true"
                          />
                        </span>
                        <span className="mt-1.5 block text-[13px] leading-5 text-muted-foreground">
                          {s.body}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quota strip: used/limit tnum + dividers + footnote */}
              <Card>
                <CardContent className="pt-5">
                  <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4 md:divide-x md:divide-border">
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                        Assisted rate
                        <MetricInfo metric="assisted" />
                      </div>
                      <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                        {data.hero.assistedRate}%{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          / base {data.hero.baselineRate}%
                        </span>
                      </p>
                    </div>
                    <div className="min-w-0 pr-4 md:px-5">
                      <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                        Grounded answers
                        <MetricInfo metric="grounded" />
                      </div>
                      <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                        {data.trust.groundedCoverage}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          / 100%
                        </span>
                      </p>
                    </div>
                    <div className="min-w-0 pr-4 md:px-5">
                      <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                        Blindspot rate
                        <MetricInfo metric="blindspot" />
                      </div>
                      <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                        {data.kpis[1]?.value}{" "}
                        <span
                          className="text-sm font-normal text-emerald-600"
                          title="Week over week: change vs the prior 7 days"
                        >
                          {fmtDelta(data.kpis[1]?.delta ?? "")}
                        </span>
                      </p>
                    </div>
                    <div className="min-w-0 md:pl-5">
                      <div className="flex items-center gap-1 text-[13px] text-muted-foreground">
                        High-intent sessions
                        <MetricInfo metric="intent" />
                      </div>
                      <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                        {data.kpis[0]?.value}{" "}
                        <span
                          className="text-sm font-normal text-emerald-600"
                          title="Week over week: change vs the prior 7 days"
                        >
                          {fmtDelta(data.kpis[0]?.delta ?? "")}
                        </span>
                      </p>
                    </div>
                  </div>
                  <p className="mt-4 border-t pt-3 text-[13px] text-muted-foreground">
                    Showing {rangeLabel} · Snapshot{" "}
                    {data.health.snapshotVersion} · last crawl{" "}
                    {data.health.lastCrawl} · p50{" "}
                    {(data.trust.latencyP50 / 1000).toFixed(1)}s / p95{" "}
                    {(data.trust.latencyP95 / 1000).toFixed(1)}s.
                    Deltas are week over week, vs the prior 7 days.{" "}
                    <button
                      className="text-[hsl(var(--chart-1))] hover:underline disabled:opacity-60"
                      disabled={pendingHref !== null}
                      onClick={() =>
                        navigate("/knowledge/snapshots")
                      }
                    >
                      Learn more
                    </button>
                    .
                  </p>
                </CardContent>
              </Card>

              {/* Monitoring + Blindspots ledger */}
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="min-w-0 lg:col-span-2">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-[15px] font-semibold">
                        Monitoring
                      </CardTitle>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setRefreshKey((k) => k + 1)}
                        >
                          <ArrowClockwise className="size-3.5" />
                          Refresh
                        </Button>
                        <button
                          className="text-sm text-[hsl(var(--chart-1))] hover:underline disabled:opacity-60"
                          disabled={pendingHref !== null}
                          onClick={() => navigate("/analytics/agent")}
                        >
                          View all metrics
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <ChartContainer
                      key={refreshKey}
                      config={trendConfig}
                      className="h-[280px] w-full"
                    >
                      <AreaChart
                        data={demand}
                        margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
                      >
                        <defs>
                          <linearGradient
                            id="mon-assisted"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="hsl(var(--chart-1))"
                              stopOpacity={0.22}
                            />
                            <stop
                              offset="100%"
                              stopColor="hsl(var(--chart-1))"
                              stopOpacity={0.03}
                            />
                          </linearGradient>
                          <pattern
                            id="mon-hatch"
                            width="6"
                            height="6"
                            patternTransform="rotate(45)"
                            patternUnits="userSpaceOnUse"
                          >
                            <rect
                              width="6"
                              height="6"
                              fill="hsl(var(--muted) / 0.5)"
                            />
                            <line
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="6"
                              stroke="hsl(var(--border))"
                              strokeWidth="1"
                            />
                          </pattern>
                        </defs>
                        <CartesianGrid
                          stroke="hsl(var(--border))"
                          vertical={false}
                        />
                        {demand.length > 0 && (
                          <ReferenceArea
                            x1={demand[0]?.d}
                            x2={demand[1]?.d}
                            fill="url(#mon-hatch)"
                            fillOpacity={0.6}
                          />
                        )}
                        <XAxis
                          dataKey="d"
                          tickLine={false}
                          axisLine={false}
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                          }}
                          minTickGap={32}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{
                            fill: "hsl(var(--muted-foreground))",
                            fontSize: 12,
                          }}
                          width={40}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Area
                          dataKey="assisted"
                          strokeWidth={2}
                          dot={false}
                          stroke="var(--color-assisted)"
                          fill="url(#mon-assisted)"
                        />
                        <Area
                          dataKey="baseline"
                          fill="none"
                          strokeWidth={2}
                          strokeDasharray="5 4"
                          dot={false}
                          stroke="var(--color-baseline)"
                        />
                      </AreaChart>
                    </ChartContainer>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-[2px] bg-[hsl(var(--chart-1))]" />
                        Assisted sessions
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="inline-block h-0 w-3 border-t-2 border-dashed border-[hsl(var(--chart-7))]" />
                        Baseline
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-3 rounded-[2px] border"
                          style={{
                            background:
                              "repeating-linear-gradient(45deg, hsl(var(--muted)) 0 2px, transparent 2px 5px)",
                          }}
                        />
                        Low-traffic window
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] font-semibold">
                      Intent breakdown
                    </CardTitle>
                    <CardDescription className="text-[13px]">
                      High intent demand in {rangeLabel}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {data.intentBreakdown.slice(0, 5).map((slice, i) => (
                      <div key={slice.intent}>
                        <div className="flex items-baseline justify-between gap-2 text-[13px]">
                          <span className="flex min-w-0 items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor:
                                  INTENT_COLORS[
                                    i % INTENT_COLORS.length
                                  ],
                              }}
                            />
                            <span className="truncate">
                              {slice.intent}
                            </span>
                          </span>
                          <span className="shrink-0 font-sans tabular-nums text-muted-foreground">
                            {slice.share}% ·{" "}
                            {slice.sessions.toLocaleString()}
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted">
                          <div
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${slice.share}%`,
                              backgroundColor:
                                INTENT_COLORS[
                                  i % INTENT_COLORS.length
                                ],
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    <button
                      className="text-sm text-[hsl(var(--chart-1))] hover:underline disabled:opacity-60"
                      disabled={pendingHref !== null}
                      onClick={() => navigate("/analytics/intent")}
                    >
                      View intent analytics
                    </button>
                  </CardContent>
                </Card>
              </div>

              {/* Blindspots: full-width ledger for sentence length */}
              <Card className="min-w-0">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-[15px] font-semibold">
                        {data.blindspots.length} Blindspots
                      </CardTitle>
                      <CardDescription className="mt-1 text-[13px]">
                        High intent questions answered weakly in{" "}
                        {rangeLabel}. Each one is a doc fix or a Signal.
                      </CardDescription>
                    </div>
                    <button
                      className="text-sm text-[hsl(var(--chart-1))] hover:underline disabled:opacity-60"
                      disabled={pendingHref !== null}
                      onClick={() =>
                        navigate("/intelligence/intent-radar")
                      }
                    >
                      View all
                    </button>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8 text-xs">
                          Query
                        </TableHead>
                        <TableHead className="h-8 w-[170px] text-xs">
                          Intent
                        </TableHead>
                        <TableHead className="h-8 w-[86px] text-xs">
                          Sessions
                        </TableHead>
                        <TableHead className="h-8 w-[110px] text-right text-xs">
                          Confidence
                        </TableHead>
                        <TableHead className="h-8 w-[64px] text-right text-xs">
                          Fix
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.blindspots.map((row) => {
                        const pending = pendingHref === row.nextHref;
                        return (
                          <TableRow
                            key={row.query}
                            className="cursor-pointer aria-busy:opacity-60"
                            aria-busy={pending}
                            onClick={() => navigate(row.nextHref)}
                          >
                            <TableCell className="max-w-0 py-3">
                              <p className="flex items-center gap-1.5 text-[13px] font-medium">
                                {pending ? <NavSpinner /> : null}
                                <span>{row.query}</span>
                              </p>
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {row.evidence}
                              </p>
                            </TableCell>
                            <TableCell className="py-3">
                              <Badge
                                variant="outline"
                                className="rounded-full font-normal"
                              >
                                {row.intent}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 font-sans text-[13px] tabular-nums">
                              {row.volume}
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <Badge
                                variant="outline"
                                className="rounded-full font-normal"
                              >
                                <span className="mr-1.5 size-1.5 rounded-full bg-amber-500" />
                                {row.confidence}%
                              </Badge>
                            </TableCell>
                            <TableCell className="py-3 text-right text-[13px] text-[hsl(var(--chart-1))]">
                              {row.nextStep}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <Badge
                        variant="outline"
                        className="shrink-0 rounded-full border-violet-500/30 bg-violet-500/10 text-xs font-normal text-violet-700 dark:text-violet-300"
                      >
                        Signals
                      </Badge>
                      <p className="text-[13px] leading-5">
                        No signals from these gaps yet. Turn the top
                        blindspot into a doc fix or a published Signal.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pendingHref !== null}
                      aria-busy={
                        pendingHref === "/intelligence/signals"
                      }
                      onClick={() =>
                        navigate("/intelligence/signals")
                      }
                    >
                      {pendingHref === "/intelligence/signals" ? (
                        <NavSpinner />
                      ) : null}
                      Create a signal
                      <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Funnel + Intent/Health stack */}
              <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className="min-w-0 lg:col-span-2">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Funnel
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <CardTitle className="text-[15px] font-semibold">
                        Visitor to outcome funnel
                      </CardTitle>
                    </div>
                    <CardDescription className="text-[13px]">
                      Biggest drop-off in {rangeLabel}:{" "}
                      {data.funnelDropout}.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {data.funnel.map((stage) => {
                      const isLeak = stage.stage === leakStage;
                      return (
                        <div
                          key={stage.stage}
                          className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 ${
                            isLeak
                              ? "bg-amber-500/8 ring-1 ring-amber-500/25"
                              : ""
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2 truncate text-sm">
                            {stage.stage}
                            {isLeak && (
                              <Badge
                                variant="outline"
                                className="shrink-0 rounded-full border-amber-500/30 bg-amber-500/10 text-[11px] font-normal text-amber-700 dark:text-amber-300"
                              >
                                biggest leak
                              </Badge>
                            )}
                          </span>
                          <span className="font-sans text-sm tabular-nums">
                            {stage.count.toLocaleString()}
                          </span>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className={`h-2 rounded-full ${
                                isLeak
                                  ? "bg-[hsl(var(--chart-3))]"
                                  : "bg-[hsl(var(--chart-1))]"
                              }`}
                              style={{
                                width: `${Math.max(stage.pctOfTop, 2)}%`,
                              }}
                            />
                          </div>
                          <span className="font-sans text-xs tabular-nums text-muted-foreground">
                            {stage.stageConversion === null
                              ? "100%"
                              : `${stage.stageConversion}%`}
                          </span>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                <div className="min-w-0">
                  <Card className="min-w-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[15px] font-semibold">
                        Knowledge health
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          Snapshot
                        </span>
                        <span className="font-sans tabular-nums">
                          {data.health.snapshotVersion}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          Crawl
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          {data.health.crawlStatus === "READY" ? (
                            <CheckCircle
                              className="size-4 text-emerald-500"
                              aria-hidden="true"
                            />
                          ) : (
                            <WarningCircle
                              className="size-4 text-amber-500"
                              aria-hidden="true"
                            />
                          )}
                          {data.health.crawlStatus} · {data.health.lastCrawl}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          Citation clicks
                        </span>
                        <span className="font-sans tabular-nums">
                          {data.trust.citationCtr}%
                        </span>
                      </div>
                      <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                        <Flask
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                        Preview data, live analytics wire up next.
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      </StudioShell>
    </TooltipProvider>
  );
}
