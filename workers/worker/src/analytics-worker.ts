/**
 * workers/worker/src/analytics-worker.ts
 *
 * Phase 1 — analytics batch writer. Collector (Phase 2) enqueues one job per
 * validated event; this worker buffers in memory and flushes parameterized
 * multi-row INSERTs (500 rows or 2s, whichever first) so beacon storms never
 * become per-event DB round trips.
 *
 * Exactly-once via Redis `adedupe:{event_id}` SET NX (24h): sendBeacon
 * retries and double-fires collapse before the buffer. Crash-window loss
 * (acked job, unflushed buffer) is bounded to ~2s of tracking data and is
 * acceptable for analytics — chat paths are never affected.
 */

import { Worker } from "bullmq";
import Redis from "ioredis";
import {
  QUEUE_NAMES,
  redisConnection,
  type AnalyticsTrackJobData,
} from "@ag-ui/queues";
import { client } from "@ag-ui/database";
import {
  isBot,
  dedupeKey,
  DEDUPE_TTL_SECONDS,
  startRollupTick,
} from "@ag-ui/analytics";
import { logger } from "@ag-ui/shared";

const FLUSH_SIZE = 500;
const FLUSH_INTERVAL_MS = 2000;

const redis = new Redis({
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});

type BufferedEvent = AnalyticsTrackJobData["event"];

let buffer: BufferedEvent[] = [];
let flushChain: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setInterval> | null = null;

let seenJobs = 0;
let dupes = 0;
let insertedRows = 0;
let flushErrors = 0;

function monthKey(iso: string): { key: string; from: string; to: string } {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const key = `${y}${String(m + 1).padStart(2, "0")}`;
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01T00:00:00Z`;
  const nm = new Date(Date.UTC(y, m + 1, 1));
  const to = `${nm.getUTCFullYear()}-${String(nm.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00Z`;
  return { key, from, to };
}

/** Months already verified this process lifetime — avoids 3 catalog round
 * trips plus NOTICE spam on every flush at steady state. */
const knownPartitions = new Set<string>();

async function ensurePartitions(rows: BufferedEvent[]): Promise<void> {
  const months = new Map<string, { from: string; to: string }>();
  for (const r of rows) {
    const { key, from, to } = monthKey(r.created_at);
    if (!months.has(key) && !knownPartitions.has(key)) months.set(key, { from, to });
  }
  if (months.size === 0) return;
  // CREATE TABLE/INDEX IF NOT EXISTS emits 42P07 NOTICEs on first touch;
  // run them in one transaction with notices muted so logs stay readable.
  await client.begin(async (sql) => {
    await sql`SET LOCAL client_min_messages TO WARNING`;
    for (const [key, { from, to }] of months) {
      try {
        await sql.unsafe(
          `CREATE TABLE IF NOT EXISTS page_views_${key} PARTITION OF page_views FOR VALUES FROM ('${from}') TO ('${to}');`
        );
        await sql.unsafe(
          `CREATE INDEX IF NOT EXISTS page_views_${key}_company_time_idx ON page_views_${key} (company_id, created_at);`
        );
        await sql.unsafe(
          `CREATE INDEX IF NOT EXISTS page_views_${key}_session_idx ON page_views_${key} (session_hash);`
        );
      } catch (err: any) {
        // Concurrent worker race on first touch: 42P07/42710 means the
        // partition now exists — safe to proceed. Anything else rethrows.
        const code = String(err?.code ?? "");
        if (code !== "42P07" && code !== "42710") throw err;
      }
      knownPartitions.add(key);
    }
  });
}

const COLS = [
  "event_id", "type", "company_id", "widget_key_id", "session_hash",
  "visitor_hash", "url", "path", "referrer", "viewport", "user_agent",
  "is_bot", "value", "meta", "created_at",
] as const;

async function flush(): Promise<void> {
  if (buffer.length === 0) return;
  const rows = buffer;
  buffer = [];
  try {
    await ensurePartitions(rows);
    const params: unknown[] = [];
    const tuples = rows.map((r) => {
      const base = params.length;
      const vals = [
        r.event_id, r.type, r.company_id, r.widget_key_id, r.session_hash,
        r.visitor_hash, r.url, r.path, r.referrer, r.viewport, r.user_agent,
        isBot(r.user_agent), r.value,
        r.meta === null ? null : JSON.stringify(r.meta), r.created_at,
      ];
      vals.forEach((v) => params.push(v));
      return `(${vals.map((_, i) => `$${base + i + 1}`).join(",")})`;
    });
    await client.unsafe(
      `INSERT INTO page_views (${COLS.join(",")}) VALUES ${tuples.join(",")} ON CONFLICT DO NOTHING;`,
      params as any[]
    );
    insertedRows += rows.length;
  } catch (err: any) {
    flushErrors++;
    logger.error(`[ANALYTICS WORKER] flush of ${rows.length} rows failed: ${err?.message ?? err}`);
  }
}

function scheduleFlush(): void {
  flushChain = flushChain.then(() => flush()).catch(() => {});
}

function armTimer(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (buffer.length > 0) scheduleFlush();
  }, FLUSH_INTERVAL_MS);
  timer.unref?.();
}

export const analyticsWorker = new Worker<AnalyticsTrackJobData>(
  QUEUE_NAMES.ANALYTICS,
  async (job) => {
    seenJobs++;
    armTimer();
    const claimed = await redis.set(dedupeKey(job.data.event.event_id), "1", "EX", DEDUPE_TTL_SECONDS, "NX");
    if (claimed === null) {
      dupes++; // sendBeacon retry / double-fire — collapse silently
      return { deduped: true };
    }
    buffer.push(job.data.event);
    if (buffer.length >= FLUSH_SIZE) scheduleFlush();
    return { buffered: true };
  },
  { connection: redisConnection, concurrency: 10 }
);

async function shutdownFlush(): Promise<void> {
  try {
    await flushChain;
    await flush();
  } catch {}
}
process.once("SIGTERM", () => void shutdownFlush());
process.once("SIGINT", () => void shutdownFlush());

export function analyticsWorkerStats() {
  return { seenJobs, dupes, insertedRows, flushErrors, buffered: buffer.length };
}

// Phase 3 — rollup/HLL/retention tick (default 15min, idempotent under a
// Redis lock so multi-replica workers converge instead of duplicating).
startRollupTick(
  redis,
  Math.max(60_000, parseInt(process.env.ANALYTICS_ROLLUP_MS || "900000", 10) || 900_000)
);

analyticsWorker.on("failed", (job, err) => {
  logger.error(`[ANALYTICS WORKER] Job ${job?.id} failed: ${err.message}`);
});

logger.info("Analytics batch worker listening on Redis queue: analytics-queue");
