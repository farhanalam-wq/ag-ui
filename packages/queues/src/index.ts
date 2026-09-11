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

export { Queue, Worker };
