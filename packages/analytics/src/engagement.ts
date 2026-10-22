/**
 * packages/analytics/src/engagement.ts
 *
 * Phase 2 — engagement breakdowns from first-party data only. The headline
 * totals and the trend live in `website.ts` (`getEngagementTotals`) and are
 * shared, so the Engagement page and the Website Overview can never show two
 * different "Sessions" numbers for the same company and range.
 *
 * One unit. A "session" is a visit: a run of events with no gap wider than
 * SESSION_GAP_MINUTES (see sessions.ts). The rollup owns the per-visit
 * `engaged` verdict; this module never recomputes it.
 *
 * The breakdown tables are raw scans — path and device need the event stream —
 * but they count sessions, not page loads: the same island rule the rollup
 * uses is applied to the events in the window.
 *
 * Retires with the Engagement page: the Website tabs read the same splits from
 * content.ts (path) and audience.ts (device).
 */

import { db, sql, and, gte, lt, desc } from "@ag-ui/database";
import { reportFreshness, type EngagementReport } from "./registry";
import { deviceFragment } from "./attribution";
import { sessionIslands } from "./sessions";
import { getEngagementTotals } from "./website";

export async function getEngagementReport(
  companyId: string,
  rangeDays: number
): Promise<EngagementReport> {
  const now = new Date();

  // The same calendar days the Website page reports on.
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  const fromDay = days[0]!;
  const windowStart = new Date(`${fromDay}T00:00:00Z`);

  const summary = await getEngagementTotals(companyId, rangeDays);
  const dataQuality = [...summary.dataQuality];

  // Breakdowns: same window, same island rule, sessions not page loads.
  const isl = sessionIslands(companyId, windowStart, now);
  const paths = await db
    .select({
      label: isl.path,
      pageviews: sql<number>`COUNT(*) FILTER (WHERE ${isl.type} = 'pageview')::int`.as("pageviews"),
      sessions: sql<number>`COUNT(DISTINCT ${isl.visitKey}) FILTER (WHERE ${isl.type} = 'pageview')::int`.as("sessions"),
    })
    .from(isl)
    .groupBy(isl.path)
    .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${isl.type} = 'pageview')`))
    .limit(10);

  const devFrag = deviceFragment(isl.viewport);
  const devices = await db
    .select({
      label: sql<string>`${devFrag}`.as("label"),
      pageviews: sql<number>`COUNT(*) FILTER (WHERE ${isl.type} = 'pageview')::int`.as("pageviews"),
      sessions: sql<number>`COUNT(DISTINCT ${isl.visitKey}) FILTER (WHERE ${isl.type} = 'pageview')::int`.as("sessions"),
    })
    .from(isl)
    .groupBy(sql`${devFrag}`)
    .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${isl.type} = 'pageview')`));

  return {
    kind: "engagement",
    companyId,
    rangeDays,
    totals: summary.totals,
    trend: summary.trend,
    breakdowns: {
      path: paths
        .filter((r) => (r.label ?? "").length > 0 && Number(r.pageviews ?? 0) > 0)
        .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })),
      device: devices
        .filter((r) => Number(r.pageviews ?? 0) > 0)
        .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })),
    },
    freshness: await reportFreshness(false, dataQuality),
  };
}
