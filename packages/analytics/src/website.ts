/**
 * packages/analytics/src/website.ts
 *
 * GA-style website analytics from rollups (trend/totals) + bounded raw
 * scans (top pages, referrers, viewports). Humans-only throughout
 * (is_bot=false is a stored flag, so the filter is free).
 *
 * ORM-first: Drizzle builder for every query. Aggregates that Postgres
 * returns as bigint/numeric are cast in SQL (`::int`, `::float`) so the
 * values stay numbers in JS, and `day` is read as text because the driver
 * parses `date` columns into Date objects.
 */

import {
  db,
  metricsDaily,
  pageViews,
  sql,
  eq,
  and,
  gte,
  desc,
  type PgColumn,
} from "@ag-ui/database";
import type { CacheRedis } from "./cache";
import { dailyUniquesKey } from "./identity";
import { reportFreshness, type Freshness } from "./registry";

export interface WebsiteTrendPoint {
  d: string;
  pageviews: number;
  sessions: number;
}
export interface RankedRow {
  label: string;
  views: number;
}

export async function getWebsiteAnalytics(
  redis: CacheRedis | null,
  companyId: string,
  rangeDays: number
): Promise<{
  companyId: string;
  rangeDays: number;
  totals: { sessions: number; pageviews: number; uniques: number | null; conversions: number };
  trend: WebsiteTrendPoint[];
  topPages: RankedRow[];
  referrers: RankedRow[];
  viewports: RankedRow[];
  freshness: Freshness;
}> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromISO = new Date(now.getTime() - rangeDays * 86_400_000).toISOString();

  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }

  const tRows = await db
    .select({
      day: sql<string>`${metricsDaily.day}::text`.as("day"),
      pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`.as("pv"),
      se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`.as("se"),
      cv: sql<number>`COALESCE(SUM(${metricsDaily.conversions}), 0)::int`.as("cv"),
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, fromISO.slice(0, 10))))
    .groupBy(metricsDaily.day)
    .orderBy(metricsDaily.day);
  const byDay = new Map(tRows.map((r) => [r.day.slice(0, 10), r]));
  const trend: WebsiteTrendPoint[] = days.map((d) => ({
    d,
    pageviews: byDay.get(d)?.pv ?? 0,
    sessions: byDay.get(d)?.se ?? 0,
  }));
  const totals = {
    sessions: trend.reduce((a, t) => a + t.sessions, 0),
    pageviews: trend.reduce((a, t) => a + t.pageviews, 0),
    uniques: null as number | null,
    conversions: tRows.reduce((a, r) => a + (r.cv ?? 0), 0),
  };
  if (totals.sessions === 0 && totals.pageviews === 0) dataQuality.push("tracking-off");

  // Uniques: PFMERGE the daily HLL keys (bounded: at most `rangeDays` keys).
  if (redis) {
    try {
      const keys = days.map((d) => dailyUniquesKey(companyId, d));
      const tmp = `ahll:merge:${companyId}:${Date.now()}`;
      await redis.pfmerge(tmp, ...keys);
      await redis.expire(tmp, 300);
      totals.uniques = await redis.pfcount(tmp);
      await redis.del(tmp).catch(() => {});
    } catch {
      dataQuality.push("uniques-unavailable");
    }
  } else {
    dataQuality.push("uniques-unavailable");
  }

  const top = async (col: PgColumn): Promise<RankedRow[]> => {
    const rows = await db
      .select({
        label: sql<string>`${col}`.as("label"),
        views: sql<number>`COUNT(*)::int`.as("views"),
      })
      .from(pageViews)
      .where(
        and(
          eq(pageViews.companyId, companyId),
          eq(pageViews.type, "pageview"),
          eq(pageViews.isBot, false),
          gte(pageViews.createdAt, new Date(fromISO))
        )
      )
      .groupBy(col)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);
    return rows
      .filter((r) => (r.label ?? "").length > 0)
      .map((r) => ({ label: r.label.length > 80 ? r.label.slice(0, 80) : r.label, views: r.views }));
  };

  return {
    companyId,
    rangeDays,
    totals,
    trend,
    topPages: await top(pageViews.path),
    referrers: await top(pageViews.referrer),
    viewports: await top(pageViews.viewport),
    freshness: await reportFreshness(false, dataQuality),
  };
}
