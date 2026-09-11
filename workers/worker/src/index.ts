import { Worker } from "bullmq";
import { QUEUE_NAMES, redisConnection } from "@ag-ui/queues";
import { logger } from "@ag-ui/shared";

logger.info("⚙️  Initializing ag-ui background workers on Bun...");

const crawlWorker = new Worker(
  QUEUE_NAMES.CRAWL,
  async (job) => {
    logger.info(`[CRAWL WORKER] Processing job ${job.id}:`, job.data);
    return { status: "processed", jobId: job.id };
  },
  { connection: redisConnection }
);

crawlWorker.on("completed", (job) => {
  logger.info(`[CRAWL WORKER] Job ${job.id} completed successfully`);
});

crawlWorker.on("failed", (job, err) => {
  logger.error(`[CRAWL WORKER] Job ${job?.id} failed:`, err);
});

logger.info("  Background workers listening to queues on Redis (localhost:6379)");
