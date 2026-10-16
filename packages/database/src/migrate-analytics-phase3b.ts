/**
 * bun packages/database/src/migrate-analytics-phase3b.ts
 *
 * Phase 3 engagement columns. Idempotent (DO-blocks): safe to rerun.
 * - metrics_daily / metrics_hourly += scrolls, downloads, clicks, heartbeats
 * - sessions += active_seconds (heartbeat-derived, 15s each, capped/day island)
 */
import { client } from "./index";

async function addColumn(table: string, col: string, ddl: string) {
  await client.unsafe(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = '${table}' AND column_name = '${col}'
      ) THEN
        ALTER TABLE ${table} ADD COLUMN ${col} ${ddl};
      END IF;
    END $$;
  `);
}

async function runMigration() {
  console.log("[MIGRATION] Starting analytics Phase 3b migration...");
  for (const t of ["metrics_daily", "metrics_hourly"]) {
    await addColumn(t, "scrolls", "integer NOT NULL DEFAULT 0");
    await addColumn(t, "downloads", "integer NOT NULL DEFAULT 0");
    await addColumn(t, "clicks", "integer NOT NULL DEFAULT 0");
    await addColumn(t, "heartbeats", "integer NOT NULL DEFAULT 0");
  }
  await addColumn("sessions", "active_seconds", "integer NOT NULL DEFAULT 0");
  console.log("[MIGRATION] Phase 3b columns ready.");

  const cols = await client`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_name IN ('metrics_daily', 'metrics_hourly', 'sessions')
      AND column_name IN ('scrolls', 'downloads', 'clicks', 'heartbeats', 'active_seconds')
    ORDER BY 1, 2;
  `;
  console.log(`[VERIFY] engagement columns present: ${(cols as any[]).length} (expect 9)`);
  console.log("[MIGRATION] Analytics Phase 3b migration complete.");
  await client.end();
}

runMigration().catch(async (err) => {
  console.error("[MIGRATION ERROR]", err);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
