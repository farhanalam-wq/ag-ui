/**
 * packages/analytics/src/website.ts
 *
 * GA-style website analytics from rollups (trend/totals) + bounded raw
 * scans (top pages, referrers, viewports). Humans-only throughout
 * (is_bot=false is a stored flag, so the filter is free).
 */

import { client } from "@ag-ui/database";
import type { CacheRedis } from "./cache";
import { dailyUniquesKey } from "./identity";

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
  dataQuality: string[];
}> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromISO = new Date(now.getTime() - rangeDays * 86_400_000).toISOString();

  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }

  const tRows = (await client.unsafe(
    `SELECT day::text AS day, SUM(pageviews)::int AS pv, SUM(sessions)::int AS se,
      SUM(conversions)::int AS cv FROM metrics_daily
      WHERE company_id = $1 AND day >= $2::date GROUP BY day ORDER BY day;`,
    [companyId, fromISO.slice(0, 10)]
  )) as Array<{ day: string; pv: number; se: number; cv: number }>;
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

  const top = async (col: string, label: string, extra = ""): Promise<RankedRow[]> => {
    const rows = (await client.unsafe(
      `SELECT ${col} AS label, COUNT(*)::int AS views FROM page_views
       WHERE company_id = $1 AND type = 'pageview' AND is_bot = false
       AND created_at >= $2 ${extra} GROUP BY ${col} ORDER BY views DESC LIMIT 10;`,
      [companyId, fromISO]
    )) as Array<{ label: string; views: number }>;
    return rows
      .filter((r) => (r.label ?? "").length > 0)
      .map((r) => ({ label: r.label.length > 80 ? r.label.slice(0, 80) : r.label, views: r.views }));
  };

  return {
    companyId,
    rangeDays,
    totals,
    trend,
    topPages: await top("path", "path"),
    referrers: await top("referrer", "referrer"),
    viewports: await top("viewport", "viewport"),
    dataQuality,
  };
}
