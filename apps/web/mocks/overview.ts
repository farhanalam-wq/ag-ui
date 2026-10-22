"use client";

/**
 * The Overview payload's shape.
 *
 * This used to be a mock generator as well (`getOverviewMock`), but the
 * endpoints are live now and the generator was never called — it was dead
 * code pretending to be a data source (R-10). What remains is the contract:
 * the server's overview payload and the Overview page share these types, so
 * a shape change breaks the build instead of the page.
 */

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
  /** Share of the top of the funnel. */
  pctOfTop: number;
  /**
   * Conversion from the previous stage (null for the first stage).
   *
   * Named for what it measures: `pctOfTop` is "of everyone who entered",
   * this is "of everyone who reached the previous step" (R-12).
   */
  stepConversion: number | null;
}

export interface TrustMetrics {
  groundedCoverage: number;
  fallbackRate: number;
  latencyP50: number;
  latencyP95: number;
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
  isMock: boolean;
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
