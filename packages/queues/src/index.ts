import { Queue, Worker, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";

export const redisConnection: ConnectionOptions = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379", 10),
  maxRetriesPerRequest: null,
};

export const QUEUE_NAMES = {
  CRAWL: "crawl-queue",
  PROCESSING: "processing-queue",
  EMBEDDING: "embedding-queue",
  VOICE: "voice-queue",
  ENRICH: "enrich-queue",
  BRAND: "brand-queue",
  ANALYTICS: "analytics-queue",
} as const;

export const crawlQueue = new Queue(QUEUE_NAMES.CRAWL, {
  connection: redisConnection,
});

export const processingQueue = new Queue(QUEUE_NAMES.PROCESSING, {
  connection: redisConnection,
});

export const embeddingQueue = new Queue(QUEUE_NAMES.EMBEDDING, {
  connection: redisConnection,
});

export const enrichQueue = new Queue(QUEUE_NAMES.ENRICH, {
  connection: redisConnection,
});

export const brandQueue = new Queue(QUEUE_NAMES.BRAND, {
  connection: redisConnection,
});

export interface AnalyticsTrackJobData {
  /** Single validated track event; the worker buffers + batch-inserts. */
  event: {
    event_id: string;
    type:
      | "pageview"
      | "chat_open"
      | "chat_message"
      | "conversion"
      | "scroll"
      | "download"
      | "click"
      | "heartbeat";
    company_id: string;
    widget_key_id: string | null;
    url: string;
    path: string;
    referrer: string;
    viewport: string;
    user_agent: string;
    /** The visitor profile, derived at the collector. Null when unknown. */
    browser: string | null;
    os: string | null;
    /** Minutes east of UTC, from the visitor's reported timezone. */
    tz_offset: number | null;
    session_hash: string;
    visitor_hash: string;
    value: number | null;
    meta: Record<string, unknown> | null;
    created_at: string;
  };
}

export const analyticsQueue = new Queue(QUEUE_NAMES.ANALYTICS, {
  connection: redisConnection,
  defaultJobOptions: {
    // Tracking is fire-and-forget: no retries on poison jobs, and completed
    // records are trimmed so one tenant's burst cannot grow Redis forever.
    attempts: 1,
    removeOnComplete: 1000,
    removeOnFail: 2000,
  },
});

export interface EnrichJobData {
  batchId: string;
}

export interface BrandJobData {
  companyId: string;
  snapshotId: string | null;
  origin: string;
}

export { Queue, Worker };
