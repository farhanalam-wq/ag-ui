"use client";

/**
 * Overview mock data (U4). Keyed off the selected company id with a stable seed
 * so switching companies changes the numbers but re-renders never flicker.
 *
 * USE_MOCKS=true until the analytics endpoints land; shapes mirror them
 * 1:1 so wiring = swapping getOverviewMock(companyId) for the fetch call.
 * Every number is mock — no fake precision is ever presented as measured.
 */

export const USE_MOCKS = true;

export interface HeroLift {
  assistedRate: number;
  baselineRate: number;
  deltaPp: number;
  spark: number[];
  caption: string;
}

export interface CompactKpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaGood: boolean;
  spark: number[];
  insight: string;
}

export interface TrendPoint {
  d: string;
  assisted: number;
  baseline: number;
}

export interface IntentSlice {
  intent: string;
  share: number;
  sessions: number;
}

export interface BlindspotRow {
  query: string;
  intent: string;
  confidence: number;
  volume: number;
  evidence: string;
  nextStep: string;
  nextHref: string;
}

export interface FunnelStage {
  stage: string;
  count: number;
  pctOfTop: number;
  stageConversion: number | null;
}

export interface TrustMetrics {
  groundedCoverage: number;
  fallbackRate: number;
  latencyP50: number;
  latencyP95: number;
  citationCtr: number;
}

export interface HealthState {
  snapshotVersion: string;
  crawlStatus: "READY" | "CRAWLING" | "FAILED";
  lastCrawl: string;
  pingMs: number;
  scriptLive: boolean;
}

export interface OverviewMock {
  companyId: string;
  companyName: string;
  isMock: true;
  hero: HeroLift;
  kpis: CompactKpi[];
  funnel: FunnelStage[];
  funnelDropout: string;
  trust: TrustMetrics;
  demandTrend: TrendPoint[];
  intentBreakdown: IntentSlice[];
  blindspots: BlindspotRow[];
  health: HealthState;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(rand: () => number, n: number, base: number, swing: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const drift = Math.sin(i / 2.4) * swing * 0.6;
    return Math.round((base + drift + (rand() - 0.5) * swing) * 10) / 10;
  });
}

const INTENTS = [
  "Pricing Evaluation",
  "Product Research",
  "Demo Request",
  "Competitor Comparison",
  "Enterprise Inquiry",
];

const BLINDSPOT_QUERIES = [
  ["Do you offer annual billing with a discount?", "Pricing Evaluation"],
  ["Is there an EU data residency option?", "Enterprise Inquiry"],
  ["How does migration from our current tool work?", "Competitor Comparison"],
  ["What is the uptime SLA on the team plan?", "Pricing Evaluation"],
  ["Do you have a status page?", "Support"],
] as const;

export function getOverviewMock(companyId: string, companyName: string): OverviewMock {
  const rand = mulberry32(hashSeed(companyId || "demo"));
  const assisted = 6 + rand() * 9;
  const baseline = assisted - (1.5 + rand() * 3);
  const heroSpark = series(rand, 14, assisted, 2.2);

  const highIntent = Math.round(180 + rand() * 420);
  const blindspot = Math.round((4 + rand() * 9) * 10) / 10;
  const depth = Math.round((3 + rand() * 4) * 10) / 10;

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  // Session counts (not rates): scaled from the same shape so the demand chart
  // tells a different story than the hero rate chart.
  const demandTrend: TrendPoint[] = days.map((d, i) => ({
    d,
    assisted: Math.round(heroSpark[i] * 22),
    baseline: Math.round((baseline + Math.sin(i / 3) * 0.8) * 22),
  }));

  let shareLeft = 100;
  const intentBreakdown: IntentSlice[] = INTENTS.map((intent, i) => {
    const share = i === INTENTS.length - 1 ? shareLeft : Math.round(12 + rand() * 22);
    shareLeft -= share;
    return { intent, share, sessions: Math.round((highIntent * share) / 100) };
  }).sort((a, b) => b.share - a.share);

  const blindspots: BlindspotRow[] = BLINDSPOT_QUERIES.map(([query, intent], i) => ({
    query,
    intent,
    confidence: Math.round(30 + rand() * 25),
    volume: Math.max(3, Math.round(18 + rand() * 60 - i * 6)),
    evidence: `${Math.round(8 + rand() * 14)} sessions hit low-confidence answers on this in the last 7 days.`,
    nextStep: intent === "Pricing Evaluation" ? "Review in Knowledge Foundry" : "Explore Intent Radar",
    nextHref: intent === "Pricing Evaluation" ? "/knowledge/sources" : "/intelligence/intent-radar",
  })).sort((a, b) => b.volume - a.volume);

  const funnelCounts = [
    Math.round(4000 + rand() * 6000),
    0, 0, 0, 0, 0,
  ];
  const funnelRates = [0.72, 0.25, 0.69, 0.5, 0.084].map((r) =>
    Math.min(0.95, Math.max(0.05, Math.round((r + (rand() - 0.5) * 0.2) * 100) / 100))
  );
  for (let i = 1; i < 6; i++) {
    funnelCounts[i] = Math.max(1, Math.round((funnelCounts[i - 1] as number) * (funnelRates[i - 1] as number)));
  }
  const funnelStages = ["Eligible sessions", "Widget seen", "Widget opened", "Conversation started", "Meaningful engagement", "Recorded conversion"];
  const funnel: FunnelStage[] = funnelStages.map((stage, i) => ({
    stage,
    count: funnelCounts[i] as number,
    pctOfTop: Math.round(((funnelCounts[i] as number) / (funnelCounts[0] as number)) * 1000) / 10,
    stageConversion: i === 0 ? null : Math.round((funnelRates[i - 1] as number) * 100),
  }));
  // Biggest leak between engagement stages — the terminal conversion row is the
  // outcome, not a leak, so it stays out of this comparison.
  let dropoutIdx = 1;
  for (let i = 2; i < funnel.length - 1; i++) {
    if ((funnel[i]?.stageConversion ?? 100) < (funnel[dropoutIdx]?.stageConversion ?? 100)) dropoutIdx = i;
  }
  const funnelDropout = `${funnel[dropoutIdx - 1]?.stage} → ${funnel[dropoutIdx]?.stage} (${funnel[dropoutIdx]?.stageConversion}%)`;

  return {
    companyId,
    companyName,
    isMock: true,
    hero: {
      assistedRate: Math.round(assisted * 10) / 10,
      baselineRate: Math.round(baseline * 10) / 10,
      deltaPp: Math.round((assisted - baseline) * 10) / 10,
      spark: heroSpark,
      caption: `${INTENTS[0]} leads this week — most assists start on pricing pages after widget open.`,
    },
    kpis: [
      {
        id: "intent",
        label: "High-intent sessions",
        value: highIntent.toLocaleString(),
        delta: `+${Math.round(6 + rand() * 18)}% WoW`,
        deltaGood: true,
        spark: series(rand, 14, highIntent / 14, highIntent / 60),
        insight: `${intentBreakdown[0]?.intent ?? "Pricing"} drives the week.`,
      },
      {
        id: "blindspot",
        label: "Blindspot rate",
        value: `${blindspot}%`,
        delta: `-${Math.round(2 + rand() * 8)}% WoW`,
        deltaGood: true,
        spark: series(rand, 14, blindspot, 2),
        insight: `Top gap: "${blindspots[0]?.query.split(" ").slice(0, 5).join(" ")}…"`,
      },
      {
        id: "depth",
        label: "Messages / session",
        value: `${depth}`,
        delta: `+${Math.round(3 + rand() * 12)}% WoW`,
        deltaGood: true,
        spark: series(rand, 14, depth, 1.2),
        insight: "Depth holds — visitors talk, not bounce.",
      },
    ],
    demandTrend,
    intentBreakdown,
    blindspots,
    funnel,
    funnelDropout,
    trust: {
      groundedCoverage: Math.round(74 + rand() * 16),
      fallbackRate: Math.round((4 + rand() * 6) * 10) / 10,
      latencyP50: Math.round(380 + rand() * 300),
      latencyP95: Math.round(900 + rand() * 700),
      citationCtr: Math.round(30 + rand() * 25),
    },
    health: {
      snapshotVersion: `v${1 + Math.floor(rand() * 12)}`,
      crawlStatus: "READY",
      lastCrawl: "2h ago",
      pingMs: Math.round(40 + rand() * 120),
      scriptLive: true,
    },
  };
}
