/**
 * packages/analytics/src/acquisition.ts
 *
 * Phase 2 — acquisition reporting from first-party data only.
 * ORM-first: drizzle builder throughout; `sql` fragments only for
 * Postgres-native regex/CASE/FILTER (see attribution.ts).
 *
 * Totals/trend/uniques from rollups + HLL; channel/source/medium/
 * campaign breakdowns from one bounded attr CTE scan. A channel filter
 * re-scopes totals from the same scan (rollups cannot split by channel)
 * and uniques report null honestly.
 */

import { db, metricsDaily, sql, eq, and, or, desc } from "@ag-ui/database";
import type { CacheRedis } from "./cache";
import { dailyUniquesKey } from "./identity";
import {
  freshnessStub,
  type AcquisitionReport,
  type BreakdownRow,
  type Channel,
} from "./registry";
import { visitAttrCTEs } from "./attribution";
import { sessionIslands } from "./sessions";

async function mergeUniques(redis: CacheRedis | null, companyId: string, days: string[]): Promise<number | null> {
  if (!redis || days.length === 0) return null;
  try {
    const tmp = `ahll:merge:${companyId}:${Date.now()}`;
    await redis.pfmerge(tmp, ...days.map((d) => dailyUniquesKey(companyId, d)));
    await redis.expire(tmp, 300);
    const n = await redis.pfcount(tmp);
    await redis.del(tmp).catch(() => {});
    return n;
  } catch {
    return null;
  }
}

async function breakdown(
  companyId: string,
  from: Date,
  to: Date,
  channels: Channel[],
  label: (a2: ReturnType<typeof visitAttrCTEs>["v2"]) => ReturnType<typeof sql<string>>
): Promise<BreakdownRow[]> {
  const { v1, v2 } = visitAttrCTEs(companyId, from, to);
  const pvCount = sql<number>`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')::int`;
  const sessCount = sql<number>`COUNT(DISTINCT ${v2.visitKey}) FILTER (WHERE ${v2.type} = 'pageview')::int`;
  const labelFrag = label(v2);
  const rows = await db
    .with(v1, v2)
    .select({ label: sql<string>`${labelFrag}`.as("label"), pageviews: pvCount.as("pageviews"), sessions: sessCount.as("sessions") })
    .from(v2)
    .where(channels.length > 0 ? or(...channels.map((c) => eq(v2.channel, c))) : undefined)
    .groupBy(sql`${labelFrag}`)
    .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')`))
    .limit(10);
  return rows
    .filter((r) => (r.label ?? "").length > 0)
    .map((r) => ({ label: r.label, pageviews: Number(r.pageviews ?? 0), sessions: Number(r.sessions ?? 0) }));
}

/**
 * Totals for a channel filter, in the same unit as the unfiltered totals.
 *
 * The rollup cannot split by channel, so a filtered total has to come from
 * the scan. It counts visits that touched any selected channel exactly once
 * — not the sum of the per-channel rows, which would count a visit that
 * spans two channels twice (F-13).
 */
async function filteredTotals(
  companyId: string,
  from: Date,
  to: Date,
  channels: Channel[]
): Promise<{ sessions: number; pageviews: number }> {
  const { v1, v2 } = visitAttrCTEs(companyId, from, to);
  const rows = await db
    .with(v1, v2)
    .select({
      sessions: sql<number>`COUNT(DISTINCT ${v2.visitKey}) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("sessions"),
      pageviews: sql<number>`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("pageviews"),
    })
    .from(v2)
    .where(or(...channels.map((c) => eq(v2.channel, c))));
  return { sessions: Number(rows[0]?.sessions ?? 0), pageviews: Number(rows[0]?.pageviews ?? 0) };
}

export async function getAcquisitionReport(
  redis: CacheRedis | null,
  companyId: string,
  rangeDays: number,
  compare: boolean,
  channels: Channel[]
): Promise<AcquisitionReport> {
  const dataQuality: string[] = [];
  const nowMs = Date.now();
  const from = new Date(nowMs - rangeDays * 86_400_000);
  const to = new Date(nowMs);
  const prevFrom = new Date(from.getTime() - rangeDays * 86_400_000);
  const fromDay = from.toISOString().slice(0, 10);

  const dayList = (endExclusiveDay: string, n: number) => {
    // Last n UTC calendar days ending the day before endExclusiveDay.
    const end = new Date(`${endExclusiveDay}T00:00:00Z`).getTime();
    const out: string[] = [];
    for (let i = n; i >= 1; i--) out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
    return out;
  };

  const tRows = await db
    .select({
      day: sql<string>`${metricsDaily.day}::text`.as("day"),
      pv: metricsDaily.pageviews,
      se: metricsDaily.sessions,
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), sql`${metricsDaily.day} >= ${fromDay}::date`))
    .orderBy(metricsDaily.day);
  const byDay = new Map(tRows.map((r) => [r.day.slice(0, 10), r]));
  const days = dayList(new Date(nowMs + 86_400_000).toISOString().slice(0, 10), rangeDays);
  const trend = days.map((d) => ({ d, pageviews: byDay.get(d)?.pv ?? 0, sessions: byDay.get(d)?.se ?? 0 }));
  const totals = {
    sessions: trend.reduce((a, t) => a + t.sessions, 0),
    pageviews: trend.reduce((a, t) => a + t.pageviews, 0),
  };
  if (totals.sessions === 0 && totals.pageviews === 0) dataQuality.push("tracking-off");

  const uniques = await mergeUniques(redis, companyId, days);
  if (uniques === null) dataQuality.push("uniques-unavailable");

  let previousTotals: Record<string, number> | undefined;
  if (compare) {
    const pr = await db
      .select({ pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`.as("pv"), se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`.as("se") })
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.companyId, companyId),
          sql`${metricsDaily.day} >= ${prevFrom.toISOString().slice(0, 10)}::date`,
          sql`${metricsDaily.day} < ${fromDay}::date`
        )
      );
    previousTotals = { sessions: Number(pr[0]?.se ?? 0), pageviews: Number(pr[0]?.pv ?? 0) };
    const prevU = await mergeUniques(redis, companyId, dayList(fromDay, rangeDays));
    if (prevU !== null) previousTotals.uniques = prevU;
  }

  const byChannel = await breakdown(companyId, from, to, channels, (a2) => sql<string>`${a2.channel}`);
  const bySourceMedium = await breakdown(companyId, from, to, channels, (a2) => sql<string>`${a2.source} || ' / ' || ${a2.medium}`);
  const byCampaign = await breakdown(companyId, from, to, channels, (a2) => sql<string>`${a2.campaign}`);

  // Landing pages: entry path per visit via ordered array_agg (builder + one aggregate fragment).
  const isl = sessionIslands(companyId, from, to);
  const perVisit = db
    .select({
      vk: isl.visitKey,
      pv: sql<number>`COUNT(*) FILTER (WHERE ${isl.type} = 'pageview')::int`.as("pv"),
      entryPath: sql<string>`(array_agg(${isl.path} ORDER BY ${isl.createdAt}) FILTER (WHERE ${isl.type} = 'pageview'))[1]`.as("entry_path"),
    })
    .from(isl)
    .groupBy(isl.visitKey)
    .as("entry");
  const landing = await db
    .select({
      label: perVisit.entryPath,
      sessions: sql<number>`COUNT(*)::int`.as("sessions"),
      pageviews: sql<number>`COALESCE(SUM(${perVisit.pv}), 0)::int`.as("pageviews"),
    })
    .from(perVisit)
    .groupBy(perVisit.entryPath)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);
  const byLandingPage: BreakdownRow[] = landing
    .filter((r) => (r.label ?? "").length > 0)
    .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) }));

  // Filtered totals come from the scan (rollups cannot split by channel).
  let outTotals: Record<string, number> = { ...totals };
  let outUniques: number | null = uniques;
  if (channels.length > 0) {
    const filtered = await filteredTotals(companyId, from, to, channels);
    outTotals = { sessions: filtered.sessions, pageviews: filtered.pageviews };
    outUniques = null;
    dataQuality.push("uniques-unavailable-filtered");
  }

  return {
    kind: "acquisition",
    companyId,
    rangeDays,
    compare: compare ? "previous-period" : "off",
    totals: { ...outTotals, ...(outUniques !== null ? { uniques: outUniques } : {}) },
    ...(previousTotals ? { previousTotals } : {}),
    trend,
    byChannel,
    bySourceMedium,
    byCampaign,
    byLandingPage,
    freshness: freshnessStub(false, dataQuality),
  };
}
