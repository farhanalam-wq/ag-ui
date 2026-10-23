/**
 * The analytics read cache.
 *
 * Three states matter to a caller, and they are not interchangeable:
 * `hit` (fresh, no compute), `stale` (served immediately, refreshing behind
 * the request) and `miss` (computed now). The API turns them into
 * `X-Analytics-Cache`, so a test that only checked "cached or not" would let
 * a stale read masquerade as fresh.
 *
 * Run: bun test packages/analytics/src/cache.test.ts
 */
import { describe, expect, test } from "bun:test";
import { withAnalyticsCache, cacheCounters, type CacheRedis } from "./cache";

/** A tiny in-memory Redis, good enough for the cache's five primitives. */
function fakeRedis(): CacheRedis & {
  store: Map<string, string>;
  counters: Map<string, number>;
  sets: Map<string, Set<string>>;
} {
  const store = new Map<string, string>();
  const counters = new Map<string, number>();
  const sets = new Map<string, Set<string>>();
  const bump = (key: string) => {
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    // Real INCR also materialises the key, which is what cacheCounters reads.
    store.set(key, String(n));
    return n;
  };
  return {
    store,
    counters,
    sets,
    get: async (key) => store.get(key) ?? null,
    set: async (key, val, ...args) => {
      const nx = args.includes("NX");
      if (nx && store.has(key)) return null;
      store.set(key, String(val));
      return "OK";
    },
    setex: async (key, _secs, val) => {
      store.set(key, String(val));
      return "OK";
    },
    incr: async (key) => bump(key),
    pfmerge: async () => "OK",
    pfcount: async () => 0,
    expire: async () => 1,
    del: async (...keys) => {
      for (const k of keys) store.delete(k);
      return keys.length;
    },
    sadd: async (key, ...members) => {
      const set = sets.get(key) ?? new Set<string>();
      for (const m of members) set.add(m);
      sets.set(key, set);
      return members.length;
    },
    smembers: async (key) => [...(sets.get(key) ?? [])],
  };
}

describe("withAnalyticsCache", () => {
  test("a cold key computes and reports a miss", async () => {
    const redis = fakeRedis();
    let computed = 0;
    const r = await withAnalyticsCache(redis, "ana:v2:test:cold", 60, 240, async () => {
      computed += 1;
      return { n: 1 };
    });
    expect(r).toEqual({ data: { n: 1 }, cache: "miss" });
    expect(computed).toBe(1);
  });

  test("a fresh entry is a hit and does not compute", async () => {
    const redis = fakeRedis();
    let computed = 0;
    const compute = async () => {
      computed += 1;
      return { n: computed };
    };
    await withAnalyticsCache(redis, "ana:v2:test:fresh", 60, 240, compute);
    const r = await withAnalyticsCache(redis, "ana:v2:test:fresh", 60, 240, compute);
    expect(r.cache).toBe("hit");
    expect(r.data).toEqual({ n: 1 });
    expect(computed).toBe(1);
  });

  test("a stale entry is served as stale, then refreshed in the background", async () => {
    const redis = fakeRedis();
    redis.store.set(
      "ana:v2:test:stale",
      JSON.stringify({ v: { n: 1 }, t: Date.now() - 61_000 })
    );
    let computed = 0;
    const r = await withAnalyticsCache(redis, "ana:v2:test:stale", 60, 240, async () => {
      computed += 1;
      return { n: 2 };
    });
    // The caller gets the old value immediately; the refresh is fire-and-forget.
    expect(r).toEqual({ data: { n: 1 }, cache: "stale" });
    // Give the background refresh a tick to finish.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(computed).toBe(1);
    const stored = JSON.parse(redis.store.get("ana:v2:test:stale") ?? "{}");
    expect(stored.v).toEqual({ n: 2 });
  });

  test("an expired entry is a miss, not a stale read", async () => {
    const redis = fakeRedis();
    redis.store.set(
      "ana:v2:test:expired",
      JSON.stringify({ v: { n: 1 }, t: Date.now() - 400_000 })
    );
    const r = await withAnalyticsCache(redis, "ana:v2:test:expired", 60, 240, async () => ({ n: 2 }));
    expect(r).toEqual({ data: { n: 2 }, cache: "miss" });
  });

  test("without Redis the request still computes", async () => {
    const r = await withAnalyticsCache(null, "ana:v2:test:noredis", 60, 240, async () => ({ n: 1 }));
    expect(r).toEqual({ data: { n: 1 }, cache: "miss" });
  });
});

describe("cacheCounters", () => {
  test("counts globally and per namespace", async () => {
    const redis = fakeRedis();
    const compute = async () => ({ ok: true });
    await withAnalyticsCache(redis, "ana:v2:acquisition:c:30d", 60, 240, compute);
    await withAnalyticsCache(redis, "ana:v2:acquisition:c:30d", 60, 240, compute);
    await withAnalyticsCache(redis, "ana:v2:agent-overview:c:30d", 60, 240, compute);

    const c = await cacheCounters(redis);
    expect(c.hits).toBe(1);
    expect(c.misses).toBe(2);
    expect(c.namespaces.acquisition).toEqual({ hits: 1, misses: 1 });
    expect(c.namespaces["agent-overview"]).toEqual({ hits: 0, misses: 1 });
  });

  test("no Redis means zeroes, never a throw", async () => {
    expect(await cacheCounters(null)).toEqual({ hits: 0, misses: 0, namespaces: {} });
  });
});
