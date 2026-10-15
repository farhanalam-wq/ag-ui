/**
 * packages/database/src/migrate-analytics-phase3.ts
 *
 * Phase 3 migration. Idempotent: safe to rerun.
 * Run: bun packages/database/src/migrate-analytics-phase3.ts
 *
 * - metrics_hourly: per-company hour buckets (UTC hour start).
 * - sessions: relax UNIQUE(session_hash) to (company_id, session_hash,
 *   started_at) — one tab-session idling >30min legitimately becomes two
 *   session islands sharing the hash (gap-and-island, see rollup.ts).
 */

import { client } from "./index";

async function runMigration() {
  console.log("[MIGRATION] Starting analytics Phase 3 migration...");

  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS metrics_hourly (
      company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      hour timestamptz NOT NULL,
      pageviews integer NOT NULL DEFAULT 0,
      sessions integer NOT NULL DEFAULT 0,
      conversions integer NOT NULL DEFAULT 0,
      revenue numeric NOT NULL DEFAULT 0,
      chat_opens integer NOT NULL DEFAULT 0,
      messages integer NOT NULL DEFAULT 0,
      PRIMARY KEY (company_id, hour)
    );
  `);
  console.log("[MIGRATION] metrics_hourly ready.");

  // Relax session uniqueness for multi-island hashes (Postgres names a
  // single-column UNIQUE `sessions_session_hash_key` by default).
  // started_at is NOT NULL, so plain UNIQUE semantics are exact.
  await client.unsafe(`ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_hash_key;`);
  await client.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sessions_company_session_started_unique'
      ) THEN
        ALTER TABLE sessions ADD CONSTRAINT sessions_company_session_started_unique
          UNIQUE (company_id, session_hash, started_at);
      END IF;
    END $$;
  `);
  console.log("[MIGRATION] sessions uniqueness relaxed to (company, hash, started_at).");

  const [h] = await client`SELECT count(*)::int AS c FROM metrics_hourly;`;
  const [s] = await client`SELECT count(*)::int AS c FROM sessions;`;
  console.log(`[VERIFY] metrics_hourly rows: ${h.c}, sessions rows: ${s.c}`);
  const cons = await client`
    SELECT conname FROM pg_constraint WHERE conrelid = 'sessions'::regclass AND conname LIKE '%session%';
  `;
  console.log(`[VERIFY] sessions constraints: ${cons.map((c: any) => c.conname).join(", ")}`);

  console.log("[MIGRATION] Analytics Phase 3 migration complete.");
  await client.end();
}

runMigration().catch(async (err) => {
  console.error("[MIGRATION ERROR]", err);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
