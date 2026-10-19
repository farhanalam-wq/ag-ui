/**
 * One-time baseline for databases created with `drizzle-kit push` (or the old
 * hand-run analytics scripts): they have the schema but no
 * drizzle.__drizzle_migrations ledger, so `db:migrate` would try to replay
 * 0000..N and fail on existing tables.
 *
 * This marks migrations up to and including --through=<tag> as applied WITHOUT
 * executing them. `db:migrate` then applies only what comes after.
 *
 * Usage (from packages/database):
 *   bun src/db-baseline.ts --through=0006_woozy_talos
 *
 * Safe by construction:
 *   - refuses to run if public.companies is missing (empty DB → use db:migrate)
 *   - refuses to run if the ledger already has rows (already baselined)
 *
 * Do not use this on a database that was already created by db:migrate.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { client } from "./index";

const here = fileURLToPath(new URL(".", import.meta.url));
const drizzleDir = join(here, "..", "drizzle");

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

const through =
  process.argv.find((a) => a.startsWith("--through="))?.slice("--through=".length).trim() ??
  "";

async function main() {
  if (!through) {
    console.error("Usage: bun src/db-baseline.ts --through=<migration-tag>");
    console.error("  e.g. --through=0006_woozy_talos");
    process.exit(1);
  }

  const journal = JSON.parse(
    readFileSync(join(drizzleDir, "meta", "_journal.json"), "utf8")
  ) as { entries: JournalEntry[] };

  const cutoff = journal.entries.findIndex((e) => e.tag === through);
  if (cutoff === -1) {
    console.error(`[BASELINE] Unknown migration tag: ${through}`);
    process.exit(1);
  }
  const toMark = journal.entries.slice(0, cutoff + 1);

  const [companies] = await client<{ t: string | null }[]>`
    SELECT to_regclass('public.companies')::text AS t;
  `;
  if (!companies?.t) {
    console.error(
      "[BASELINE] public.companies not found — this database has no base schema. Run db:migrate instead."
    );
    process.exit(1);
  }

  await client.unsafe(`CREATE SCHEMA IF NOT EXISTS "drizzle";`);
  await client.unsafe(`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    );
  `);

  const [existing] = await client<{ c: number }[]>`
    SELECT count(*)::int AS c FROM "drizzle"."__drizzle_migrations";
  `;
  if ((existing?.c ?? 0) > 0) {
    console.error(
      "[BASELINE] drizzle.__drizzle_migrations already has rows — refusing to re-baseline."
    );
    process.exit(1);
  }

  for (const entry of toMark) {
    const sql = readFileSync(join(drizzleDir, `${entry.tag}.sql`), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    await client`
      INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at")
      VALUES (${hash}, ${entry.when});
    `;
  }

  console.log(
    `[BASELINE] Marked ${toMark.length} migration(s) as applied through ${through}. Run db:migrate next.`
  );
  await client.end();
}

main().catch(async (err) => {
  console.error("[BASELINE ERROR]", err);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
