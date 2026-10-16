/**
 * packages/analytics/src/cache.ts
 *
 * Read-path cache for analytics endpoints. 60s fresh TTL + stale-while-
 * revalidate so concurrent dashboard owners never stampede the DB, and a
 * slow recompute never blocks a render. Fail-open: Redis down means
 * compute-directly, never an error.
 *
 * Observability: cache-miss recomputes are timed; anything slower than
 * SLOW_MS logs a warning with the key so heavy tenants surface in logs.
 */
import { logger } from "@ag-ui/shared";

export const SLOW_COMPUTE_MS = 2000;

export interface CacheRedis {
  get(key: string): Promise<string | null>;
  setex(key: string, secs: number, val: string): Promise<unknown>;
  incr(key: string): Promise<number>;
  pfmerge(dest: string, ...sources: string[]): Promise<unknown>;
  pfcount(...keys: string[]): Promise<number>;
  expire(key: string, secs: number): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
}

interface Entry {
  v: unknown;
  t: number;
}

export async function withAnalyticsCache<T>(
  redis: CacheRedis | null,
  key: string,
  freshSecs: number,
  swrSecs: number,
  compute: () => Promise<T>
): Promise<{ data: T; cached: boolean }> {
  if (!redis) return { data: await compute(), cached: false };
  const now = Date.now();
  try {
    const raw = await redis.get(key);
    if (raw) {
      const entry = JSON.parse(raw) as Entry;
      const age = (now - entry.t) / 1000;
      if (age < freshSecs) {
        await redis.incr("ana:hits").catch(() => {});
        return { data: entry.v as T, cached: true };
      }
      if (age < freshSecs + swrSecs) {
        // Serve stale, refresh in background. Errors stay silent.
        await redis.incr("ana:hits").catch(() => {});
        compute()
          .then((v) =>
            redis
              .setex(key, freshSecs + swrSecs, JSON.stringify({ v, t: Date.now() }))
              .catch(() => {})
          )
          .catch(() => {});
        return { data: entry.v as T, cached: true };
      }
    }
  } catch {
    // Corrupt entry or Redis wobble: fall through to compute.
  }
  await redis.incr("ana:misses").catch(() => {});
  const t0 = Date.now();
  const data = await compute();
  const tookMs = Date.now() - t0;
  if (tookMs >= SLOW_COMPUTE_MS) {
    try {
      logger.warn(`[ANALYTICS] slow recompute: ${key} took ${tookMs}ms`);
    } catch {}
  }
  try {
    await redis.setex(key, freshSecs + swrSecs, JSON.stringify({ v: data, t: Date.now() }));
  } catch {}
  return { data, cached: false };
}

/** Test/ops helper: current hit/miss counters. */
export async function cacheCounters(
  redis: CacheRedis | null
): Promise<{ hits: number; misses: number }> {
  if (!redis) return { hits: 0, misses: 0 };
  try {
    const [hits, misses] = await Promise.all([
      redis.get("ana:hits").then((v) => parseInt(v ?? "0", 10)),
      redis.get("ana:misses").then((v) => parseInt(v ?? "0", 10)),
    ]);
    return { hits, misses };
  } catch {
    return { hits: 0, misses: 0 };
  }
}
