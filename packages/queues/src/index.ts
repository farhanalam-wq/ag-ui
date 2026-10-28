import { Queue, Worker, type ConnectionOptions } from "bullmq";
import Redis from "ioredis";
import { redisConnectionOptions } from "@ag-ui/shared";

export const redisConnection: ConnectionOptions = {
  ...redisConnectionOptions(),
  maxRetriesPerRequest: null,
} as ConnectionOptions;

export const QUEUE_NAMES = {
  CRAWL: "crawl-queue",
  PROCESSING: "processing-queue",
  EMBEDDING: "embedding-queue",
  VOICE: "voice-queue",
  ENRICH: "enrich-queue",
  CHAT_ENRICH: "chat-enrich-queue",
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

/**
 * Post-chat derived-data pass: lead extraction (spec §9.2) + competitor
 * mention tagging, over one conversation. Fire-and-forget from the chat
 * routes — never awaited in the SSE stream.
 */
export interface ConversationEnrichJobData {
  companyId: string;
  conversationId: string;
  /** Widget key row that hosted the chat, null for studio/playground chats. */
  widgetKeyId: string | null;
  engine: "text" | "voice";
}

export const enrichQueue = new Queue(QUEUE_NAMES.ENRICH, {
  connection: redisConnection,
});

export const chatEnrichQueue = new Queue(QUEUE_NAMES.CHAT_ENRICH, {
  connection: redisConnection,
  // Extraction is retryable (transient LLM/network failures), but three
  // attempts is the ceiling — poison transcripts just fail loud in the ledger.
  defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 2000 } },
});

export { Queue, Worker };
