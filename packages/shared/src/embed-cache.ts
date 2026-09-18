import { createHash } from "node:crypto";
import { logger } from "./logger";

export const EMBED_CACHE_VERSION = "v1";
export const EMBED_CACHE_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Cache key. Model and dims are part of the key so a future model or
 * dimension change can never serve stale vectors from an older config.
 */
export function embedCacheKey(model: string, dims: number, text: string): string {
  const h = createHash("sha256").update(text).digest("hex");
  return `emb:${EMBED_CACHE_VERSION}:${model}:${dims}:${h}`;
}

interface CachedVector {
  v: number[];
  m: string;
}

/**
 * Redis-backed embedding cache. Failures never propagate: when Redis is
 * unreachable the cache degrades to all-miss and ingestion proceeds to
 * OpenAI exactly as if the cache did not exist.
 */
export class EmbedCache {
  private redisPromise: Promise<any | null> | null = null;
  private cooldownUntil = 0;
  private warned = false;

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    logger.warn(`[EMBED-CACHE] ${message} Ingestion continues uncached.`);
  }

  private client(): Promise<any | null> {
    if (process.env.EMBED_CACHE_OFF === "1") return Promise.resolve(null);
    if (Date.now() < this.cooldownUntil) return Promise.resolve(null);
    if (!this.redisPromise) {
      this.redisPromise = (async () => {
        try {
          const mod = await import("ioredis");
          const Redis = (mod as any).default ?? mod.Redis ?? mod;
          const r = new Redis({
            host: process.env.REDIS_HOST || "127.0.0.1",
            port: parseInt(process.env.REDIS_PORT || "6379", 10),
            connectTimeout: 2000,
            maxRetriesPerRequest: 1,
            // enableReadyCheck stays true (default) so the ping below waits for
            // a ready socket instead of failing fast on a cold connection.
            retryStrategy: () => null, // fail fast on reconnects, never hang ingestion
          });
          r.on("error", () => {
            // swallowed: handled via nulls below
          });
          await r.ping();
          return r;
        } catch (err: any) {
          this.warnOnce(`Redis unavailable (${String(err?.message ?? err).slice(0, 120)}).`);
          this.cooldownUntil = Date.now() + 60000;
          this.redisPromise = null;
          return null;
        }
      })();
    }
    return this.redisPromise;
  }

  /** Batch lookup. Returns null per missing or invalid entry. Model mismatch counts as miss. */
  async getMany(keys: string[], model: string): Promise<(number[] | null)[]> {
    const r = await this.client();
    if (!r || keys.length === 0) return keys.map(() => null);
    try {
      const vals: (string | null)[] = await r.mget(...keys);
      return vals.map((v) => {
        if (!v) return null;
        try {
          const o = JSON.parse(v) as CachedVector;
          if (!Array.isArray(o?.v) || o.m !== model) return null;
          return o.v;
        } catch {
          return null;
        }
      });
    } catch {
      return keys.map(() => null);
    }
  }

  /** Batch write with TTL. Best effort, never throws. */
  async setMany(entries: { key: string; vector: number[]; model: string }[]): Promise<void> {
    const r = await this.client();
    if (!r || entries.length === 0) return;
    try {
      const pipe = r.pipeline();
      for (const e of entries) {
        pipe.set(e.key, JSON.stringify({ v: e.vector, m: e.model } satisfies CachedVector), "EX", EMBED_CACHE_TTL_SECONDS);
      }
      await pipe.exec();
    } catch {
      // best effort only
    }
  }
}

let defaultCache: EmbedCache | null = null;

/** Process-wide singleton. Inject a fresh instance in tests to isolate state. */
export function getDefaultEmbedCache(): EmbedCache {
  if (!defaultCache) defaultCache = new EmbedCache();
  return defaultCache;
}
