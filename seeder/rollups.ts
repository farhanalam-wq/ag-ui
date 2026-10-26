/**
 * Rollups for the seeder.
 *
 * Raw `page_views` is the only source of truth. Sessions, `metrics_daily`,
 * `metrics_hourly` and the Redis HLL uniques are produced by the same
 * functions the worker runs, so the seeder cannot invent a dashboard number
 * that disagrees with another tab.
 *
 * Buckets are independent: a visit is written only under the bucket it
 * started in, and every bucket scans a fixed look-back window. Daily and
 * hourly buckets therefore run with bounded concurrency instead of one
 * round trip at a time — same functions, same results, ~8x faster.
 */

import {
  buildDailyRollup,
  buildHourlyRollup,
  rebuildDailyHll,
} from "../packages/analytics/src/rollup";
import { client, getRedisClient } from "../packages/database/src/index";
import { WINDOW_DAYS } from "./events";

const DAILY_CONCURRENCY = 6;
const HOURLY_CONCURRENCY = 8;

function monthPart(day: string): { key: string; from: string; to: string } {
  const [y, m] = day.split("-").map(Number) as [number, number];
  const key = `${y}${String(m).padStart(2, "0")}`;
  const from = `${y}-${String(m).padStart(2, "0")}-01T00:00:00Z`;
  const next = new Date(Date.UTC(y, m, 1));
  const to = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00Z`;
  return { key, from, to };
}

/**
 * Monthly partitions for the whole seed window. Mirrors the worker's
 * `ensurePartitions`, including both indexes, so retention and pruning behave
 * exactly as they do in production.
 */
export async function ensureSeedPartitions(days: string[]): Promise<string[]> {
  const months = new Map<string, { from: string; to: string }>();
  for (const day of days) {
    const part = monthPart(day);
    months.set(part.key, { from: part.from, to: part.to });
  }

  await client.begin(async (sql) => {
    await sql`SET LOCAL client_min_messages TO WARNING`;
    for (const [key, { from, to }] of months) {
      await sql.unsafe(
        `CREATE TABLE IF NOT EXISTS page_views_${key} PARTITION OF page_views FOR VALUES FROM ('${from}') TO ('${to}');`
      );
      await sql.unsafe(
        `CREATE INDEX IF NOT EXISTS page_views_${key}_company_time_idx ON page_views_${key} (company_id, created_at);`
      );
      await sql.unsafe(
        `CREATE INDEX IF NOT EXISTS page_views_${key}_session_idx ON page_views_${key} (session_hash);`
      );
    }
  });

  return [...months.keys()];
}

/** Run `worker` over `items` with at most `limit` in flight, preserving order. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;

  async function run() {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index]!);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export interface RollupSummary {
  days: number;
  hours: number;
  hll: "rebuilt" | "skipped";
  redisError?: string;
}

export async function buildSeedRollups(
  days: string[],
  log: (message: string) => void = console.log
): Promise<RollupSummary> {
  let done = 0;
  await mapLimit(days, DAILY_CONCURRENCY, async (day) => {
    const rows = await buildDailyRollup(day);
    done++;
    if (done % 15 === 0 || done === days.length) {
      log(`  daily rollup: ${done}/${days.length} days`);
    }
    return rows;
  });

  const hours = days.flatMap((day) =>
    Array.from({ length: 24 }, (_, hour) => `${day}T${String(hour).padStart(2, "0")}:00:00Z`)
  );
  done = 0;
  await mapLimit(hours, HOURLY_CONCURRENCY, async (iso) => {
    await buildHourlyRollup(iso);
    done++;
    if (done % 240 === 0 || done === hours.length) {
      log(`  hourly rollup: ${done}/${hours.length} hours`);
    }
  });

  // HLL uniques are a cache-speed optimisation, not the source of truth.
  // Missing Redis should not block a demo seed.
  let hll: "rebuilt" | "skipped" = "skipped";
  let redisError: string | undefined;
  try {
    const redis = await getRedisClient();
    if (redis) {
      for (const day of days) await rebuildDailyHll(redis as any, day);
      hll = "rebuilt";
    } else {
      redisError = "Redis unavailable; daily HLL uniques were not rebuilt.";
    }
  } catch (err: any) {
    redisError = err?.message ?? String(err);
  }

  return {
    days: days.length,
    hours: hours.length,
    hll,
    redisError,
  };
}

export { WINDOW_DAYS };
