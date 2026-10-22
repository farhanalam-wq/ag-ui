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

/** How long a background refresh may hold the lock before it is up for grabs. */
export const REFRESH_LOCK_SECS = 30;

export interface CacheRedis {
  get(key: string): Promise<string | null>;
  /**
   * `SET key val EX seconds NX` — returns "OK" when the key was taken, null
   * when it was already held. This is the single-flight primitive.
   */
  set(key: string, val: string, ...args: unknown[]): Promise<unknown>;
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

/**
 * In-flight computes, per key, per process.
 *
 * A cold key hit by ten concurrent requests must not run ten queries: the
 * first caller starts the compute and the others wait on the same promise.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Refreshes a stale entry in the background — at most one refresh per key.
 *
 * Without the lock, every request inside the stale-while-revalidate window
 * started its own recompute, so a burst multiplied the database load by the
 * number of requests (F-06). The lock lives in Redis so it holds across
 * replicas, and it is released when the compute finishes.
 */
async function refreshInBackground<T>(
  redis: CacheRedis,
  key: string,
  ttlSecs: number,
  compute: () => Promise<T>
): Promise<void> {
  const lockKey = `ana:lock:${key}`;
  let acquired: unknown;
  try {
    acquired = await redis.set(lockKey, "1", "EX", REFRESH_LOCK_SECS, "NX");
  } catch {
    acquired = "OK"; // Redis wobble: refresh rather than serve stale.
  }
  if (acquired === null || acquired === undefined) return; // someone else is refreshing
  try {
    const v = await compute();
    await redis.setex(key, ttlSecs, JSON.stringify({ v, t: Date.now() })).catch(() => {});
  } catch {
    // Errors stay silent; the next request retries.
  } finally {
    await redis.del(lockKey).catch(() => {});
  }
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
        // Serve stale, refresh in background — one refresh per key. Errors
        // stay silent.
        await redis.incr("ana:hits").catch(() => {});
        void refreshInBackground(redis, key, freshSecs + swrSecs, compute);
        return { data: entry.v as T, cached: true };
      }
    }
  } catch {
    // Corrupt entry or Redis wobble: fall through to compute.
  }
  await redis.incr("ana:misses").catch(() => {});

  // One compute per key in this process; concurrent callers share it.
  const pending = inFlight.get(key);
  if (pending) return { data: (await pending) as T, cached: false };

  const t0 = Date.now();
  const running = compute().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, running);
  const data = await running;
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
