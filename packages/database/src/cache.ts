/**
 * packages/database/src/cache.ts
 *
 * Redis caching layer for Retrieval & Query Embeddings.
 * Adheres strictly to Section 0 frozen contracts:
 * - Query embedding cache: qemb:v1:{sha256(normalized_query)}, TTL 1 hour (3600s).
 * - Retrieval context cache: qctx:v1:{company_id}:{snapshot_id}:{sha256(normalized_query)}:{limit}, TTL 5 min (300s).
 * - Invalidation: on snapshot -> READY, delete qctx:v1:{company_id}:* keys.
 * - Graceful degradation: If Redis is offline or disconnected, cache degrades to all-miss.
 */

import { createHash } from "node:crypto";

export const QUERY_EMBED_TTL_SECONDS = 3600; // 1 hour
export const RETRIEVAL_CONTEXT_TTL_SECONDS = 300; // 5 minutes

export function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

export function hashQuery(query: string): string {
  const norm = normalizeQuery(query);
  return createHash("sha256").update(norm).digest("hex");
}

export function queryEmbeddingKey(query: string): string {
  return `qemb:v1:${hashQuery(query)}`;
}

export function retrievalContextKey(
  companyId: string,
  snapshotId: string,
  query: string,
  limit: number
): string {
  return `qctx:v1:${companyId}:${snapshotId}:${hashQuery(query)}:${limit}`;
}

let redisClientPromise: Promise<any | null> | null = null;
let cooldownUntil = 0;
let warned = false;

export function getRedisClient(): Promise<any | null> {
  if (process.env.REDIS_CACHE_OFF === "1") return Promise.resolve(null);
  if (Date.now() < cooldownUntil) return Promise.resolve(null);

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const mod = await import("ioredis");
        const Redis = (mod as any).default ?? mod.Redis ?? mod;
        const r = new Redis({
          host: process.env.REDIS_HOST || "127.0.0.1",
          port: parseInt(process.env.REDIS_PORT || "6379", 10),
          connectTimeout: 2000,
          maxRetriesPerRequest: 1,
          retryStrategy: () => null, // fail fast on reconnects
        });
        r.on("error", () => {
          // handled via nulls
        });
        await r.ping();
        return r;
      } catch (err: any) {
        if (!warned) {
          console.warn(`[CACHE] Redis unavailable (${err.message || err}). Running without cache.`);
          warned = true;
        }
        cooldownUntil = Date.now() + 60000;
        redisClientPromise = null;
        return null;
      }
    })();
  }
  return redisClientPromise;
}

/**
 * Gets cached query embedding vector from Redis (qemb:v1:...)
 */
export async function getCachedQueryEmbedding(query: string): Promise<number[] | null> {
  const r = await getRedisClient();
  if (!r) return null;
  try {
    const key = queryEmbeddingKey(query);
    const raw = await r.get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.v)) return parsed.v;
    return null;
  } catch {
    return null;
  }
}

/**
 * Sets cached query embedding vector in Redis with 1 hour TTL
 */
export async function setCachedQueryEmbedding(query: string, vector: number[]): Promise<void> {
  const r = await getRedisClient();
  if (!r) return;
  try {
    const key = queryEmbeddingKey(query);
    const val = JSON.stringify({ v: vector });
    await r.set(key, val, "EX", QUERY_EMBED_TTL_SECONDS);
  } catch {
    // best-effort
  }
}

/**
 * Gets cached retrieval context from Redis (qctx:v1:...)
 */
export async function getCachedRetrievalContext<T = any>(
  companyId: string,
  snapshotId: string,
  query: string,
  limit: number
): Promise<T | null> {
  const r = await getRedisClient();
  if (!r) return null;
  try {
    const key = retrievalContextKey(companyId, snapshotId, query, limit);
    const raw = await r.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Caches retrieval context in Redis with 5 minutes TTL
 */
export async function setCachedRetrievalContext(
  companyId: string,
  snapshotId: string,
  query: string,
  limit: number,
  context: any
): Promise<void> {
  const r = await getRedisClient();
  if (!r) return;
  try {
    const key = retrievalContextKey(companyId, snapshotId, query, limit);
    const val = JSON.stringify(context);
    await r.set(key, val, "EX", RETRIEVAL_CONTEXT_TTL_SECONDS);
  } catch {
    // best-effort
  }
}

/**
 * Deletes all retrieval context caches for a company upon transition to READY.
 * Pattern: qctx:v1:{companyId}:*
 */
export async function invalidateCompanyContextCache(companyId: string): Promise<number> {
  const r = await getRedisClient();
  if (!r) return 0;
  try {
    const pattern = `qctx:v1:${companyId}:*`;
    let cursor = "0";
    let totalDeleted = 0;

    do {
      const [nextCursor, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys && keys.length > 0) {
        await r.del(...keys);
        totalDeleted += keys.length;
      }
    } while (cursor !== "0");

    if (totalDeleted > 0) {
      console.log(`[CACHE] Invalidated ${totalDeleted} context cache entries for company ${companyId}`);
    }
    return totalDeleted;
  } catch {
    return 0;
  }
}

/**
 * Closes the Redis connection (useful for scripts and tests to terminate event loop).
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClientPromise) {
    const r = await redisClientPromise;
    if (r) {
      try {
        r.disconnect();
      } catch {
        // ignore
      }
    }
    redisClientPromise = null;
  }
}
