import { client } from "./index";

async function runMigration() {
  console.log("[MIGRATION] Starting Task 1 & Task 2 migration on PostgreSQL...");

  await client.begin(async (sql) => {
    // 1. Add columns to documents table
    console.log("[MIGRATION] Adding columns content_hash, word_count, headings to documents table...");
    await sql`
      ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS content_hash text,
      ADD COLUMN IF NOT EXISTS word_count integer DEFAULT 0 NOT NULL,
      ADD COLUMN IF NOT EXISTS headings jsonb DEFAULT '[]' NOT NULL;
    `;

    // 2. Backfill existing documents
    console.log("[MIGRATION] Backfilling content_hash and word_count for existing documents...");
    const updated = await sql`
      UPDATE documents
      SET
        content_hash = encode(sha256(convert_to(content, 'UTF8')), 'hex'),
        word_count = COALESCE(array_length(regexp_split_to_array(trim(content), '\s+'), 1), 0),
        headings = '[]'::jsonb
      WHERE content_hash IS NULL;
    `;
    console.log(`[MIGRATION] Backfilled ${updated.count} existing document rows.`);

    // 3. Enforce NOT NULL constraint on content_hash
    console.log("[MIGRATION] Enforcing NOT NULL on content_hash...");
    await sql`
      ALTER TABLE documents
      ALTER COLUMN content_hash SET NOT NULL;
    `;

    // 4. Create index on content_hash
    console.log("[MIGRATION] Creating B-tree index on documents(content_hash)...");
    await sql`
      CREATE INDEX IF NOT EXISTS documents_content_hash_idx
      ON documents (content_hash);
    `;

    // 5. Create crawl_jobs table
    console.log("[MIGRATION] Creating crawl_jobs table...");
    await sql`
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        snapshot_id uuid REFERENCES company_snapshots(id) ON DELETE SET NULL,
        owner text,
        selection_hash text NOT NULL,
        idempotency_key text NOT NULL UNIQUE,
        status text NOT NULL DEFAULT 'QUEUED',
        selected integer NOT NULL DEFAULT 0,
        crawled integer NOT NULL DEFAULT 0,
        docs integer NOT NULL DEFAULT 0,
        failed integer NOT NULL DEFAULT 0,
        priority integer NOT NULL DEFAULT 0,
        error_sample jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      );
    `;
  });

  // Post-migration validation
  const [nullCheck] = await client`
    SELECT count(*)::int as count FROM documents WHERE content_hash IS NULL;
  `;
  console.log(`[VERIFY] Documents with null content_hash: ${nullCheck.count} (expected 0)`);

  const [totalDocs] = await client`
    SELECT count(*)::int as count FROM documents;
  `;
  console.log(`[VERIFY] Total documents: ${totalDocs.count}`);

  const [sampleDoc] = await client`
    SELECT id, title, content_hash, word_count, jsonb_array_length(headings) as heading_count
    FROM documents
    LIMIT 1;
  `;
  console.log("[VERIFY] Sample document row:", sampleDoc);

  const [jobsExists] = await client`
    SELECT count(*)::int as count FROM information_schema.tables WHERE table_name = 'crawl_jobs';
  `;
  console.log(`[VERIFY] crawl_jobs table exists: ${jobsExists.count === 1 ? "YES" : "NO"}`);

  console.log("[MIGRATION] Task 1 & Task 2 migration completed successfully!");
  await client.end();
}

runMigration().catch(async (err) => {
  console.error("[MIGRATION ERROR]", err);
  try {
    await client.end();
  } catch {}
  process.exit(1);
});
