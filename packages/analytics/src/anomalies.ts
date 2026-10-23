/**
 * packages/analytics/src/anomalies.ts
 *
 * The one surviving piece of the Insights page: flagged days.
 *
 * An anomaly is a day whose pageviews or sessions sit at least two standard
 * deviations away from the same-length window immediately before the report
 * range. It is deliberately conservative:
 *
 *   - the baseline must have at least `ANOMALY_MIN_DAILY` mean traffic, so a
 *     quiet site cannot flag noise as news;
 *   - at least three baseline days must exist, so a fresh install stays quiet;
 *   - the result says "correlated slices", never "cause" — the channel mix on
 *     that day is context for a human, not a diagnosis.
 *
 * The quality matrix, opportunity map and journey explorer that used to live
 * beside this were dropped (D9, Insights dissolution): they restated numbers
 * the Content and Acquisition tabs already show, with more machinery and less
 * evidence. A flag is the part that says something a reader did not already
 * know.
 *
 * ORM-first. The one fragment is the per-channel context count, which needs a
 * filtered aggregate over an attributed CTE.
 */

import { db, metricsDaily, sql, eq, and, gte, lte, desc } from "@ag-ui/database";
import { visitAttrCTEs } from "./attribution";
import type { Anomaly } from "./registry";

/** Minimum mean daily traffic in the baseline before anomalies are claimed. */
export const ANOMALY_MIN_DAILY = 20;
/** Absolute z-score a day must reach to be flagged. */
export const ANOMALY_Z = 2;

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
  const sd = Math.sqrt(
    vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length
  );
  if (!(sd > 0) || mean < ANOMALY_MIN_DAILY) return [];
  const out = [];
  for (const c of current) {
    const z = (c.v - mean) / sd;
    if (Math.abs(z) >= ANOMALY_Z) {
      out.push({
        d: c.d,
        observed: c.v,
        expected: Math.round(mean * 10) / 10,
        z: Math.round(z * 100) / 100,
      });
    }
  }
  return out;
}

export interface AnomalySummary {
  anomalies: Anomaly[];
  thresholds: { minDaily: number; z: number };
}

/**
 * Flag unusual days inside the report window.
 *
 * `fromDay` is the first UTC day of the window the report already shows, so a
 * flagged day is a day the KPI row contains. The baseline is the same number
 * of days immediately before it.
 */
export async function getAnomalies(
  companyId: string,
  fromDay: string,
  rangeDays: number
): Promise<AnomalySummary> {
  const thresholds = { minDaily: ANOMALY_MIN_DAILY, z: ANOMALY_Z };
  const todayStr = new Date().toISOString().slice(0, 10);
  const baseStart = new Date(
    new Date(`${fromDay}T00:00:00Z`).getTime() - rangeDays * 86_400_000
  )
    .toISOString()
    .slice(0, 10);

  const rows = await db
    .select({
      day: sql<string>`${metricsDaily.day}::text`.as("day"),
      pv: metricsDaily.pageviews,
      se: metricsDaily.sessions,
    })
    .from(metricsDaily)
    .where(
      and(
        eq(metricsDaily.companyId, companyId),
        gte(metricsDaily.day, baseStart),
        lte(metricsDaily.day, todayStr)
      )
    )
    .orderBy(metricsDaily.day);

  const base = rows.filter((r) => r.day < fromDay);
  const curr = rows.filter((r) => r.day >= fromDay);

  const anomalies: Anomaly[] = [];
  for (const metric of ["pv", "se"] as const) {
    const flags = detectAnomalies(
      base.map((r) => Number(r[metric])),
      curr.map((r) => ({ d: r.day.slice(0, 10), v: Number(r[metric]) }))
    );
    for (const flag of flags) {
      // Context slices for the flagged day (bounded single-day attr scan).
      const dayFrom = new Date(`${flag.d}T00:00:00Z`);
      const dayTo = new Date(dayFrom.getTime() + 86_400_000);
      const { v1, v2 } = visitAttrCTEs(companyId, dayFrom, dayTo);
      const ctx = await db
        .with(v1, v2)
        .select({
          label: v2.channel,
          pageviews: sql<number>`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("pageviews"),
          sessions: sql<number>`COUNT(DISTINCT ${v2.visitKey})::int`.as("sessions"),
        })
        .from(v2)
        .groupBy(v2.channel)
        .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')`))
        .limit(3);
      anomalies.push({
        metric: metric === "pv" ? "pageviews" : "sessions",
        day: flag.d,
        observed: flag.observed,
        expected: flag.expected,
        z: flag.z,
        direction: flag.z > 0 ? "spike" : "dip",
        baselineWindow: `${baseStart} to ${fromDay}`,
        context: ctx.map((c) => ({
          label: String(c.label),
          pageviews: Number(c.pageviews),
          sessions: Number(c.sessions),
        })),
        note: "Correlated slices for context only — not proven causes. Check launches, outages, or campaigns on this date.",
      });
    }
  }

  return { anomalies, thresholds };
}
