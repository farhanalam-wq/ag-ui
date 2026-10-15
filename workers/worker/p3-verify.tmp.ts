/** Phase 3 load verification (TEMP). 1M rows -> rollups -> timed dashboard read, HLL check, retention, cleanup. */
import Redis from "ioredis";
import { client } from "@ag-ui/database";
import { buildDailyRollup, buildHourlyRollup, rebuildDailyHll, dropOldPartitions } from "@ag-ui/analytics";

const redis = new Redis({ host: "127.0.0.1", port: 6379, maxRetriesPerRequest: 2 });

// 0. Throwaway companies (CASCADE cleans everything after).
const cos: any[] = await client`INSERT INTO companies (domain, name, url) VALUES
  ('p3a.example','P3A','https://p3a.example'), ('p3b.example','P3B','https://p3b.example') RETURNING id`;
const [coA, coB] = [cos[0].id, cos[1].id];

// Partitions covering the last 30 days (Sep+Oct 2026).
for (const [k, f, t] of [["202609", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z"], ["202610", "2026-10-01T00:00:00Z", "2026-11-01T00:00:00Z"]]) {
  await client.unsafe(`CREATE TABLE IF NOT EXISTS page_views_${k} PARTITION OF page_views FOR VALUES FROM ('${f}') TO ('${t}');`);
  await client.unsafe(`CREATE INDEX IF NOT EXISTS page_views_${k}_company_time_idx ON page_views_${k} (company_id, created_at);`);
}

// 1. 1M rows: 2 companies x 30 days, 500 sessions/day/co, 8000-visitor pool, 2% conversions.
let t = Date.now();
await client.unsafe(`
  INSERT INTO page_views (event_id, type, company_id, session_hash, visitor_hash, url, path, user_agent, is_bot, value, created_at)
  SELECT 'p3load-' || g,
    CASE WHEN g % 50 = 0 THEN 'conversion' WHEN g % 200 = 0 THEN 'chat_open' WHEN g % 200 = 1 THEN 'chat_message' ELSE 'pageview' END,
    CASE WHEN g % 2 = 0 THEN '${coA}'::uuid ELSE '${coB}'::uuid END,
    'p3sess-' || (g % 2) || '-' || ((g / 33333)::int % 30) || '-' || (g % 500),
    md5('p3v' || (g % 2) || '-' || ((g % 16000))::text),
    'https://shop.example/p/' || (g % 500), '/p/' || (g % 500),
    'Mozilla/5.0 P3Load', false,
    CASE WHEN g % 50 = 0 THEN 29.99 ELSE NULL END,
    now() - ((g % 30)::text || ' days')::interval - ((g % 1440)::text || ' minutes')::interval
  FROM generate_series(1, 1000000) g;`);
console.log(`[P3] loaded 1M rows in ${((Date.now() - t) / 1000).toFixed(1)}s.`);
// Deterministic probe: one session hash, 3 events with a 45-min gap -> must become 2 islands.
const probeHash = "p3probe-session-1";
await client.unsafe(`INSERT INTO page_views (event_id, type, company_id, session_hash, visitor_hash, url, path, created_at) VALUES
  ('p3probe-1','pageview','${coA}','${probeHash}','p3probe-v','https://shop.example/','/', now() - interval '2 hours'),
  ('p3probe-2','pageview','${coA}','${probeHash}','p3probe-v','https://shop.example/','/', now() - interval '2 hours' + interval '5 minutes'),
  ('p3probe-3','pageview','${coA}','${probeHash}','p3probe-v','https://shop.example/','/', now() - interval '2 hours' + interval '50 minutes');`);

// 2. Daily rollups for 30 days (timed).
t = Date.now();
for (let d = 29; d >= 0; d--) {
  const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
  await buildDailyRollup(day);
}
console.log(`[P3] 30 daily rollups over 1M rows in ${((Date.now() - t) / 1000).toFixed(1)}s.`);
// Hourly path: yesterday full 24h.
{
  const y = new Date(Date.now() - 86_400_000);
  for (let h = 0; h < 24; h++) {
    const hh = new Date(Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate(), h));
    await buildHourlyRollup(hh.toISOString());
  }
  const [hc] = await client`SELECT count(*)::int AS c FROM metrics_hourly WHERE company_id = ${coA}`;
  console.log(`[P3] hourly rows for coA: ${hc.c}`);
  if (hc.c < 20) throw new Error("hourly rollup thin");
}

// 3. Dashboard read (the exact Phase-5 shape), timed, cross-verified vs raw.
t = Date.now();
const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
const dash: any[] = await client`SELECT day, SUM(pageviews)::int AS pv, SUM(sessions)::int AS se,
  SUM(conversions)::int AS cv, SUM(revenue)::float AS rev FROM metrics_daily
  WHERE company_id = ${coA} AND day >= ${from} GROUP BY day ORDER BY day`;
const readMs = Date.now() - t;
const [raw] = await client`SELECT count(*) FILTER (WHERE type='pageview')::int AS pv,
  count(*) FILTER (WHERE type='conversion')::int AS cv,
  COALESCE(SUM(value) FILTER (WHERE type='conversion'),0)::float AS rev
  FROM page_views WHERE company_id = ${coA} AND event_id LIKE 'p3%'`;
const sum = (k: string) => dash.reduce((a, r) => a + Number(r[k]), 0);
console.log(`[P3] dashboard read: ${dash.length} day-rows in ${readMs}ms; rollup pv=${sum("pv")} raw pv=${raw.pv}; conv ${sum("cv")}=${raw.cv}; rev ${sum("rev")}=${raw.rev}`);
if (readMs > 300) throw new Error(`dashboard read too slow: ${readMs}ms`);
if (sum("pv") !== raw.pv || sum("cv") !== raw.cv || Math.abs(sum("rev") - raw.rev) > 0.01) throw new Error("rollup/raw mismatch");
const [probe] = await client`SELECT count(*)::int AS c FROM sessions WHERE session_hash = '${probeHash}'`;
if (probe.c !== 2) throw new Error(`gap probe: want 2 islands, got ${probe.c}`);
console.log("[P3] rollup<->raw parity + 45-min gap probe (2 islands) passed.");

// 4. HLL accuracy on a fully-covered day.
const mid = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10);
await rebuildDailyHll(redis as any, mid);
const [ex] = await client`SELECT count(DISTINCT visitor_hash)::int AS c FROM page_views
  WHERE company_id = ${coA} AND created_at >= ${mid} AND created_at < (${mid}::date + 1)::text::timestamptz`;
const est: number = await redis.pfcount(`ahll:${coA}:${mid}`);
const err = Math.abs(est - ex.c) / ex.c;
console.log(`[P3] HLL: exact=${ex.c} estimate=${est} err=${(err * 100).toFixed(2)}%`);
if (err > 0.02) throw new Error(`HLL error ${(err * 100).toFixed(2)}% exceeds 2%`);

// 5. Retention: fake old partition + stale HLL key, then drop.
await client.unsafe(`CREATE TABLE IF NOT EXISTS page_views_202001 PARTITION OF page_views FOR VALUES FROM ('2020-01-01T00:00:00Z') TO ('2020-02-01T00:00:00Z');`);
await client.unsafe(`INSERT INTO page_views (event_id, type, company_id, session_hash, visitor_hash, url, path, created_at) VALUES ('p3old-1','pageview','${coA}','s','v','https://x.example/','/','2020-01-15T00:00:00Z');`);
await redis.pfadd(`ahll:${coA}:2020-01-15`, "stale");
const dropped = await dropOldPartitions(redis as any, 3);
const parts: any[] = await client`SELECT tablename FROM pg_tables WHERE tablename = 'page_views_202001'`;
const staleLeft: number = await redis.exists(`ahll:${coA}:2020-01-15`);
const cur: any[] = await client`SELECT tablename FROM pg_tables WHERE tablename IN ('page_views_202609','page_views_202610','page_views_202611') ORDER BY 1`;
console.log("[P3] retention:", JSON.stringify({ dropped, oldGone: parts.length === 0, staleHllGone: staleLeft === 0, currentKept: cur.map((c) => c.tablename) }));
if (!dropped.includes("page_views_202001") || parts.length !== 0 || staleLeft !== 0 || cur.length !== 3) throw new Error("retention failed");
console.log("[P3] ALL ASSERTS PASSED.");

// 6. Cleanup (CASCADE) + HLL keys for test range.
await client`DELETE FROM companies WHERE id IN (${coA}, ${coB})`;
let cursor = "0";
do {
  const [next, keys] = await redis.scan(cursor, "MATCH", "ahll:*", "COUNT", 500);
  cursor = next;
  const mine = keys.filter(async () => true);
  if (mine.length) await redis.del(...mine);
} while (cursor !== "0");
console.log("[P3] cleaned.");
await redis.quit();
await client.end();
process.exit(0);
