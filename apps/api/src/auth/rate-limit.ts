/**
 * Auth endpoint rate limits. Redis-backed sliding windows under `rl:auth:*`,
 * with a conservative in-process fallback when Redis is unavailable
 * (docs/auth-tenancy.md §10.5). Never fail open for auth.
 */

import { createHash, randomBytes } from "node:crypto";
import { getRedisClient } from "@ag-ui/database";
import { logger } from "@ag-ui/shared";

export interface AuthRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

const memory = new Map<string, number[]>();
let warned = false;

function memoryCheck(key: string, limit: number, windowSec: number): AuthRateLimitResult {
  const now = Date.now();
  const cutoff = now - windowSec * 1000;
  const hits = (memory.get(key) ?? []).filter((t) => t > cutoff);

  if (hits.length >= limit) {
    memory.set(key, hits);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowSec * 1000 - now) / 1000)),
    };
  }

  hits.push(now);
  memory.set(key, hits);

  // Bound the fallback map so a long Redis outage cannot grow it forever.
  if (memory.size > 10_000) {
    for (const [k, v] of memory) {
      if (!v.length || v[v.length - 1] <= cutoff) memory.delete(k);
    }
  }

  return { allowed: true, retryAfterSec: 0 };
}

async function redisCheck(
  r: any,
  key: string,
  limit: number,
  windowSec: number
): Promise<AuthRateLimitResult> {
  const now = Date.now();
  const windowStart = now - windowSec * 1000;

  await r.zremrangebyscore(key, 0, windowStart);
  const count = await r.zcard(key);

  if (count >= limit) {
    const oldest: string[] = await r.zrange(key, 0, 0, "WITHSCORES").catch(() => []);
    const oldestScore = oldest.length >= 2 ? parseFloat(oldest[1]) : now;
    return {
      allowed: false,
      retryAfterSec: Math.max(
        1,
        Math.ceil((oldestScore + windowSec * 1000 - now) / 1000)
      ),
    };
  }

  await r.zadd(key, now.toString(), `${now}:${randomBytes(4).toString("hex")}`);
  await r.expire(key, windowSec);
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Check one bucket. `identifier` is hashed before it reaches Redis or memory,
 * so email addresses never appear in a key.
 */
export async function checkAuthRateLimit(
  scope: string,
  identifier: string,
  limit: number,
  windowSec: number
): Promise<AuthRateLimitResult> {
  const id = createHash("sha256").update(identifier).digest("hex").slice(0, 32);
  const key = `rl:auth:${scope}:${id}`;

  const r = await getRedisClient();
  if (r) {
    try {
      return await redisCheck(r, key, limit, windowSec);
    } catch {
      // fall through to the in-process counter
    }
  }

  if (!warned) {
    warned = true;
    logger.warn(
      "[auth] Redis unavailable; auth rate limits are using in-process counters"
    );
  }

  return memoryCheck(key, limit, windowSec);
}
