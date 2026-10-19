/**
 * scripts/clear-db.ts
 * Full wipe: Postgres (all ingest tables) + Qdrant points + Redis ingest keys.
 * Usage:
 *   bun scripts/clear-db.ts        # dry report, exits 1
 *   bun scripts/clear-db.ts --yes  # wipe, exits 0 on success
 * Flags: --skip-qdrant, --skip-redis, --qdrant-recreate
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv() {
  try {
    const p = join(process.cwd(), ".env");
    if (!existsSync(p)) return;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const idx = t.indexOf("=");
      const k = t.slice(0, idx).trim();
      let v = t.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {}
}
loadDotEnv();

import { client } from "../packages/database/src/index";

const PG_TABLES = [
  "widget_key_domains", "messages", "batch_files", "chunks", "facts",
  "documents", "crawl_jobs", "brand_stylesheets", "enrichment_batches",
  "conversations", "company_snapshots", "widget_keys", "brands", "companies",
];
const REDIS_PATTERNS = ["emb:v1:*", "qemb:v1:*", "qctx:v1:*", "frontier:*", "rl:ingest:*"];
const COLLECTION = "company_chunks";
const args = new Set(process.argv.slice(2));
const YES = args.has("--yes");

const qUrl = (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/+$/, "");
const qHeaders: Record<string, string> = { "Content-Type": "application/json" };
if (process.env.QDRANT_API_KEY) qHeaders["api-key"] = process.env.QDRANT_API_KEY;

async function pgCounts(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of PG_TABLES) {
    try {
      const r = await client.unsafe(`SELECT COUNT(*)::int AS c FROM "${t}";`);
      out[t] = (r as any[])[0]?.c ?? -1;
    } catch { out[t] = -1; }
  }
  return out;
}
async function qdrantCount(): Promise<number | string> {
  try {
    const r = await fetch(`${qUrl}/collections/${COLLECTION}/count`, {
      method: "POST", headers: qHeaders, body: JSON.stringify({ exact: true }),
    });
    if (r.status === 404) return "no-collection";
    if (!r.ok) return `http-${r.status}`;
    return (await r.json() as any)?.result?.count ?? -1;
  } catch (e: any) { return `unreachable:${e?.message ?? e}`; }
}
async function redisCount(): Promise<number | string> {
  try {
    const mod = await import("ioredis");
    const Redis = (mod as any).default ?? mod.Redis ?? mod;
    const redis = new Redis({ host: process.env.REDIS_HOST || "127.0.0.1", port: parseInt(process.env.REDIS_PORT || "6379", 10), lazyConnect: true, maxRetriesPerRequest: 1, retryStrategy: () => null });
    let total = 0;
    for (const pat of REDIS_PATTERNS) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pat, "COUNT", 500);
        cursor = next; total += keys.length;
      } while (cursor !== "0");
    }
    await redis.quit().catch(() => {});
    return total;
  } catch (e: any) { return `unreachable:${e?.message ?? e}`; }
}

async function main() {
  console.log("=== CLEAR-DB report ===");
  const pg = await pgCounts();
  const q = args.has("--skip-qdrant") ? "skipped" : await qdrantCount();
  const rc = args.has("--skip-redis") ? "skipped" : await redisCount();
  console.table(pg);
  console.log({ qdrant_points: q, redis_scoped_keys: rc });
  const dbHost = (process.env.DATABASE_URL || "").replace(/:[^:@]*@/, ":***@");
  console.log({ target: { pg: dbHost || "default localhost", qdrant: qUrl } });

  if (!YES) {
    console.log("DRY-RUN: pass --yes to wipe PG + Qdrant points + Redis scoped keys.");
    process.exit(1);
  }
  // 1. Postgres — single TRUNCATE, CASCADE makes order FK-safe
  await client.unsafe(`TRUNCATE ${PG_TABLES.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE;`);
  console.log("[PG] truncated all tables");
  // 2. Qdrant — delete all points, keep collection; optional recreate
  if (!args.has("--skip-qdrant")) {
    if (args.has("--qdrant-recreate")) {
      await fetch(`${qUrl}/collections/${COLLECTION}`, { method: "DELETE", headers: qHeaders }).catch(() => {});
      const put = await fetch(`${qUrl}/collections/${COLLECTION}`, { method: "PUT", headers: qHeaders,
        body: JSON.stringify({ vectors: { size: 1536, distance: "Cosine" }, hnsw_config: { ef_construct: 128, m: 16 } }) });
      if (!put.ok) throw new Error(`qdrant recreate failed: ${await put.text()}`);
      for (const [field, schema] of [["company_id","keyword"],["snapshot_id","keyword"],["document_id","keyword"],["category","keyword"],["chunk_index","integer"]]) {
        await fetch(`${qUrl}/collections/${COLLECTION}/index`, { method: "PUT", headers: qHeaders,
          body: JSON.stringify({ field_name: field, field_schema: schema }) });
      }
      console.log("[QDRANT] collection recreated");
    } else {
      const del = await fetch(`${qUrl}/collections/${COLLECTION}/points/delete?wait=true`, { method: "POST", headers: qHeaders, body: JSON.stringify({ filter: {} }) });
      if (!del.ok && del.status !== 404) throw new Error(`qdrant delete failed: ${await del.text()}`);
      console.log("[QDRANT] all points deleted");
    }
  }
  // 3. Redis — scoped keys only, never FLUSHDB
  if (!args.has("--skip-redis")) {
    const mod = await import("ioredis");
    const Redis = (mod as any).default ?? mod.Redis ?? mod;
    const redis = new Redis({ host: process.env.REDIS_HOST || "127.0.0.1", port: parseInt(process.env.REDIS_PORT || "6379", 10), maxRetriesPerRequest: 1, retryStrategy: () => null });
    let deleted = 0;
    for (const pat of REDIS_PATTERNS) {
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "MATCH", pat, "COUNT", 500);
        cursor = next;
        if (keys.length) deleted += await redis.del(...keys);
      } while (cursor !== "0");
    }
    await redis.quit().catch(() => {});
    console.log(`[REDIS] deleted ${deleted} scoped keys`);
  }
  console.log("--- verify ---");
  console.table(await pgCounts());
  console.log({ qdrant_points: await qdrantCount(), redis_scoped_keys: await redisCount() });
  try { await (client as any).end?.(); } catch {}
}
main().catch(async (e) => { console.error("[FATAL]", e?.message ?? e); try { await (client as any).end?.(); } catch {} process.exit(1); });