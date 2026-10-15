import { createHash } from "node:crypto";
import { getRedisClient } from "./cache";

export interface EmbedRateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

function rateLimitEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bucketKey(namespace: string, window: string, keyHash: string, ip: string): string {
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  return `rl:${namespace}:${window}:${keyHash.slice(0, 32)}:${ipHash}`;
}

async function checkBucket(
  r: any,
  key: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; retryAfterSec: number }> {
  const nowMs = Date.now();
  const windowStart = nowMs - windowSec * 1000;
  await r.zremrangebyscore(key, 0, windowStart);
  const count = await r.zcard(key);
  if (count >= limit) {
    const oldest: string[] = await r.zrange(key, 0, 0, "WITHSCORES").catch(() => []);
    const oldestScore = oldest.length >= 2 ? parseFloat(oldest[1]) : nowMs;
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldestScore + windowSec * 1000 - nowMs) / 1000)
    );
    return { allowed: false, retryAfterSec };
  }
  await r.zadd(key, nowMs.toString(), `${nowMs}:${Math.random().toString(36).slice(2)}`);
  await r.expire(key, windowSec);
  return { allowed: true, retryAfterSec: 0 };
}

/**
 * Anonymous rate limit, scoped per namespace + key hash + client IP.
 * Fail-open when Redis is unavailable (logs once via cache layer).
 *
 * `scope` namespaces the Redis keys (e.g. "embed" for text chat,
 * "voice" for voice token mints) so buckets never collide across surfaces.
 */
export async function checkEmbedRateLimit(
  keyHash: string,
  ip: string,
  scope = "embed"
): Promise<EmbedRateLimitResult> {
  const perMin = rateLimitEnv("EMBED_RATE_PER_MIN", 30);
  const perDay = rateLimitEnv("EMBED_RATE_PER_DAY", 200);
  const r = await getRedisClient();
  if (!r) return { allowed: true, retryAfterSec: 0 };

  try {
    const min = await checkBucket(r, bucketKey(scope, "min", keyHash, ip), perMin, 60);
    if (!min.allowed) return min;
    const day = await checkBucket(r, bucketKey(scope, "day", keyHash, ip), perDay, 86400);
    return day;
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}

/**
 * Tracking-event rate limit (pageviews/conversions). Pageviews are
 * high-volume by nature (SPAs, campaigns), so this gets its own generous
 * budget separate from chat: per key-hash + IP, fail-open like chat.
 * One tenant's bot flood burns only its own buckets (noisy-neighbor safe).
 */
export async function checkTrackRateLimit(
  keyHash: string,
  ip: string
): Promise<EmbedRateLimitResult> {
  // Deliberately generous: B2C visitors share IPs behind carrier-grade NAT,
  // so per-IP can only be an abuse backstop, never a precision throttle.
  // Precision throttling is per-key and lands in Phase 5 with quotas.
  const perMin = rateLimitEnv("TRACK_RATE_PER_MIN", 1000);
  const perDay = rateLimitEnv("TRACK_RATE_PER_DAY", 50000);
  const r = await getRedisClient();
  if (!r) return { allowed: true, retryAfterSec: 0 };

  try {
    const min = await checkBucket(r, bucketKey("track", "min", keyHash, ip), perMin, 60);
    if (!min.allowed) return min;
    const day = await checkBucket(r, bucketKey("track", "day", keyHash, ip), perDay, 86400);
    return day;
  } catch {
    return { allowed: true, retryAfterSec: 0 };
  }
}
