import { Elysia, t } from "elysia";
import { validateSafeUrl } from "@ag-ui/crawler";
import { discoverPages } from "@ag-ui/crawler";
import { logger } from "@ag-ui/shared";
import { db, brands, companies, companySnapshots, crawlJobs, eq, desc } from "@ag-ui/database";
import { runIngestPipeline, type PipelineProgressEvent } from "../../../../ingest-cli";

class AsyncEventQueue<T> {
  private queue: T[] = [];
  private resolvers: ((item: T | null) => void)[] = [];
  private done = false;

  push(item: T) {
    if (this.resolvers.length > 0) {
      const resolve = this.resolvers.shift()!;
      resolve(item);
    } else {
      this.queue.push(item);
    }
  }

  close() {
    this.done = true;
    while (this.resolvers.length > 0) {
      this.resolvers.shift()!(null);
    }
  }

  async *[Symbol.asyncIterator]() {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        break;
      } else {
        const item = await new Promise<T | null>((resolve) => this.resolvers.push(resolve));
        if (item === null) break;
        yield item;
      }
    }
  }
}

export const crawlerRoutes = new Elysia({ prefix: "/api/crawler" })
  // 1. Autonomous fast discovery: probes robots, sitemaps (BFS index recursion), llms.txt
  .post(
    "/discover",
    async ({ body, set }) => {
      const { url: rawUrl, maxSitemaps, maxSitemapUrls } = body;

      let parsedUrl: URL;
      try {
        let clean = rawUrl.trim();
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
          clean = `https://${clean}`;
        }
        parsedUrl = new URL(clean);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          set.status = 400;
          return { error: "URL must use http or https protocol" };
        }
      } catch {
        set.status = 400;
        return { error: "Invalid URL string provided" };
      }

      // SSRF check
      let safeBaseUrl: URL;
      try {
        safeBaseUrl = await validateSafeUrl(parsedUrl.toString());
      } catch (err: any) {
        set.status = 403;
        return {
          error: "SSRF validation failed: Target IP or domain is not permitted",
          details: err.message,
        };
      }

      try {
        logger.info(`[API:DISCOVERY] Discovering crawlable pages for ${safeBaseUrl.origin}...`);
        const { pages, info } = await discoverPages(safeBaseUrl, {
          maxSitemaps: maxSitemaps || 10,
          maxSitemapUrls: maxSitemapUrls || 2000,
        });

        logger.info(
          `[API:DISCOVERY] Found ${pages.length} URLs for ${info.domain} in ${info.durationMs}ms`
        );

        return {
          success: true,
          domain: info.domain,
          origin: safeBaseUrl.origin,
          pages,
          info,
        };
      } catch (err: any) {
        logger.error(`[API:DISCOVERY] Discovery failed: ${err.message}`);
        set.status = 500;
        return {
          error: "Discovery failed",
          details: err.message,
        };
      }
    },
    {
      body: t.Object({
        url: t.String(),
        maxSitemaps: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
        maxSitemapUrls: t.Optional(t.Number({ minimum: 10, maximum: 5000 })),
      }),
      detail: {
        summary: "Discover crawlable URLs",
        description:
          "Fast autonomous discovery probing robots.txt, recursive sitemaps, and llms.txt with category inference.",
      },
    }
  )

  // 2. Query status of an active or recent crawl job by ID
  .get(
    "/jobs/:id",
    async ({ params, set }) => {
      const [job] = await db
        .select()
        .from(crawlJobs)
        .where(eq(crawlJobs.id, params.id))
        .limit(1);

      if (!job) {
        set.status = 404;
        return { error: "Job not found" };
      }

      let snapshot = null;
      if (job.snapshotId) {
        const [snap] = await db
          .select()
          .from(companySnapshots)
          .where(eq(companySnapshots.id, job.snapshotId))
          .limit(1);
        snapshot = snap || null;
      }

      return { job, snapshot };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get crawl job status",
        description: "Returns the current state and progress counters of a crawl job.",
      },
    }
  )

  // 3. Query status of the latest crawl job for a domain
  .get(
    "/status/:domain",
    async ({ params, set }) => {
      const cleanDomain = params.domain
        .replace(/^https?:\/\//, "")
        .replace(/\/.*$/, "")
        .replace(/^www\./, "")
        .trim();

      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.domain, cleanDomain))
        .limit(1);

      if (!company) {
        set.status = 404;
        return { error: "Company not found for domain" };
      }

      const [latestJob] = await db
        .select()
        .from(crawlJobs)
        .where(eq(crawlJobs.companyId, company.id))
        .orderBy(desc(crawlJobs.createdAt))
        .limit(1);

      const [latestSnapshot] = await db
        .select()
        .from(companySnapshots)
        .where(eq(companySnapshots.companyId, company.id))
        .orderBy(desc(companySnapshots.version))
        .limit(1);

      const [brand] = await db
        .select()
        .from(brands)
        .where(eq(brands.companyId, company.id))
        .limit(1);

      return {
        company,
        job: latestJob || null,
        snapshot: latestSnapshot || null,
        brand: brand ? { logoUrl: brand.logoUrl, tokens: brand.tokens } : null,
      };
    },
    {
      params: t.Object({
        domain: t.String(),
      }),
      detail: {
        summary: "Get domain crawl status",
        description: "Returns latest company, snapshot, and crawl job status for a domain.",
      },
    }
  )

  // 4. Real-time streaming crawl + parse + dedup + chunk + embed (Qdrant) pipeline
  .post(
    "/ingest",
    async function* ({ body, set }) {
      set.headers["content-type"] = "text/event-stream";
      set.headers["cache-control"] = "no-cache";
      set.headers["connection"] = "keep-alive";
      set.headers["access-control-allow-origin"] = "*";

      const {
        url: rawUrl,
        selectedUrls,
        select,
        fetchConcurrency,
        parseConcurrency,
        embedConcurrency,
        hostGapMs,
      } = body;

      let clean = rawUrl.trim();
      if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
        clean = `https://${clean}`;
      }

      const eventQueue = new AsyncEventQueue<{ event: string; data: any }>();

      // Keep-alive heartbeat interval (2s) so connection never times out during embedding or pauses
      const pingTimer = setInterval(() => {
        eventQueue.push({
          event: "ping",
          data: { ts: Date.now() },
        });
      }, 2000);

      // Initializing event
      eventQueue.push({
        event: "phase",
        data: { phase: "INITIALIZING", message: `Initializing pipeline for ${clean}...` },
      });

      // Launch in-process ingestion pipeline
      runIngestPipeline(clean, {
        selectedUrls: selectedUrls && selectedUrls.length > 0 ? selectedUrls : undefined,
        select: select || null,
        fetchConcurrency: fetchConcurrency || 25,
        parseConcurrency: parseConcurrency || 5,
        embedConcurrency: embedConcurrency || 3,
        hostGapMs: hostGapMs || 150,
        yes: true,
        onProgress: async (evt: PipelineProgressEvent) => {
          eventQueue.push({
            event: "progress",
            data: evt,
          });
        },
      })
        .then(async (result) => {
          clearInterval(pingTimer);

          // Fetch brand intelligence if available
          let brandData = null;
          try {
            const [brand] = await db
              .select()
              .from(brands)
              .where(eq(brands.companyId, result.companyId))
              .limit(1);
            if (brand) {
              brandData = { logoUrl: brand.logoUrl, tokens: brand.tokens };
            }
          } catch {
            // Non-blocking
          }

          eventQueue.push({
            event: "done",
            data: {
              ...result,
              brand: brandData,
            },
          });
          eventQueue.close();
        })
        .catch((err) => {
          clearInterval(pingTimer);
          logger.error(`[API:INGEST] Pipeline failure: ${err.message}`);
          eventQueue.push({
            event: "error",
            data: { message: err.message || String(err) },
          });
          eventQueue.close();
        });

      // Stream events back to client via SSE
      try {
        for await (const evt of eventQueue) {
          yield evt;
        }
      } finally {
        clearInterval(pingTimer);
      }
    },
    {
      body: t.Object({
        url: t.String(),
        selectedUrls: t.Optional(t.Array(t.String())),
        select: t.Optional(t.String()),
        fetchConcurrency: t.Optional(t.Number({ minimum: 1, maximum: 50 })),
        parseConcurrency: t.Optional(t.Number({ minimum: 1, maximum: 16 })),
        embedConcurrency: t.Optional(t.Number({ minimum: 1, maximum: 6 })),
        hostGapMs: t.Optional(t.Number({ minimum: 50, maximum: 1000 })),
      }),
      detail: {
        summary: "Stream Ingestion Pipeline",
        description:
          "High-concurrency crawl, deduplication, parsing, chunking, and Qdrant embedding streaming live progress via SSE.",
      },
    }
  );

