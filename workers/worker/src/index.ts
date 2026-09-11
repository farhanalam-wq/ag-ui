// Allow self-signed certificates for corporate proxy / local dev environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { Worker } from "bullmq";
import { QUEUE_NAMES, redisConnection } from "@ag-ui/queues";
import { db, companySnapshots, brands, documents, eq } from "@ag-ui/database";
import { CompanyCrawler } from "@ag-ui/crawler";
import { logger } from "@ag-ui/shared";

logger.info("Initializing ag-ui background crawl worker on Bun...");

interface CrawlJobData {
  companyId: string;
  snapshotId: string;
  url: string;
  maxPages?: number;
}

const crawler = new CompanyCrawler();

export const crawlWorker = new Worker<CrawlJobData>(
  QUEUE_NAMES.CRAWL,
  async (job) => {
    const { companyId, snapshotId, url, maxPages } = job.data;
    logger.info(`[CRAWL WORKER] Starting crawl job ${job.id} for ${url} (snapshot: ${snapshotId})`);

    try {
      // 1. Mark snapshot status as CRAWLING
      await db
        .update(companySnapshots)
        .set({ status: "CRAWLING" })
        .where(eq(companySnapshots.id, snapshotId));

      // 2. Run crawl engine
      const crawlResult = await crawler.crawl(url, {
        maxPages: maxPages || 10,
      });

      logger.info(
        `[CRAWL WORKER] Crawl completed for ${url}: ${crawlResult.pagesCrawled} pages, ${crawlResult.documents.length} docs`
      );

      // 3. Upsert brand tokens
      const existingBrand = await db.query.brands.findFirst({
        where: eq(brands.companyId, companyId),
      });

      if (existingBrand) {
        await db
          .update(brands)
          .set({
            logoUrl: crawlResult.brand.logoUrl,
            tokens: crawlResult.brand.tokens,
          })
          .where(eq(brands.id, existingBrand.id));
      } else {
        await db.insert(brands).values({
          companyId,
          logoUrl: crawlResult.brand.logoUrl,
          tokens: crawlResult.brand.tokens,
        });
      }

      // 4. Insert extracted documents
      if (crawlResult.documents.length > 0) {
        const docRows = crawlResult.documents.map((doc) => ({
          snapshotId,
          url: doc.url,
          title: doc.title,
          category: doc.category,
          content: doc.content,
        }));

        await db.insert(documents).values(docRows);
      }

      // 5. Mark snapshot as READY
      await db
        .update(companySnapshots)
        .set({
          status: "READY",
          pageCount: crawlResult.pagesCrawled,
        })
        .where(eq(companySnapshots.id, snapshotId));

      logger.info(`[CRAWL WORKER] Snapshot ${snapshotId} marked as READY`);

      return {
        status: "READY",
        pagesCrawled: crawlResult.pagesCrawled,
        documentCount: crawlResult.documents.length,
      };
    } catch (err: any) {
      logger.error(`[CRAWL WORKER] Job ${job.id} failed for ${url}:`, err.message);

      // Mark snapshot as FAILED
      await db
        .update(companySnapshots)
        .set({ status: "FAILED" })
        .where(eq(companySnapshots.id, snapshotId));

      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

crawlWorker.on("completed", (job) => {
  logger.info(`[CRAWL WORKER] Job ${job.id} completed successfully`);
});

crawlWorker.on("failed", (job, err) => {
  logger.error(`[CRAWL WORKER] Job ${job?.id} failed with error: ${err.message}`);
});

logger.info("Background crawl worker listening on Redis queue: crawl-queue");
