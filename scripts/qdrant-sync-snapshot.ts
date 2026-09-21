/**
 * scripts/qdrant-sync-snapshot.ts
 *
 * Synchronizes existing PostgreSQL chunk vectors and metadata into Qdrant
 * for parity testing and backfill.
 *
 * Usage:
 *   bun scripts/qdrant-sync-snapshot.ts [domain_or_snapshot_id]
 * Defaults to the Resend snapshot if not specified.
 */

import { client } from "../packages/database/src/index";
import { upsertChunkPoints, getCollectionInfo } from "../packages/database/src/qdrant";

async function main() {
  const target = process.argv[2] || "resend.com";

  console.log("=================================================");
  console.log(`QDRANT SNAPSHOT SYNC / BACKFILL`);
  console.log(`Target: ${target}`);
  console.log("=================================================");

  // 1. Identify target snapshot
  let snapshotId: string | null = null;
  let companyId: string | null = null;
  let companyName = "";

  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(target)) {
    const [snap] = await client.unsafe(
      `SELECT s.id, s.company_id, c.name FROM company_snapshots s JOIN companies c ON s.company_id = c.id WHERE s.id = $1`,
      [target]
    );
    if (snap) {
      snapshotId = snap.id;
      companyId = snap.company_id;
      companyName = snap.name;
    }
  } else {
    const [snap] = await client.unsafe(
      `SELECT s.id, s.company_id, c.name 
       FROM company_snapshots s 
       JOIN companies c ON s.company_id = c.id 
       WHERE c.domain = $1 OR c.name ILIKE $1 
       ORDER BY s.version DESC LIMIT 1`,
      [target]
    );
    if (snap) {
      snapshotId = snap.id;
      companyId = snap.company_id;
      companyName = snap.name;
    }
  }

  if (!snapshotId || !companyId) {
    throw new Error(`Could not find snapshot for target '${target}'`);
  }

  console.log(`[SYNC] Company: ${companyName} (${companyId})`);
  console.log(`[SYNC] Snapshot: ${snapshotId}`);

  // 2. Fetch chunks and documents
  console.log(`[SYNC] Loading chunks from PostgreSQL...`);
  const rows = await client.unsafe(
    `SELECT c.id, c.content, c.chunk_index, c.embedding::text as embedding_str,
            d.id as document_id, d.url, d.title, d.category,
            d.snapshot_id, s.company_id
     FROM chunks c
     JOIN documents d ON c.document_id = d.id
     JOIN company_snapshots s ON d.snapshot_id = s.id
     WHERE s.id = $1 AND c.embedding IS NOT NULL
     ORDER BY c.chunk_index ASC`,
    [snapshotId]
  );

  console.log(`[SYNC] Found ${rows.length} chunk vectors with embeddings in Postgres.`);
  if (rows.length === 0) {
    console.log(`[SYNC] No chunks to sync.`);
    await client.end();
    return;
  }

  // 3. Map to Qdrant Points
  const points = rows.map((r: any) => {
    let vector: number[] = [];
    if (typeof r.embedding_str === "string") {
      const clean = r.embedding_str.replace(/[\[\]]/g, "").trim();
      vector = clean.split(",").map((v: string) => parseFloat(v));
    }

    return {
      id: r.id,
      vector,
      payload: {
        company_id: r.company_id,
        snapshot_id: r.snapshot_id,
        document_id: r.document_id,
        chunk_index: r.chunk_index,
        url: r.url,
        title: r.title,
        category: r.category,
      },
    };
  });

  // 4. Batch Upsert to Qdrant
  console.log(`[SYNC] Upserting ${points.length} points to Qdrant collection 'company_chunks' (batches of 256)...`);
  const t0 = Date.now();
  await upsertChunkPoints(points, 256);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`[SYNC] Successfully upserted ${points.length} points in ${elapsed}s!`);

  // 5. Verify Collection Info
  const info = await getCollectionInfo();
  console.log(`-------------------------------------------------`);
  console.log(`QDRANT COLLECTION STATUS:`);
  console.log(`  Collection:    company_chunks`);
  console.log(`  Total Points:  ${info.points_count ?? info.vectors_count}`);
  console.log(`  Status:        ${info.status}`);
  console.log("=================================================");

  await client.end();
}

main().catch(async (err) => {
  console.error("[FATAL ERROR in qdrant-sync-snapshot]:", err);
  await client.end();
  process.exit(1);
});
