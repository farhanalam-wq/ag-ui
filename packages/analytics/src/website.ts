/**
 * packages/analytics/src/website.ts
 *
 * The Website surface's headline report: sessions, uniques, views, how
 * engaged those visits were, and the page/referrer/viewport splits behind
 * them.
 *
 * Two sources, one rule. Totals and trend come from `metrics_daily` — the same
 * rollup every other report reads — so "Sessions" can never differ between the
 * Website tabs. The splits are bounded raw scans of the event stream, because
 * path, referrer and viewport are not rolled up. Humans only: `is_bot` is a
 * stored flag, so the filter is free.
 *
 * The engagement totals live here rather than in a second report because the
 * Overview tab shows them next to traffic, and two queries computing "engaged
 * sessions" is how two pages start disagreeing. `getEngagementReport` (until
 * the Engagement page retires) reads the same helper.
 *
 * ORM-first: Drizzle builder for every query. Aggregates Postgres returns as
 * bigint/numeric are cast in SQL (`::int`, `::float`) so the values stay
 * numbers in JS, and `day` is read as text because the driver parses `date`
 * columns into Date objects.
 */

import {
  db,
  metricsDaily,
  pageViews,
  sessions as sessionsTable,
  sql,
  eq,
  and,
  gte,
  lt,
  desc,
  type PgColumn,
} from "@ag-ui/database";
import type { CacheRedis } from "./cache";
import { dailyUniquesKey } from "./identity";
import { bounceRate, engagementRate, pagesPerSession } from "./sessions";
import {
  reportFreshness,
  type BreakdownRow,
  type TrendPoint,
  type WebsiteReport,
} from "./registry";

/** The UTC calendar days a report window covers, oldest first. */
function calendarDays(rangeDays: number, now: Date): string[] {
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return days;
}

export interface EngagementSummary {
  totals: Record<string, number>;
  trend: TrendPoint[];
  dataQuality: string[];
}

/**
 * Visits and how engaged they were, from the rollup plus the visit fact table.
 *
 * Shared with the engagement report until that page retires: the numbers are
 * the same numbers, so they are computed once.
 */
export async function getEngagementTotals(
  companyId: string,
  rangeDays: number
): Promise<EngagementSummary> {
  const dataQuality: string[] = [];
  const now = new Date();
  const days = calendarDays(rangeDays, now);
  const fromDay = days[0]!;

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

  const trend: TrendPoint[] = days.map((d) => {
    const r = byDay.get(d);
    return {
      d,
      sessions: Number(r?.sessions ?? 0),
      pageviews: Number(r?.pageviews ?? 0),
      engagedSessions: Number(r?.engagedSessions ?? 0),
    };
  });

  const sum = (pick: (r: (typeof tRows)[number]) => number | null | undefined) =>
    tRows
      .filter((r) => daySet.has(String(r.day).slice(0, 10)))
      .reduce((a, r) => a + Number(pick(r) ?? 0), 0);

  const sessions = trend.reduce((a, t) => a + Number(t.sessions ?? 0), 0);
  const pageviews = trend.reduce((a, t) => a + Number(t.pageviews ?? 0), 0);
  const engaged = trend.reduce((a, t) => a + Number(t.engagedSessions ?? 0), 0);
  const scrolls = sum((r) => r.scrolls);
  const downloads = sum((r) => r.downloads);
  const clicks = sum((r) => r.clicks);
  if (sessions === 0 && pageviews === 0) dataQuality.push("tracking-off");

  // Active time lives on the visit fact table the rollup writes. It is a mean
  // over visits started in the window, not over the rollup rows, so a visit
  // that spans midnight is counted once.
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

  return {
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
    dataQuality,
  };
}

export async function getWebsiteReport(
  redis: CacheRedis | null,
  companyId: string,
  rangeDays: number
): Promise<WebsiteReport> {
  const now = new Date();
  const days = calendarDays(rangeDays, now);
  // The same calendar window the rollup reports on. A rolling 30×24h scan here
  // would let the top-pages card include a partial day the KPI row excludes,
  // and the cards would stop adding up.
  const windowStart = new Date(`${days[0]}T00:00:00Z`);
  const summary = await getEngagementTotals(companyId, rangeDays);
  const dataQuality = [...summary.dataQuality];
  const totals: Record<string, number> = { ...summary.totals };

  // Uniques: PFMERGE the daily HLL keys (bounded: at most `rangeDays` keys).
  // A null is reported as an absent metric, never as zero.
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

  const top = async (
    col: PgColumn,
    /**
     * What an empty value means for this dimension. A missing referrer is
     * direct traffic — the largest bucket on most sites — and dropping it
     * would make the card a list of exceptions. A missing path is not a page,
     * so it is dropped (`null`).
     */
    emptyLabel: string | null
  ): Promise<BreakdownRow[]> => {
    const rows = await db
      .select({
        label: sql<string>`${col}`.as("label"),
        pageviews: sql<number>`COUNT(*)::int`.as("pageviews"),
      })
      .from(pageViews)
      .where(
        and(
          eq(pageViews.companyId, companyId),
          eq(pageViews.type, "pageview"),
          eq(pageViews.isBot, false),
          gte(pageViews.createdAt, windowStart)
        )
      )
      .groupBy(col)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10);
    return rows.flatMap((r) => {
      const raw = (r.label ?? "").trim();
      if (raw.length === 0 && emptyLabel === null) return [];
      const label = raw.length === 0 ? emptyLabel! : raw;
      return [
        {
          label: label.length > 80 ? label.slice(0, 80) : label,
          pageviews: Number(r.pageviews ?? 0),
        },
      ];
    });
  };

  return {
    kind: "website",
    companyId,
    rangeDays,
    totals,
    trend: summary.trend,
    breakdowns: {
      path: await top(pageViews.path, null),
      referrer: await top(pageViews.referrer, "(direct)"),
      viewport: await top(pageViews.viewport, "(unknown)"),
    },
    freshness: await reportFreshness(false, dataQuality),
  };
}
