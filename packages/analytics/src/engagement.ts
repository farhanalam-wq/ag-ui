/**
 * packages/analytics/src/engagement.ts
 *
 * Phase 2 — engagement reporting from first-party data only.
 * ORM-first: per-session inner select via the builder, server-side
 * outer aggregation over the subquery (no raw CTE strings).
 * Engaged session = 2+ pageviews OR any interaction event (chat,
 * conversion, scroll, download, configured click).
 *
 * Honesty note: sessions here are distinct tab-sessions from the raw
 * window (no 30-min island split), so they can differ slightly from the
 * island-counted website totals. Flagged in dataQuality, never hidden.
 */

import { db, pageViews, sessions as sessionsTable, sql, eq, and, gte, lt, desc } from "@ag-ui/database";
import { freshnessStub, type EngagementReport } from "./registry";
import { deviceFragment, pageViewsWindow } from "./attribution";

const ENGAGED_TYPES = "'chat_open', 'chat_message', 'conversion', 'scroll', 'download', 'click'";

export async function getEngagementReport(
  companyId: string,
  rangeDays: number
): Promise<EngagementReport> {
  const dataQuality = ["engagement-denominator-raw"];
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays * 86_400_000);

  const perSession = () =>
    db
      .select({
        sessionHash: pageViews.sessionHash,
        pv: sql<number>`COUNT(*) FILTER (WHERE ${pageViews.type} = 'pageview')::int`.as("pv"),
        interacted: sql<boolean>`BOOL_OR(${pageViews.type} IN (${sql.raw(ENGAGED_TYPES)}))`.as("interacted"),
      })
      .from(pageViews)
      .where(pageViewsWindow(companyId, from, to))
      .groupBy(pageViews.sessionHash)
      .as("s");

  const perSessionDaily = () =>
    db
      .select({
        day: sql<string>`(${pageViews.createdAt}::date)::text`.as("d"),
        sessionHash: pageViews.sessionHash,
        pv: sql<number>`COUNT(*) FILTER (WHERE ${pageViews.type} = 'pageview')::int`.as("pv"),
        interacted: sql<boolean>`BOOL_OR(${pageViews.type} IN (${sql.raw(ENGAGED_TYPES)}))`.as("interacted"),
      })
      .from(pageViews)
      .where(pageViewsWindow(companyId, from, to))
      .groupBy(sql`(${pageViews.createdAt}::date)`, pageViews.sessionHash)
      .as("sd");

  const s = perSession();
  const [tot] = await db
    .select({
      sessions: sql<number>`COUNT(*)::int`.as("sessions"),
      pageviews: sql<number>`COALESCE(SUM(${s.pv}), 0)::int`.as("pageviews"),
      engaged: sql<number>`COUNT(*) FILTER (WHERE ${s.pv} >= 2 OR ${s.interacted})::int`.as("engaged"),
    })
    .from(s);
  const sessions = Number(tot?.sessions ?? 0);
  const pageviews = Number(tot?.pageviews ?? 0);
  const engaged = Number(tot?.engaged ?? 0);
  if (sessions === 0 && pageviews === 0) dataQuality.push("tracking-off");

  const sd = perSessionDaily();
  const daily = await db
    .select({
      d: sd.day,
      sessions: sql<number>`COUNT(*)::int`.as("sessions"),
      pageviews: sql<number>`COALESCE(SUM(${sd.pv}), 0)::int`.as("pageviews"),
      engagedSessions: sql<number>`COUNT(*) FILTER (WHERE ${sd.pv} >= 2 OR ${sd.interacted})::int`.as("engagedSessions"),
    })
    .from(sd)
    .groupBy(sd.day)
    .orderBy(sd.day);
  const byD = new Map(daily.map((r) => [String(r.d).slice(0, 10), r]));
  const trend = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    const d = new Date(to.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const r = byD.get(d);
    trend.push({
      d,
      sessions: Number(r?.sessions ?? 0),
      pageviews: Number(r?.pageviews ?? 0),
      engagedSessions: Number(r?.engagedSessions ?? 0),
    });
  }

  const paths = await db
    .select({
      label: pageViews.path,
      pageviews: sql<number>`COUNT(*)::int`.as("pageviews"),
      sessions: sql<number>`COUNT(DISTINCT ${pageViews.sessionHash})::int`.as("sessions"),
    })
    .from(pageViews)
    .where(pageViewsWindow(companyId, from, to))
    .groupBy(pageViews.path)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);

  const devFrag = deviceFragment(pageViews.viewport);
  const devices = await db
    .select({
      label: sql<string>`${devFrag}`.as("label"),
      pageviews: sql<number>`COUNT(*) FILTER (WHERE ${pageViews.type} = 'pageview')::int`.as("pageviews"),
      sessions: sql<number>`COUNT(DISTINCT ${pageViews.sessionHash})::int`.as("sessions"),
    })
    .from(pageViews)
    .where(pageViewsWindow(companyId, from, to))
    .groupBy(sql`${devFrag}`)
    .orderBy(desc(sql`COUNT(*)`));

  // Interaction events + heartbeat-derived active time.
  const evCount = async (type: string) => {
    const [r] = await db
      .select({ c: sql<number>`COUNT(*)::int`.as("c") })
      .from(pageViews)
      .where(and(pageViewsWindow(companyId, from, to), eq(pageViews.type, type)));
    return Number(r?.c ?? 0);
  };
  const [scrolls, downloads, clicks] = await Promise.all([evCount("scroll"), evCount("download"), evCount("click")]);
  const [act] = await db
    .select({
      secs: sql<number>`COALESCE(SUM(${sessionsTable.activeSeconds}), 0)::int`.as("secs"),
      n: sql<number>`COUNT(*)::int`.as("n"),
    })
    .from(sessionsTable)
    .where(
      and(eq(sessionsTable.companyId, companyId), gte(sessionsTable.startedAt, from), lt(sessionsTable.startedAt, to))
    );
  const engagedSessions = engaged;

  return {
    kind: "engagement",
    companyId,
    rangeDays,
    totals: {
      sessions,
      pageviews,
      engagedSessions,
      engagementRate: sessions > 0 ? Math.round((engaged / sessions) * 1000) / 10 : 0,
      scrolls,
      downloads,
      clicks,
      avgEngagementTime: Number(act?.n ?? 0) > 0 ? Math.round((Number(act?.secs ?? 0) / Number(act?.n ?? 1)) * 10) / 10 : 0,
    },
    trend,
    byPath: paths
      .filter((r) => (r.label ?? "").length > 0)
      .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })),
    byDevice: devices.map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) })),
    freshness: freshnessStub(false, dataQuality),
  };
}
