/**
 * packages/analytics/src/insights.ts
 *
 * Phase 6 — differentiating analytics on validated first-party data.
 * ORM-first (builder + Postgres-only fragments). Every feature:
 * - documents its metric definitions below,
 * - gates small samples (thresholds exported),
 * - is reproducible from the supporting queries,
 * - distinguishes correlation from cause (anomalies list supporting
 *   slices as context, never as proven causes).
 */

import { db, metricsDaily, sql, eq, and, gte, lte, desc, count } from "@ag-ui/database";
import { reportFreshness } from "./registry";
import { visitAttrCTEs } from "./attribution";
import { engagedInteractionSql, engagedSessionSql, sessionIslands } from "./sessions";

/** Sample-size / sensitivity gates (tuned constants, documented). */
export const MIN_CHANNEL_SESSIONS = 5;
export const MIN_LANDING_SESSIONS = 5;
export const MIN_JOURNEY_COUNT = 2;
export const ANOMALY_MIN_DAILY = 20;
export const ANOMALY_Z = 2;

export interface QualityRow {
  channel: string;
  sessions: number;
  pageviews: number;
  pagesPerSession: number;
  interactionRate: number;
  singleViewShare: number;
  qualityScore: number;
  confidence: "high" | "low";
}

/**
 * Composite 0..100: 50% interaction share, 30% non-bounce share,
 * 20% depth (pages/session capped at 3). Weights documented here.
 */
export function qualityScore(interactionRate: number, singleViewShare: number, pagesPerSession: number): number {
  return Math.round(interactionRate * 50 + (1 - singleViewShare) * 30 + Math.min(pagesPerSession / 3, 1) * 20);
}

export interface OpportunityRow {
  path: string;
  sessions: number;
  singleViewShare: number;
  engagedRate: number;
  opportunity: "high" | "watch" | "low" | "insufficient-data";
  reason: string;
}

export function opportunityLabel(sessions: number, singleViewShare: number, engagedRate: number): { opportunity: OpportunityRow["opportunity"]; reason: string } {
  if (sessions < MIN_LANDING_SESSIONS) {
    return { opportunity: "insufficient-data", reason: `Only ${sessions} sessions — below the ${MIN_LANDING_SESSIONS}-session gate.` };
  }
  if (singleViewShare >= 0.6 && sessions >= 10) {
    return { opportunity: "high", reason: `${Math.round(singleViewShare * 100)}% leave after one view despite real volume — strongest fix candidate.` };
  }
  if (engagedRate < 0.3) {
    return { opportunity: "high", reason: `Only ${Math.round(engagedRate * 100)}% engage — content or intent mismatch.` };
  }
  if (singleViewShare >= 0.4 || engagedRate < 0.5) {
    return { opportunity: "watch", reason: "Mild under-engagement — monitor before investing." };
  }
  return { opportunity: "low", reason: "Healthy entry performance — no action." };
}

export interface JourneyEdge {
  from: string;
  to: string;
  journeys: number;
  shareOfEntry: number;
}

export interface Anomaly {
  metric: "pageviews" | "sessions";
  day: string;
  observed: number;
  expected: number;
  z: number;
  direction: "spike" | "dip";
  baselineWindow: string;
  context: Array<{ label: string; pageviews: number; sessions: number }>;
  note: string;
}

/**
 * Z-score flags over a baseline series. Pure — the unit-test surface.
 *
 * The baseline window is described by the caller, not here: this function
 * only knows two series (F-16 — the label used to be a dead argument).
 */
export function detectAnomalies(
  baseline: number[],
  current: { d: string; v: number }[]
): Array<{ d: string; observed: number; expected: number; z: number }> {
  const vals = baseline.filter((v) => Number.isFinite(v));
  if (vals.length < 3) return [];
  const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
  if (!(sd > 0) || mean < ANOMALY_MIN_DAILY) return [];
  const out = [];
  for (const c of current) {
    const z = (c.v - mean) / sd;
    if (Math.abs(z) >= ANOMALY_Z) out.push({ d: c.d, observed: c.v, expected: Math.round(mean * 10) / 10, z: Math.round(z * 100) / 100 });
  }
  return out;
}

export interface InsightsReport {
  kind: "insights";
  companyId: string;
  rangeDays: number;
  qualityMatrix: QualityRow[];
  opportunityMap: OpportunityRow[];
  journeys: JourneyEdge[];
  anomalies: Anomaly[];
  thresholds: { minChannelSessions: number; minLandingSessions: number; minJourneyCount: number; anomalyMinDaily: number; anomalyZ: number };
  freshness: { computedAt: string; rollupLagMinutes: number; live: boolean; dataQuality: string[] };
}

export async function getInsightsReport(companyId: string, rangeDays: number): Promise<InsightsReport> {
  const dataQuality = ["channel-overlap"];
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays * 86_400_000);

  // ---- 1. quality matrix: per (channel, session) grain, then channel ----
  const { v1, v2 } = visitAttrCTEs(companyId, from, to);
  const perCS = db
    .select({
      channel: v2.channel,
      vk: v2.visitKey,
      pv: sql<number>`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("pv"),
      inter: engagedInteractionSql(v2.type).as("inter"),
    })
    .from(v2)
    .groupBy(v2.channel, v2.visitKey)
    .as("cs");
  const qRows = await db
    .with(v1, v2)
    .select({
      channel: perCS.channel,
      sessions: sql<number>`COUNT(*)::int`.as("sessions"),
      pageviews: sql<number>`COALESCE(SUM(${perCS.pv}), 0)::int`.as("pageviews"),
      bounce: sql<number>`COUNT(*) FILTER (WHERE NOT (${engagedSessionSql(perCS.pv, perCS.inter)}))::int`.as("bounce"),
      interacted: sql<number>`COUNT(*) FILTER (WHERE ${perCS.inter})::int`.as("interacted"),
    })
    .from(perCS)
    .groupBy(perCS.channel)
    .orderBy(desc(count()));
  const qualityMatrix: QualityRow[] = qRows.map((r) => {
    const se = Number(r.sessions);
    const pv = Number(r.pageviews);
    const bounceShare = se > 0 ? Number(r.bounce) / se : 0;
    const interRate = se > 0 ? Number(r.interacted) / se : 0;
    const pps = se > 0 ? pv / se : 0;
    return {
      channel: String(r.channel),
      sessions: se,
      pageviews: pv,
      pagesPerSession: Math.round(pps * 10) / 10,
      interactionRate: Math.round(interRate * 1000) / 10 / 100,
      singleViewShare: Math.round(bounceShare * 1000) / 10 / 100,
      qualityScore: qualityScore(interRate, bounceShare, pps),
      confidence: se >= MIN_CHANNEL_SESSIONS ? "high" : "low",
    };
  });

  // ---- 2. opportunity map: entry sessions + their full-window pv totals ----
  const isl = sessionIslands(companyId, from, to);
  const perVisit = db
    .select({
      vk: isl.visitKey,
      pv: sql<number>`COUNT(*) FILTER (WHERE ${isl.type} = 'pageview')::int`.as("pv"),
      inter: engagedInteractionSql(isl.type).as("inter"),
      entryPath: sql<string>`(array_agg(${isl.path} ORDER BY ${isl.createdAt}) FILTER (WHERE ${isl.type} = 'pageview'))[1]`.as("entry_path"),
    })
    .from(isl)
    .groupBy(isl.visitKey)
    .as("pv");
  const oppRows = await db
    .select({
      path: perVisit.entryPath,
      sessions: sql<number>`COUNT(*)::int`.as("sessions"),
      single: sql<number>`COUNT(*) FILTER (WHERE ${perVisit.pv} <= 1)::int`.as("single"),
      engaged: sql<number>`COUNT(*) FILTER (WHERE ${engagedSessionSql(perVisit.pv, perVisit.inter)})::int`.as("engaged"),
    })
    .from(perVisit)
    .groupBy(perVisit.entryPath)
    .orderBy(desc(count()));
  // Every entry path, not just the top ten: the journey share is measured
  // against the full entry volume, so a journey out of a page outside the
  // top ten reported 0% while still showing a count (F-11).
  const entryVol = new Map<string, number>();
  for (const o of oppRows) entryVol.set(String(o.path), Number(o.sessions));
  const opportunityMap: OpportunityRow[] = oppRows
    .filter((r) => (r.path ?? "").length > 0)
    .slice(0, 10)
    .map((r) => {
      const se = Number(r.sessions);
      const sv = se > 0 ? Number(r.single) / se : 0;
      const er = se > 0 ? Number(r.engaged) / se : 0;
      const { opportunity, reason } = opportunityLabel(se, sv, er);
      return { path: String(r.path), sessions: se, singleViewShare: Math.round(sv * 1000) / 10 / 100, engagedRate: Math.round(er * 1000) / 10 / 100, opportunity, reason };
    });

  // ---- 3. journeys: entry -> second distinct path via LEAD ----
  const seq = db
    .select({
      vk: isl.visitKey,
      path: isl.path,
      nextPath: sql<string>`LEAD(${isl.path}) OVER (PARTITION BY ${isl.visitKey} ORDER BY ${isl.createdAt})`.as("next_path"),
      rn: sql<number>`ROW_NUMBER() OVER (PARTITION BY ${isl.visitKey} ORDER BY ${isl.createdAt})::int`.as("rn"),
    })
    .from(isl)
    .where(eq(isl.type, "pageview"))
    .as("seq");
  const pairRows = await db
    .select({
      fromPath: seq.path,
      toPath: seq.nextPath,
      journeys: sql<number>`COUNT(*)::int`.as("journeys"),
    })
    .from(seq)
    .where(and(eq(seq.rn, 1), sql`${seq.nextPath} IS NOT NULL AND ${seq.nextPath} <> ${seq.path}`))
    .groupBy(seq.path, seq.nextPath)
    .orderBy(desc(count()))
    .limit(15);
  const journeys: JourneyEdge[] = pairRows
    .filter((r) => r.journeys >= MIN_JOURNEY_COUNT)
    .map((r) => ({
      from: String(r.fromPath),
      to: String(r.toPath),
      journeys: Number(r.journeys),
      shareOfEntry: (entryVol.get(String(r.fromPath)) ?? 0) > 0 ? Math.round((Number(r.journeys) / (entryVol.get(String(r.fromPath)) as number)) * 1000) / 10 / 100 : 0,
    }));

  // ---- 4. anomalies: the selected window vs the window before it ----
  //
  // The window used to be hardcoded to 7 days vs 7 days, so the range
  // control was partly cosmetic: picking 30 days still measured 7 (F-10).
  // The current window is the selected range; the baseline is the same
  // length immediately before it.
  const cur0 = new Date(to.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
  const prev0 = new Date(to.getTime() - rangeDays * 2 * 86_400_000).toISOString().slice(0, 10);
  const todayStr = to.toISOString().slice(0, 10);
  const dRows = await db
    .select({
      day: sql<string>`${metricsDaily.day}::text`.as("day"),
      pv: metricsDaily.pageviews,
      se: metricsDaily.sessions,
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, prev0), lte(metricsDaily.day, todayStr)))
    .orderBy(metricsDaily.day);
  const base = dRows.filter((r) => r.day < cur0);
  const curr = dRows.filter((r) => r.day >= cur0);
  const anomalies: Anomaly[] = [];
  for (const metric of ["pv", "se"] as const) {
    const flags = detectAnomalies(
      base.map((r) => Number(r[metric])),
      curr.map((r) => ({ d: r.day.slice(0, 10), v: Number(r[metric]) }))
    );
    for (const f of flags) {
      // Context slices for the flagged day (bounded single-day attr scan).
      const dayFrom = new Date(`${f.d}T00:00:00Z`);
      const dayTo = new Date(dayFrom.getTime() + 86_400_000);
      const { v1: d1, v2: d2 } = visitAttrCTEs(companyId, dayFrom, dayTo);
      const ctx = await db
        .with(d1, d2)
        .select({
          label: d2.channel,
          pageviews: sql<number>`COUNT(*) FILTER (WHERE ${d2.type} = 'pageview')::int`.as("pageviews"),
          sessions: sql<number>`COUNT(DISTINCT ${d2.visitKey})::int`.as("sessions"),
        })
        .from(d2)
        .groupBy(d2.channel)
        .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${d2.type} = 'pageview')`))
        .limit(3);
      anomalies.push({
        metric: metric === "pv" ? "pageviews" : "sessions",
        day: f.d,
        observed: f.observed,
        expected: f.expected,
        z: f.z,
        direction: f.z > 0 ? "spike" : "dip",
        baselineWindow: `${prev0} to ${cur0}`,
        context: ctx.map((c) => ({ label: String(c.label), pageviews: Number(c.pageviews), sessions: Number(c.sessions) })),
        note: "Correlated slices for context only — not proven causes. Check launches, outages, or campaigns on this date.",
      });
    }
  }

  return {
    kind: "insights",
    companyId,
    rangeDays,
    qualityMatrix,
    opportunityMap,
    journeys,
    anomalies,
    thresholds: {
      minChannelSessions: MIN_CHANNEL_SESSIONS,
      minLandingSessions: MIN_LANDING_SESSIONS,
      minJourneyCount: MIN_JOURNEY_COUNT,
      anomalyMinDaily: ANOMALY_MIN_DAILY,
      anomalyZ: ANOMALY_Z,
    },
    freshness: await reportFreshness(false, dataQuality),
  };
}
