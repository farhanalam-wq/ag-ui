/**
 * packages/database/src/migrate-analytics.ts
 *
 * Phase 1 (analytics foundation) migration. Idempotent: safe to rerun.
 * Run: bun packages/database/src/migrate-analytics.ts
 *
 * Tables are managed HERE, not in drizzle schema.ts / drizzle-kit, because
 * monthly RANGE partitioning is unsupported by drizzle-kit generate/push.
 * The batch worker writes via parameterized raw SQL through `client`.
 *
 * - page_views: RANGE-partitioned by month on created_at. Raw TTL is enforced
 *   by dropping old partitions (Phase 3 retention job), never DELETE.
 *   No UNIQUE on event_id: the UNIQUE would have to include the partition key
 *   and cost an index lookup per write; dedup happens worker-side in Redis
 *   (adedupe:{event_id} SET NX, 24h window) before insert.
 * - sessions: populated by the Phase 3 rollup job via gap-and-island over
 *   bounded daily data (no per-event write amplification). Schema-ready now.
 * - metrics_daily: populated by the Phase 3 rollup job. Schema-ready now.
 */

import { client } from "./index";

function monthBounds(d: Date): { key: string; from: string; to: string } {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-based
  const key = `${y}${String(m + 1).padStart(2, "0")}`;
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`;
  const nm = new Date(Date.UTC(y, m + 1, 1));
  const to = `${nm.getUTCFullYear()}-${String(nm.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00Z`;
  return { key, from, to };
}

async function ensurePartition(from: string, to: string, key: string): Promise<void> {
  // NOTE: table/partition names are server-generated YYYYMM keys, never user input.
  await client.unsafe(
    `CREATE TABLE IF NOT EXISTS page_views_${key} PARTITION OF page_views FOR VALUES FROM ('${from}') TO ('${to}');`
  );
  await client.unsafe(
    `CREATE INDEX IF NOT EXISTS page_views_${key}_company_time_idx ON page_views_${key} (company_id, created_at);`
  );
  await client.unsafe(
    `CREATE INDEX IF NOT EXISTS page_views_${key}_session_idx ON page_views_${key} (session_hash);`
  );
}

async function runMigration() {
  console.log("[MIGRATION] Starting analytics Phase 1 migration...");

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS page_views (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      event_id text NOT NULL,
      type text NOT NULL DEFAULT 'pageview',
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      widget_key_id uuid,
      session_hash text NOT NULL,
      visitor_hash text NOT NULL,
      url text NOT NULL,
      path text NOT NULL,
      referrer text NOT NULL DEFAULT '',
      viewport text NOT NULL DEFAULT '',
      user_agent text NOT NULL DEFAULT '',
      is_bot boolean NOT NULL DEFAULT false,
      value numeric,
      meta jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (id, created_at)
    ) PARTITION BY RANGE (created_at);
  `);
  console.log("[MIGRATION] page_views (partitioned) ready.");

  // Pre-create current + next month so inserts never hit a missing partition.
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  for (const d of [now, next]) {
    const { key, from, to } = monthBounds(d);
    await ensurePartition(from, to, key);
    console.log(`[MIGRATION] partition page_views_${key} ready.`);
  }

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      session_hash text NOT NULL UNIQUE,
      started_at timestamptz NOT NULL,
      ended_at timestamptz,
      pageview_count integer NOT NULL DEFAULT 0,
      converted boolean NOT NULL DEFAULT false,
      revenue numeric NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await client.unsafe(`
    CREATE INDEX IF NOT EXISTS sessions_company_started_idx
    ON sessions (company_id, started_at);
  `);
  console.log("[MIGRATION] sessions ready (populated by Phase 3 rollup).");

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS metrics_daily (
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      day date NOT NULL,
      pageviews integer NOT NULL DEFAULT 0,
      sessions integer NOT NULL DEFAULT 0,
      conversions integer NOT NULL DEFAULT 0,
      revenue numeric NOT NULL DEFAULT 0,
      chat_opens integer NOT NULL DEFAULT 0,
      messages integer NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, day)
    );
  `);
  console.log("[MIGRATION] metrics_daily ready (populated by Phase 3 rollup).");

  // ---- verify ----
  const [pv] = await client`SELECT count(*)::int AS c FROM page_views;`;
  console.log(`[VERIFY] page_views rows: ${pv.c}`);
  const parts = await client`
    SELECT tablename FROM pg_tables WHERE tablename LIKE 'page_views_%' ORDER BY 1;
  `;
  console.log(`[VERIFY] partitions: ${parts.map((p: any) => p.tablename).join(", ")}`);
  const [s] = await client`SELECT count(*)::int AS c FROM sessions;`;
  const [m] = await client`SELECT count(*)::int AS c FROM metrics_daily;`;
  console.log(`[VERIFY] sessions rows: ${s.c}, metrics_daily rows: ${m.c}`);

  console.log("[MIGRATION] Analytics Phase 1 migration complete.");
  await client.end();
}

runMigration().catch(async (err) => {
  console.error("[MIGRATION ERROR]", err);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
