"use client";

/**
 * apps/web/app/intelligence/intent-radar/radar-view.tsx
 *
 * Intelligence → Intent Radar. Three questions, three encodings, one page:
 *
 *   - *What do visitors want?* The intent mix is a composition bar — share
 *     of a whole reads as proportions, not as a ranked table. It counts every
 *     scanned question, so its shares are legitimate; the cluster and
 *     competitor tables below are top slices and claim no share.
 *   - *Where is the site blind?* The cluster map (bubbles sized by volume,
 *     coloured by intent) shows the shape of demand; the table under it is
 *     the Blindspot Index — ranked by blindspot count, because that is the
 *     ranking someone can act on. One table serves both readings; printing
 *     the same questions in two tables would be the report repeating itself.
 *   - *Who are we losing to?* Competitor mentions, ranked, with the visitor's
 *     verbatim words in the hover — quotes are evidence, not paraphrase.
 *
 * Clustering is deterministic (normalised wording, the shared keyword
 * vocabulary). The copy says "grouped by identical wording", never
 * "semantic" — the embedding pipeline that would earn that word is not
 * running. And a question with no reply is unanswered, not a blindspot:
 * nothing failed to answer it.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Crosshair,
  Microphone,
  ShieldCheck,
} from "@phosphor-icons/react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { IntelCluster, IntelRadarAnalytics } from "@/lib/api-client";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { CompositionBar } from "@/components/analytics/composition-bar";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { TrendCard } from "@/components/analytics/trend-card";
import { useEChartsTheme } from "@/components/charts/echarts-theme";

// ECharts island: the bubble layout is why ECharts is on this page at all.
const EChart = dynamic(
  () => import("@/components/charts/echarts").then((m) => m.EChart),
  { ssr: false, loading: () => <Skeleton className="h-[280px] w-full" /> }
);

// Recharts island: the per-day stacked composition.
const RadarTrendChart = dynamic(
  () => import("./radar-trend-chart").then((m) => m.RadarTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[220px] w-full" /> }
);

const BUBBLE_CLUSTERS = 18;

/** Display wording for the map and table, cut at word boundaries. */
function shortQuestion(text: string, max = 42): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

interface ClusterRow {
  label: string;
  question: string;
  key: string;
  intents: string;
  asked: number;
  blindspot: number;
  noReply: number;
  confidence: string;
  volume: number;
}

interface CompetitorRow {
  label: string;
  mentions: number;
  quotes: string;
  quoteList: string[];
}

export function RadarView({ data }: { data: IntelRadarAnalytics }) {
  const theme = useEChartsTheme();
  const [selected, setSelected] = useState<ClusterRow | null>(null);

  /* ---------------------------------------------------------------- */
  /* The Blindspot Index: ranked by blindspot count, then volume —      */
  /* the ranking someone can act on. The map above shows the same       */
  /* clusters by volume; the two orderings answer different questions.  */
  /* ---------------------------------------------------------------- */
  const clusterRows = useMemo<ClusterRow[]>(() => {
    return [...data.clusters]
      .sort((a, b) => b.blindspot - a.blindspot || b.volume - a.volume)
      .map((c) => ({
        label: c.question,
        question: c.question,
        key: c.key,
        intents: c.intents.length > 0 ? c.intents.join(" · ") : "Unclassified",
        asked: c.volume,
        blindspot: c.blindspot,
        noReply: c.unanswered,
        confidence:
          c.avgSimilarity === null ? "—" : c.avgSimilarity.toFixed(2),
        volume: c.volume,
      }));
  }, [data]);

  /* ---------------------------------------------------------------- */
  /* The cluster map. Hubs are intents (colour), spokes are the most    */
  /* asked clusters (size = volume). Edges carry no meaning beyond      */
  /* membership; force layout spreads the spokes so the bubbles read.   */
  /* A bubble click selects the row in the table below — coordinated    */
  /* views, one data source.                                            */
  /* ---------------------------------------------------------------- */
  const { radarOption, intentPalette } = useMemo(() => {
    const intents = data.intentBreakdown.slice(0, 6);
    const palette = intents.map((_, i) => theme.palette[i % theme.palette.length]);
    const colorOf = new Map<string, number>(intents.map((s, i) => [s.intent, i]));
    const top = data.clusters
      .filter((c) => c.volume >= 2)
      .slice(0, BUBBLE_CLUSTERS);

    type Node = {
      id: string;
      name: string;
      symbolSize: number;
      itemStyle: { color: string; opacity?: number };
      label?: Record<string, unknown>;
      cluster?: IntelCluster;
      [key: string]: unknown;
    };

    const hubNodes: Node[] = intents.map((s, i) => ({
      id: `intent:${s.intent}`,
      name: s.intent,
      symbolSize: 34,
      itemStyle: { color: palette[i] },
      label: {
        show: true,
        position: "bottom" as const,
        fontSize: 11,
        color: theme.text,
        formatter: s.intent,
      },
    }));

    const clusterNodes: Node[] = top.map((c) => {
      const idx = c.intents.length > 0 ? colorOf.get(c.intents[0]!) : undefined;
      return {
        id: `cluster:${c.key}`,
        name: shortQuestion(c.question),
        symbolSize: Math.min(64, 10 + Math.sqrt(c.volume) * 6),
        itemStyle: {
          color: palette[idx ?? palette.length - 1] ?? theme.palette[6],
          opacity: c.blindspot > 0 ? 0.95 : 0.55,
        },
        cluster: c,
      };
    });

    // A cluster hangs off its first intent's hub — but only when that intent
    // is one of the drawn hubs; an intent outside the top 6 would otherwise
    // become an orphan node. Everything else falls to the Unclassified hub,
    // which is what unclassified and out-of-top-6 both mean on the map.
    const links = top.map((c) => ({
      source: `cluster:${c.key}`,
      target: `intent:${
        c.intents.length > 0 && colorOf.has(c.intents[0]!)
          ? c.intents[0]
          : "Unclassified"
      }`,
    }));

    // The Unclassified hub is drawn when the mix has that bucket but the top
    // intents don't include it, or when a fallback link above needs it.
    const needsFallbackHub =
      links.some((l) => l.target === "intent:Unclassified") ||
      intents.some((s) => s.intent === "Unclassified") === false &&
        data.intentBreakdown.some((s) => s.intent === "Unclassified");
    if (needsFallbackHub && !hubNodes.some((n) => n.id === "intent:Unclassified")) {
      hubNodes.push({
        id: "intent:Unclassified",
        name: "Unclassified",
        symbolSize: 28,
        itemStyle: { color: theme.palette[theme.palette.length - 1]! },
        label: {
          show: true,
          position: "bottom" as const,
          fontSize: 11,
          color: theme.text,
          formatter: "Unclassified",
        },
      });
    }

    const option = {
      tooltip: {
        confine: true,
        backgroundColor: theme.surface,
        borderColor: theme.border,
        textStyle: { color: theme.text },
        formatter: (params: unknown) => {
          const p = params as {
            data?: { cluster?: IntelCluster; name?: string };
            name?: string;
          };
          const c = p.data?.cluster;
          if (!c) return p.name ?? "";
          const answered = c.answered;
          const groundedPct =
            answered > 0 ? ((c.grounded / answered) * 100).toFixed(0) : "—";
          return [
            `<strong>${c.question.replace(/</g, "&lt;")}</strong>`,
            `Asked ${c.volume}× across ${c.conversations} conversation${c.conversations === 1 ? "" : "s"}`,
            `Grounded replies: ${c.grounded}${answered > 0 ? ` (${groundedPct}% of answered)` : ""}`,
            `Blindspots: ${c.blindspot} · No reply: ${c.unanswered}`,
            `Retrieval confidence: ${c.avgSimilarity === null ? "not reported" : c.avgSimilarity.toFixed(2)}`,
          ].join("<br/>");
        },
      },
      series: [
        {
          type: "graph" as const,
          layout: "force" as const,
          roam: false,
          force: { repulsion: 200, edgeLength: [70, 150], gravity: 0.15 },
          data: [...hubNodes, ...clusterNodes],
          links,
          lineStyle: { color: theme.border, opacity: 0.55, width: 1 },
          emphasis: { focus: "adjacency" as const, scale: 1.15 },
          label: {
            show: true,
            position: "bottom" as const,
            fontSize: 10,
            color: theme.text,
            formatter: (params: unknown) => {
              const p = params as { data?: { cluster?: IntelCluster }; name?: string };
              return p.data?.cluster ? shortQuestion(p.data.cluster.question, 30) : "";
            },
          },
        },
      ],
    };

    return { radarOption: option, intentPalette: palette };
  }, [data, theme]);

  const competitorRows = useMemo<CompetitorRow[]>(
    () =>
      data.competitors.map((c) => ({
        label: c.name,
        mentions: c.mentions,
        quotes: c.quotes.length > 0 ? c.quotes[0]! : "—",
        quoteList: c.quotes,
      })),
    [data]
  );

  const competitorInsight = useMemo(() => {
    const first = data.competitors[0];
    if (!first) return null;
    return `${first.name} leads with ${first.mentions} mention${first.mentions === 1 ? "" : "s"} — the quotes name what visitors compare.`;
  }, [data]);

  const perDayQuestions = data.trend.map((t) => t.questions);
  const perDayHighIntentRate = data.trend.map((t) =>
    t.questions > 0 ? (Number(t.highIntent) / Number(t.questions)) * 100 : null
  );
  const perDayBlindspotRate = data.trend.map((t) => {
    const answered = Number(t.questions) - Number(t.unanswered);
    return answered > 0 ? (Number(t.blindspot) / answered) * 100 : null;
  });

  /* ---------------------------------------------------------------- */
  /* The daily composition: what held up, what didn't, what never      */
  /* got an answer. Only drawn from two days on — a single day is a    */
  /* bar the sparklines already draw smaller.                          */
  /* ---------------------------------------------------------------- */
  const trendRows = useMemo(
    () =>
      data.trend.map((t) => ({
        d: t.d,
        sourced: Math.max(
          0,
          Number(t.questions) - Number(t.blindspot) - Number(t.unanswered)
        ),
        blindspot: Number(t.blindspot),
        noReply: Number(t.unanswered),
      })),
    [data]
  );

  const trendInsight = useMemo(() => {
    if (trendRows.length < 2) return null;
    const peak = trendRows.reduce((a, t) =>
      t.sourced + t.blindspot + t.noReply > a.sourced + a.blindspot + a.noReply
        ? t
        : a
    );
    const peakTotal = peak.sourced + peak.blindspot + peak.noReply;
    return `Busiest day ${peak.d} with ${peakTotal.toLocaleString()} question${
      peakTotal === 1 ? "" : "s"
    }; blindspots have been ${Number(data.totals.blindspotRate ?? 0).toLocaleString()}% of answered questions across the window.`;
  }, [trendRows, data]);

  const empty =
    Number(data.totals.questions ?? 0) === 0 &&
    data.competitors.length === 0;

  return (
    <div className="space-y-4">
      {empty ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Crosshair className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">No questions in this range.</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The radar reads the conversations visitors had. Widen the range, or
            check that the embed snippet is sending chat events.
          </p>
        </div>
      ) : (
        <>
          <MetricGrid
            columns={4}
            items={[
              {
                id: "intelQuestions",
                value: data.totals.questions,
                sparkline: perDayQuestions,
              },
              {
                id: "intelHighIntentRate",
                value: data.totals.highIntentRate,
                sparkline: perDayHighIntentRate,
              },
              {
                id: "intelBlindspotRate",
                value: data.totals.blindspotRate,
                sparkline: perDayBlindspotRate,
                hint: `of ${Number(data.totals.answered ?? 0).toLocaleString()} answered questions; ${Number(
                  data.totals.unansweredQuestions ?? 0
                ).toLocaleString()} got no reply at all`,
              },
              {
                id: "intelCompetitorMentions",
                value: data.competitors.reduce((a, c) => a + c.mentions, 0),
                hint:
                  data.competitors.length > 0
                    ? `across ${data.competitors.length} named product${data.competitors.length === 1 ? "" : "s"}`
                    : "the enrich worker tags live conversations; none in this range",
              },
            ]}
          />

          {trendInsight && (
            <TrendCard
              title="Questions per day"
              description="Each day's questions, stacked by how the agent's answers stood up."
              insight={trendInsight}
              footer="Sourced = the reply had retrieved evidence behind it. Blindspot = answered without evidence. No reply = nothing answered at all — a different failure from a blindspot. Days without questions don't appear as columns; the axis lists only days in the scan."
            >
              <RadarTrendChart data={trendRows} />
            </TrendCard>
          )}

          <CompositionBar
            title="What visitors ask for"
            description="Share of scanned questions per detected intent — every question is counted, so these shares are of the whole."
            rows={data.intentBreakdown.map((s) => ({ label: s.intent, value: s.questions }))}
            metricLabel="Questions"
            empty="No questions in this range."
          />

          <Card>
            <CardHeader>
              <CardTitle>Demand clusters</CardTitle>
              <CardDescription>
                Bubbles sized by how often a wording was asked, coloured by
                intent. Click a bubble to find it in the index below.
              </CardDescription>
            </CardHeader>
            <CardContent>
            <EChart
              option={radarOption}
              height={300}
              onEvents={{
                click: (params) => {
                  const p = params as { data?: { cluster?: IntelCluster } };
                  const c = p.data?.cluster;
                  if (!c) return;
                  const row = clusterRows.find((r) => r.key === c.key);
                  if (row) setSelected(row);
                },
              }}
              ariaLabel="Demand cluster map: bubbles sized by question volume, coloured by intent. The ranked table below is the accessible equivalent."
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {data.intentBreakdown.slice(0, 6).map((s, i) => (
                <span key={s.intent} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2.5 rounded-sm"
                    style={{ background: intentPalette[i % intentPalette.length] }}
                    aria-hidden="true"
                  />
                  {s.intent}
                </span>
              ))}
            </div>
            </CardContent>
          </Card>

          <BreakdownTable
            title="Blindspot index"
            description="Repeated question wordings, ranked by blindspots — answers the site's own material could not back. Exact rates live on the hover, counts here."
            rows={clusterRows}
            labelHeader="Question"
            columns={[
              { key: "intents", label: "Intent", align: "left" },
              { key: "asked", label: "Asked" },
              { key: "blindspot", label: "Blindspots" },
              { key: "noReply", label: "No reply" },
              { key: "confidence", label: "Confidence" },
            ]}
            barKey="asked"
            insight={
              clusterRows.some((r) => r.blindspot > 0)
                ? (() => {
                    const worst = clusterRows.find((r) => r.blindspot > 0)!;
                    return `Loudest blindspot: “${shortQuestion(worst.question, 60)}” — ${worst.blindspot} of ${worst.asked} askings got no sourced answer.`;
                  })()
                : "No blindspots in the top wordings — every repeated question drew a sourced answer."
            }
            onRowSelect={setSelected}
            empty="No repeated question wordings in this range. One-off questions stay in the conversations log — repetition is what makes a cluster."
            footer={
              <p className="mt-3 text-xs text-muted-foreground">
                Grouped by identical wording (normalised case and spacing), not
                semantic similarity — a rephrasing is a different cluster. Top
                {` ${clusterRows.length}`} wordings of the scan; no share of the
                whole is claimed.
              </p>
            }
          />

          <BreakdownTable
            title="Competitor mentions"
            description="Products visitors named in conversation, with their words verbatim — hesitation the site has to answer."
            rows={competitorRows}
            labelHeader="Competitor"
            columns={[
              { key: "mentions", label: "Mentions" },
              { key: "quotes", label: "In their words", align: "left" },
            ]}
            barKey="mentions"
            insight={competitorInsight ?? undefined}
            empty="No competitor mentions in this range. Tags are written on live conversations by the enrich worker."
            footer={
              <p className="mt-3 text-xs text-muted-foreground">
                Tagged from user messages by the enrich worker; a top slice of
                the scan, so no share of all questions is claimed. Full quotes
                in the hover.
              </p>
            }
          />

          <MetricStory
            metrics={[
              "intelQuestions",
              "intelHighIntentRate",
              "intelBlindspotRate",
              "intelCompetitorMentions",
            ]}
          />

          <DataQualityNote notes={data.freshness.notes} />

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Microphone className="size-3.5" aria-hidden="true" />
            Voice conversations count in every number here; their lines are
            reconstructions of speech, not verbatim text.
          </p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Retrieval confidence is the mean of the top similarity scores the
            paired answers reported. Absent scores show as “—”, never zero.
          </p>
        </>
      )}

      {/* The cluster's detail: aggregates here, transcripts in Visitors —
          this drawer never reads a conversation body. */}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-[480px]">
          <SheetHeader>
            <SheetTitle className="text-left text-base">
              {selected?.question}
            </SheetTitle>
            <SheetDescription className="text-left">
              One cluster of the radar: the same wording, asked again.
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <div className="space-y-4 px-4 pb-6">
              <div className="flex flex-wrap gap-1.5">
                {selected.intents.split(" · ").map((intent) => (
                  <Badge key={intent} variant="secondary">
                    {intent}
                  </Badge>
                ))}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <Detail label="Asked" value={selected.asked.toLocaleString()} />
                <Detail
                  label="Blindspots"
                  value={selected.blindspot.toLocaleString()}
                />
                <Detail label="No reply" value={selected.noReply.toLocaleString()} />
                <Detail label="Retrieval confidence" value={selected.confidence} />
              </dl>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {selected.blindspot > 0
                  ? "A blindspot is an answer with no retrieved source behind it — the answer may still be right; it is just not traceable. Close it by indexing the material this question needs, or draft the FAQ patch in Signals."
                  : "Every repeated asking of this wording drew a sourced answer. Nothing to patch — watch that it stays true as the knowledge base changes."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <Link
                    href={`/intelligence/signals?cluster=${encodeURIComponent(selected.key)}&question=${encodeURIComponent(selected.question)}`}
                  >
                    Draft an FAQ in Signals
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/visitors/conversations">Open transcripts</Link>
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 font-sans tabular-nums font-medium">{value}</dd>
    </div>
  );
}
