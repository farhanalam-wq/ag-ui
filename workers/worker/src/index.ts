// Allow self-signed certificates for corporate proxy / local dev environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { createHash, randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { QUEUE_NAMES, redisConnection } from "@ag-ui/queues";
import {
  db,
  companies,
  companySnapshots,
  brands,
  documents,
  chunks,
  facts,
  eq,
  upsertChunkPoints,
  invalidateCompanyContextCache,
} from "@ag-ui/database";
import { CompanyCrawler } from "@ag-ui/crawler";
import {
  logger,
  chunkMarkdown,
  generateEmbeddings,
  extractCompanyFacts,
} from "@ag-ui/shared";

logger.info("Initializing ag-ui background crawl worker on Bun...");
logger.info(`[CRAWL WORKER] OPENAI_API_KEY configured: ${!!process.env.OPENAI_API_KEY}`);

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
      let insertedDocs: {
        id: string;
        snapshotId: string;
        url: string;
        title: string;
        category: string;
        content: string;
      }[] = [];

      if (crawlResult.documents.length > 0) {
        const docRows = crawlResult.documents.map((doc) => {
          const content = doc.content || "";
          const contentHash = createHash("sha256").update(content).digest("hex");
          const wordCount = content.split(/\s+/).filter(Boolean).length;
          const headings = (doc.headings || []).slice(0, 50);
          return {
            snapshotId,
            url: doc.url,
            title: doc.title,
            category: doc.category,
            content,
            contentHash,
            wordCount,
            headings,
          };
        });

        insertedDocs = await db.insert(documents).values(docRows).returning();
      }

      // 5. Transition snapshot to PROCESSING for chunking & embeddings
      await db
        .update(companySnapshots)
        .set({ status: "PROCESSING" })
        .where(eq(companySnapshots.id, snapshotId));

      logger.info(`[CRAWL WORKER] Snapshot ${snapshotId} status: PROCESSING`);

      // 6. Semantic chunking & 1536-dim embedding generation
      const allChunksToProcess: {
        documentId: string;
        content: string;
        chunkIndex: number;
      }[] = [];

      for (const doc of insertedDocs) {
        const docChunks = chunkMarkdown(doc.content, {
          docTitle: doc.title,
          url: doc.url,
        });

        for (const c of docChunks) {
          allChunksToProcess.push({
            documentId: doc.id,
            content: c.content,
            chunkIndex: c.chunkIndex,
          });
        }
      }

      if (allChunksToProcess.length > 0) {
        logger.info(`[CRAWL WORKER] Generating embeddings for ${allChunksToProcess.length} chunks...`);
        const embeddings = await generateEmbeddings(
          allChunksToProcess.map((c) => c.content)
        );

        const docMap = new Map(insertedDocs.map((d) => [d.id, d]));
        const chunkRows = allChunksToProcess.map((c) => {
          const chunkId = randomUUID();
          const doc = docMap.get(c.documentId);
          return {
            id: chunkId,
            documentId: c.documentId,
            content: c.content,
            chunkIndex: c.chunkIndex,
            url: doc?.url || "",
            title: doc?.title || "",
            category: doc?.category || "general",
          };
        });

        // 1. Batch insert relational chunks into PostgreSQL (no vector column)
        for (let i = 0; i < chunkRows.length; i += 50) {
          await db.insert(chunks).values(
            chunkRows.slice(i, i + 50).map((r) => ({
              id: r.id,
              documentId: r.documentId,
              content: r.content,
              chunkIndex: r.chunkIndex,
            }))
          );
        }

        // 2. Batch upsert vectors into Qdrant
        const qdrantPoints = chunkRows.map((r, idx) => ({
          id: r.id,
          vector: embeddings[idx],
          payload: {
            company_id: companyId,
            snapshot_id: snapshotId,
            document_id: r.documentId,
            chunk_index: r.chunkIndex,
            url: r.url,
            title: r.title,
            category: r.category,
          },
        }));

        await upsertChunkPoints(qdrantPoints, 256);
        logger.info(`[CRAWL WORKER] Successfully saved ${chunkRows.length} vector chunks into Qdrant collection 'company_chunks'`);
      }

      // 7. Deterministic fact extraction
      const [companyRecord] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      const companyName = companyRecord?.name || "COMPANY";
      const domain = companyRecord?.domain || url;

      const extractedFacts = extractCompanyFacts(companyName, domain, insertedDocs);
      if (extractedFacts.length > 0) {
        const factRows = extractedFacts.map((f) => ({
          snapshotId,
          subject: f.subject,
          predicate: f.predicate,
          value: f.value,
          confidence: f.confidence,
        }));

        await db.insert(facts).values(factRows);
        logger.info(`[CRAWL WORKER] Successfully saved ${factRows.length} deterministic facts to PostgreSQL`);
      }

      // 8. Mark snapshot as READY & invalidate stale retrieval cache
      await db
        .update(companySnapshots)
        .set({
          status: "READY",
          pageCount: crawlResult.pagesCrawled,
        })
        .where(eq(companySnapshots.id, snapshotId));

      await invalidateCompanyContextCache(companyId);
      logger.info(`[CRAWL WORKER] Snapshot ${snapshotId} marked as READY`);

      return {
        status: "READY",
        pagesCrawled: crawlResult.pagesCrawled,
        documentCount: crawlResult.documents.length,
        chunkCount: allChunksToProcess.length,
        factsCount: extractedFacts.length,
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
