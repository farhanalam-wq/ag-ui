/**
 * packages/analytics/src/rollup.ts
 *
 * Phase 3 — rollup builder, HLL uniques, retention. All recomputes are
 * idempotent (INSERT ... ON CONFLICT DO UPDATE), so overlapping ticks or
 * multi-replica runs converge instead of corrupting.
 *
 * - sessions: gap-and-island over bounded windows (30-min inactivity splits
 *   one tab-session into two sessions). Keyed (company, session_hash,
 *   started_at) — see migrate-analytics-phase3.ts.
 * - metrics_hourly / metrics_daily: dashboard read path. Dashboards never
 *   touch raw page_views.
 * - HLL uniques: rebuilt per company-day from raw (bounded scan), read via
 *   PFMERGE in Phase 5. Raw IP never involved — hashes only.
 */

import { randomUUID } from "node:crypto";
import { client } from "@ag-ui/database";
import { dailyUniquesKey } from "./identity";
import type { CacheRedis } from "./cache";

export const SESSION_GAP_MINUTES = 30;
export const HLL_TTL_SECONDS = 30 * 86_400;

/** Minimal Redis surface (kept structural so tests can stub it). */
export interface RollupRedis extends CacheRedis {
  set(key: string, val: string, ...args: unknown[]): Promise<unknown>;
  eval(script: string, numkeys: number, ...args: unknown[]): Promise<unknown>;
  pfadd(key: string, ...members: string[]): Promise<unknown>;
  scan(cursor: string, ...args: unknown[]): Promise<[string, string[]]>;
}

const ISLAND_CASE = `CASE WHEN prev IS NULL OR created_at - prev > interval '${SESSION_GAP_MINUTES} minutes' THEN 1 ELSE 0 END`;

/**
 * Upserts session rows for [fromISO, toISO). Returns island count.
 * Safe to rerun: same islands produce the same keys.
 */
export async function upsertSessions(fromISO: string, toISO: string): Promise<number> {
  const rows = (await client.unsafe(
    `
    WITH ev AS (
      SELECT company_id, session_hash, created_at, type, value,
             LAG(created_at) OVER (PARTITION BY company_id, session_hash ORDER BY created_at) AS prev
      FROM page_views WHERE created_at >= $1 AND created_at < $2
    ),
    islands AS (
      SELECT company_id, session_hash, created_at, type, value,
             SUM(${ISLAND_CASE}) OVER (PARTITION BY company_id, session_hash ORDER BY created_at) AS island
      FROM ev
    ),
    sess AS (
      SELECT company_id, session_hash,
             MIN(created_at) AS started_at, MAX(created_at) AS ended_at,
             COUNT(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
             BOOL_OR(type = 'conversion') AS converted,
             COALESCE(SUM(value) FILTER (WHERE type = 'conversion'), 0) AS revenue
      FROM islands GROUP BY company_id, session_hash, island
    )
    INSERT INTO sessions (company_id, session_hash, started_at, ended_at, pageview_count, converted, revenue)
    SELECT company_id, session_hash, started_at, ended_at, pageviews, converted, revenue FROM sess
    ON CONFLICT (company_id, session_hash, started_at) DO UPDATE SET
      ended_at = EXCLUDED.ended_at,
      pageview_count = EXCLUDED.pageview_count,
      converted = EXCLUDED.converted,
      revenue = EXCLUDED.revenue
    RETURNING id;`,
    [fromISO, toISO]
  )) as unknown[];
  return rows.length;
}

const METRIC_COLS = "pageviews, sessions, conversions, revenue, chat_opens, messages";
const METRIC_UPDATE = `pageviews = EXCLUDED.pageviews, sessions = EXCLUDED.sessions,
  conversions = EXCLUDED.conversions, revenue = EXCLUDED.revenue,
  chat_opens = EXCLUDED.chat_opens, messages = EXCLUDED.messages`;

/** Recomputes one hourly bucket for all companies with raw data in it. */
export async function buildHourlyRollup(hourISO: string): Promise<number> {
  const hour = new Date(hourISO);
  hour.setUTCMinutes(0, 0, 0);
  const from = hour.toISOString();
  const to = new Date(hour.getTime() + 3_600_000).toISOString();
  await upsertSessions(from, to);
  const rows = (await client.unsafe(
    `
    WITH pv AS (
      SELECT company_id,
        COUNT(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
        COUNT(*) FILTER (WHERE type = 'conversion')::int AS conversions,
        COALESCE(SUM(value) FILTER (WHERE type = 'conversion'), 0) AS revenue,
        COUNT(*) FILTER (WHERE type = 'chat_open')::int AS chat_opens,
        COUNT(*) FILTER (WHERE type = 'chat_message')::int AS messages
      FROM page_views WHERE created_at >= $1 AND created_at < $2 GROUP BY company_id
    ),
    ss AS (
      SELECT company_id, COUNT(*)::int AS sessions FROM sessions
      WHERE started_at >= $1 AND started_at < $2 GROUP BY company_id
    )
    INSERT INTO metrics_hourly (company_id, hour, ${METRIC_COLS})
    SELECT pv.company_id, $1::timestamptz, pv.pageviews, COALESCE(ss.sessions, 0),
      pv.conversions, pv.revenue, pv.chat_opens, pv.messages
    FROM pv LEFT JOIN ss ON ss.company_id = pv.company_id
    ON CONFLICT (company_id, hour) DO UPDATE SET ${METRIC_UPDATE}
    RETURNING company_id;`,
    [from, to]
  )) as unknown[];
  return rows.length;
}

/** Recomputes one daily bucket (UTC day) for all companies with raw data. */
export async function buildDailyRollup(dayISO: string): Promise<number> {
  const day = dayISO.slice(0, 10);
  const from = `${day}T00:00:00Z`;
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();
  await upsertSessions(from, to);
  const rows = (await client.unsafe(
    `
    WITH pv AS (
      SELECT company_id,
        COUNT(*) FILTER (WHERE type = 'pageview')::int AS pageviews,
        COUNT(*) FILTER (WHERE type = 'conversion')::int AS conversions,
        COALESCE(SUM(value) FILTER (WHERE type = 'conversion'), 0) AS revenue,
        COUNT(*) FILTER (WHERE type = 'chat_open')::int AS chat_opens,
        COUNT(*) FILTER (WHERE type = 'chat_message')::int AS messages
      FROM page_views WHERE created_at >= $1 AND created_at < $2 GROUP BY company_id
    ),
    ss AS (
      SELECT company_id, COUNT(*)::int AS sessions FROM sessions
      WHERE started_at >= $1 AND started_at < $2 GROUP BY company_id
    )
    INSERT INTO metrics_daily (company_id, day, ${METRIC_COLS})
    SELECT pv.company_id, $1::date, pv.pageviews, COALESCE(ss.sessions, 0),
      pv.conversions, pv.revenue, pv.chat_opens, pv.messages
    FROM pv LEFT JOIN ss ON ss.company_id = pv.company_id
    ON CONFLICT (company_id, day) DO UPDATE SET ${METRIC_UPDATE}
    RETURNING company_id;`,
    [from, to]
  )) as unknown[];
  return rows.length;
}

/**
 * Rebuilds Redis HLL uniques for one UTC day from raw hashes (bounded scan).
 * Returns per-company { added, estimate }.
 */
export async function rebuildDailyHll(
  redis: RollupRedis,
  dayISO: string
): Promise<Record<string, { added: number; estimate: number }>> {
  const day = dayISO.slice(0, 10);
  const from = `${day}T00:00:00Z`;
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();
  const cos = (await client.unsafe(
    `SELECT DISTINCT company_id FROM page_views WHERE created_at >= $1 AND created_at < $2;`,
    [from, to]
  )) as Array<{ company_id: string }>;
  const out: Record<string, { added: number; estimate: number }> = {};
  for (const { company_id } of cos) {
    const hashes = (await client.unsafe(
      `SELECT visitor_hash FROM page_views WHERE company_id = $1 AND created_at >= $2 AND created_at < $3;`,
      [company_id, from, to]
    )) as Array<{ visitor_hash: string }>;
    const key = dailyUniquesKey(company_id, day);
    for (let i = 0; i < hashes.length; i += 10_000) {
      const slice = hashes.slice(i, i + 10_000).map((h) => h.visitor_hash);
      if (slice.length > 0) await redis.pfadd(key, ...slice);
    }
    await redis.expire(key, HLL_TTL_SECONDS);
    out[company_id] = { added: hashes.length, estimate: await redis.pfcount(key) };
  }
  return out;
}

/**
 * Drops monthly raw partitions older than retainMonths (default 3),
 * never the current or previous month. Also clears their HLL day-keys.
 * Returns dropped partition names.
 */
export async function dropOldPartitions(
  redis: RollupRedis,
  retainMonths = 3
): Promise<string[]> {
  const now = new Date();
  const guardYear = now.getUTCFullYear();
  const guardMonth = now.getUTCMonth(); // 0-based; this + previous month are sacred
  const parts = (await client.unsafe(
    `SELECT tablename FROM pg_tables WHERE tablename LIKE 'page_views_%' AND tablename ~ '^page_views_[0-9]{6}$' ORDER BY 1;`
  )) as Array<{ tablename: string }>;
  const dropped: string[] = [];
  for (const { tablename } of parts) {
    const ym = tablename.replace("page_views_", "");
    const y = parseInt(ym.slice(0, 4), 10);
    const m = parseInt(ym.slice(4, 6), 10) - 1;
    if (!Number.isFinite(y) || m < 0 || m > 11) continue;
    const ageMonths = (guardYear - y) * 12 + (guardMonth - m);
    if (ageMonths < Math.max(retainMonths, 2)) continue; // keep current + previous minimum
    await client.unsafe(`DROP TABLE ${tablename};`);
    // Clear HLL day-keys for the dropped month.
    const mm = String(m + 1).padStart(2, "0");
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `ahll:*:${y}-${mm}-*`, "COUNT", 500);
      cursor = next;
      if (keys.length > 0) await redis.del(...keys);
    } while (cursor !== "0");
    dropped.push(tablename);
  }
  return dropped;
}

/** Redis mutex: only one replica runs maintenance at a time. */
export async function withRedisLock(
  redis: RollupRedis,
  key: string,
  ttlSec: number,
  fn: () => Promise<void>
): Promise<boolean> {
  const token = randomUUID();
  const got = await redis.set(key, token, "EX", ttlSec, "NX");
  if (got === null) return false;
  try {
    await fn();
    return true;
  } finally {
    const lua = `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`;
    await redis.eval(lua, 1, key, token).catch(() => {});
  }
}

/**
 * One full maintenance pass: current + previous hour, today + yesterday
 * (rollups + HLL), then retention. Idempotent — safe to rerun and overlap.
 */
export async function runRollupMaintenance(redis: RollupRedis): Promise<void> {
  const now = new Date();
  const thisHour = new Date(now);
  thisHour.setUTCMinutes(0, 0, 0);
  await buildHourlyRollup(thisHour.toISOString());
  await buildHourlyRollup(new Date(thisHour.getTime() - 3_600_000).toISOString());
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  await buildDailyRollup(today);
  await buildDailyRollup(yesterday);
  await rebuildDailyHll(redis, today);
  await rebuildDailyHll(redis, yesterday);
  const retain = parseInt(process.env.ANALYTICS_RAW_RETAIN_MONTHS || "3", 10);
  await dropOldPartitions(redis, Number.isFinite(retain) && retain > 0 ? retain : 3);
}

/** Starts the periodic tick (worker calls once). Unref'd — never holds exit. */
export function startRollupTick(redis: RollupRedis, intervalMs = 900_000): unknown {
  const run = () =>
    withRedisLock(redis, "arollup:lock", 600, () => runRollupMaintenance(redis)).catch((err: any) => {
      // Maintenance must never crash the worker; next tick retries.
      try {
        console.error(`[ANALYTICS ROLLUP] tick failed: ${err?.message ?? err}`);
      } catch {}
    });
  const t = setInterval(run, intervalMs);
  (t as any)?.unref?.();
  return t;
}
