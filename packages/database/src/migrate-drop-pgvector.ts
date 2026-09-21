/**
 * packages/database/src/migrate-drop-pgvector.ts
 *
 * Migration: Drop pgvector embedding column and index from PostgreSQL.
 *
 * Prerequisites (Task 12 Acceptance):
 * - Parity verification report docs/parity-check.md exists with all green checks (100% Jaccard).
 * - Retrieval flipped to Qdrant (Task 13).
 *
 * Reversibility Note:
 * - If pgvector is ever needed again, the embedding column can be re-added via
 *   `ALTER TABLE chunks ADD COLUMN embedding vector(1536);`
 *   and backfilled from stored `chunks.content` using `generateEmbeddings()`.
 */

import { client } from "./index";

async function runMigration() {
  console.log("=================================================");
  console.log("CUTOVER MIGRATION: RETIRING PGVECTOR");
  console.log("Dropping chunks.embedding from PostgreSQL");
  console.log("=================================================");

  // 1. Drop HNSW index on embedding
  console.log("[MIGRATE] Dropping chunks_embedding_idx if exists...");
  await client.unsafe("DROP INDEX IF EXISTS chunks_embedding_idx;");
  console.log("[MIGRATE] Index dropped.");

  // 2. Drop embedding column
  console.log("[MIGRATE] Dropping column 'embedding' from 'chunks'...");
  await client.unsafe("ALTER TABLE chunks DROP COLUMN IF EXISTS embedding;");
  console.log("[MIGRATE] Column 'embedding' dropped.");

  // 3. Ensure index on document_id exists for fast hydration
  console.log("[MIGRATE] Ensuring index chunks_document_id_idx on chunks(document_id)...");
  await client.unsafe("CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);");
  console.log("[MIGRATE] Index chunks_document_id_idx verified.");

  // 4. Verification
  const check = await client.unsafe(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'chunks' AND column_name = 'embedding';"
  );

  if (check.length === 0) {
    console.log("[MIGRATE] VERIFIED: 'embedding' column is completely gone from 'chunks'.");
  } else {
    throw new Error("[MIGRATE] Failed: 'embedding' column still exists in 'chunks'!");
  }

  // 5. Inspect remaining chunks columns
  const remaining = await client.unsafe(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'chunks';"
  );
  console.log("[MIGRATE] Remaining chunks table columns:");
  remaining.forEach((r: any) => console.log(`  - ${r.column_name} (${r.data_type})`));

  console.log("-------------------------------------------------");
  console.log("PGVECTOR RETIREMENT COMPLETE. VECTOR STORAGE IS 100% QDRANT.");
  console.log("=================================================");

  await client.end();
}

runMigration().catch(async (err) => {
  console.error("[FATAL in migrate-drop-pgvector]:", err);
  await client.end();
  process.exit(1);
});
