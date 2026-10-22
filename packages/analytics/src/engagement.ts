/**
 * packages/analytics/src/engagement.ts
 *
 * Phase 2 — engagement reporting from first-party data only.
 *
 * One unit. A "session" is a visit: a run of events with no gap wider
 * than SESSION_GAP_MINUTES (see sessions.ts). The KPI row and the trend
 * are read from the same rollup the Website page reads, so two pages can
 * never show different "Sessions" numbers for the same company and range.
 * The rollup owns the per-visit `engaged` verdict; this module never
 * recomputes it.
 *
 * The breakdown tables are raw scans — path and device need the event
 * stream — but they count sessions, not page loads: the same island rule
 * the rollup uses is applied to the events in the window.
 */

import { db, sessions as sessionsTable, metricsDaily, sql, eq, and, gte, lt, desc } from "@ag-ui/database";
import { reportFreshness, type EngagementReport } from "./registry";
import { deviceFragment } from "./attribution";
import { bounceRate, engagementRate, pagesPerSession, sessionIslands } from "./sessions";

export async function getEngagementReport(
  companyId: string,
  rangeDays: number
): Promise<EngagementReport> {
  const dataQuality: string[] = [];
  const now = new Date();

  // The same calendar days the Website page reports on, so the headline
  // "Sessions" figure is identical on both pages.
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  const fromDay = days[0];

  const tRows = await db
    .select({
      day: sql<string>`${metricsDaily.day}::text`.as("day"),
      pageviews: metricsDaily.pageviews,
      sessions: metricsDaily.sessions,
      engagedSessions: metricsDaily.engagedSessions,
      scrolls: metricsDaily.scrolls,
      downloads: metricsDaily.downloads,
      clicks: metricsDaily.clicks,
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, fromDay)))
    .orderBy(metricsDaily.day);
  const byDay = new Map(tRows.map((r) => [String(r.day).slice(0, 10), r]));
  const daySet = new Set(days);

  const trend = days.map((d) => {
    const r = byDay.get(d);
    return {
      d,
      sessions: Number(r?.sessions ?? 0),
      pageviews: Number(r?.pageviews ?? 0),
      engagedSessions: Number(r?.engagedSessions ?? 0),
    };
  });
  const sum = (pick: (r: (typeof tRows)[number]) => number | null | undefined) =>
    tRows.filter((r) => daySet.has(String(r.day).slice(0, 10))).reduce((a, r) => a + Number(pick(r) ?? 0), 0);

  const sessions = trend.reduce((a, t) => a + t.sessions, 0);
  const pageviews = trend.reduce((a, t) => a + t.pageviews, 0);
  const engaged = trend.reduce((a, t) => a + t.engagedSessions, 0);
  const scrolls = sum((r) => r.scrolls);
  const downloads = sum((r) => r.downloads);
  const clicks = sum((r) => r.clicks);
  if (sessions === 0 && pageviews === 0) dataQuality.push("tracking-off");

  // Active time lives on the visit fact table the rollup writes.
  const windowStart = new Date(`${fromDay}T00:00:00Z`);
  const [act] = await db
    .select({
      secs: sql<number>`COALESCE(SUM(${sessionsTable.activeSeconds}), 0)::int`.as("secs"),
      n: sql<number>`COUNT(*)::int`.as("n"),
    })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.companyId, companyId),
        gte(sessionsTable.startedAt, windowStart),
        lt(sessionsTable.startedAt, now)
      )
    );
  const visits = Number(act?.n ?? 0);
  const activeSeconds = Number(act?.secs ?? 0);

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
    totals: {
      sessions,
      pageviews,
      engagedSessions: engaged,
      engagementRate: engagementRate(engaged, sessions),
      bounceRate: bounceRate(engaged, sessions),
      pagesPerSession: pagesPerSession(pageviews, sessions),
      scrolls,
      downloads,
      clicks,
      avgEngagementTime: visits > 0 ? Math.round((activeSeconds / visits) * 10) / 10 : 0,
    },
    trend,
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
