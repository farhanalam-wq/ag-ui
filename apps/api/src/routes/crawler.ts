import { Elysia, t } from "elysia";
import { validateSafeUrl } from "@ag-ui/crawler";
import { discoverPages } from "@ag-ui/crawler";
import {
  buildManualDiscovery,
  fetchChildSitemaps,
  fetchSitemapUrlWithRecursion,
  parseSitemapBufferWithMeta,
  type ManualDiscoveryInput,
} from "@ag-ui/crawler";
import { logger } from "@ag-ui/shared";
import { db, brands, companies, companySnapshots, crawlJobs, eq, desc } from "@ag-ui/database";
import { brandQueue } from "@ag-ui/queues";
import { runIngestPipeline, type PipelineProgressEvent } from "@ag-ui/ingest";

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

  // 1b. Manual sitemap + URL list discovery (Task 19): uploaded .xml/.xml.gz
  // files, a pasted sitemap URL fetched server-side, and/or a pasted manual
  // URL list. Returns the standard DiscoveryResponse so selection + ingest
  // work unchanged. Read-only: no DB writes.
  .post(
    "/discover-sitemap",
    async ({ body, set }) => {
      const MAX_SITEMAP_FILES = 3;
      const MAX_SITEMAP_FILE_BYTES = 5 * 1024 * 1024;

      const rawFiles =
        body.files === undefined ? [] : Array.isArray(body.files) ? body.files : [body.files];
      const sitemapUrl = (body.sitemapUrl || "").trim();
      const manualUrls = body.manualUrls || "";
      const hasManualLines = manualUrls
        .split(/\r?\n/)
        .some((l) => l.trim().length > 0);

      if (rawFiles.length === 0 && !sitemapUrl && !hasManualLines) {
        set.status = 400;
        return { error: "No input provided: upload a sitemap file, paste a sitemap URL, or list URLs" };
      }
      if (rawFiles.length > MAX_SITEMAP_FILES) {
        set.status = 400;
        return { error: `Upload between 1 and ${MAX_SITEMAP_FILES} sitemap files` };
      }

      let maxUrls = 2000;
      if (body.maxSitemapUrls !== undefined) {
        const parsed =
          typeof body.maxSitemapUrls === "string"
            ? parseInt(body.maxSitemapUrls, 10)
            : body.maxSitemapUrls;
        if (Number.isFinite(parsed)) {
          maxUrls = Math.min(5000, Math.max(10, parsed));
        }
      }

      const merged: ManualDiscoveryInput[] = [];
      let firstError: string | null = null;

      // (a) Uploaded files, in order.
      for (const file of rawFiles) {
        const name = file.name || "sitemap.xml";
        const lower = name.toLowerCase();
        if (!lower.endsWith(".xml") && !lower.endsWith(".xml.gz")) {
          firstError ??= `File "${name}" rejected: only .xml or .xml.gz accepted`;
          continue;
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        if (buffer.length === 0) {
          firstError ??= `File "${name}" is empty`;
          continue;
        }
        if (buffer.length > MAX_SITEMAP_FILE_BYTES) {
          set.status = 400;
          return { error: `File "${name}" exceeds the 5MB limit` };
        }
        try {
          const { entries, isIndex } = parseSitemapBufferWithMeta(buffer, name);
          if (isIndex) {
            // Uploaded sitemapindex: children live on the web, fetch one
            // level like the pasted-URL path. Non-xml locs (if any) are kept
            // as page entries.
            const pageLocs = entries.filter((e) => !/\.xml(\?|#|$)/i.test(e.url));
            for (const e of pageLocs) {
              merged.push({ url: e.url, priority: e.priority, source: "sitemap" });
            }
            const childUrls = entries
              .filter((e) => /\.xml(\?|#|$)/i.test(e.url))
              .map((e) => e.url);
            for (const e of await fetchChildSitemaps(childUrls, maxUrls)) {
              merged.push({ url: e.url, priority: e.priority, source: "sitemap" });
            }
            if (pageLocs.length === 0 && childUrls.length === 0) {
              firstError ??= `File "${name}" contains no URLs`;
            }
          } else {
            for (const e of entries) {
              merged.push({ url: e.url, priority: e.priority, source: "sitemap" });
            }
          }
        } catch (err: any) {
          firstError ??= err?.message || `File "${name}" could not be parsed`;
        }
      }

      // (b) Pasted sitemap URL, fetched server-side (SSRF-checked like /discover).
      if (sitemapUrl) {
        let clean = sitemapUrl;
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
          clean = `https://${clean}`;
        }
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(clean);
          if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            set.status = 400;
            return { error: "Sitemap URL must use http or https protocol" };
          }
        } catch {
          set.status = 400;
          return { error: "Invalid sitemap URL provided" };
        }
        try {
          await validateSafeUrl(parsedUrl.toString());
        } catch (err: any) {
          set.status = 403;
          return {
            error: "SSRF validation failed: Target IP or domain is not permitted",
            details: err.message,
          };
        }
        try {
          const fetched = await fetchSitemapUrlWithRecursion(parsedUrl.toString(), maxUrls);
          for (const e of fetched) {
            merged.push({ url: e.url, priority: e.priority, source: "sitemap" });
          }
        } catch (err: any) {
          firstError ??= `Sitemap URL fetch failed: ${err.message}`;
        }
      }

      // (c) Pasted manual URL list, one per line. Absolute http(s) lines are
      // passed raw so buildManualDiscovery can count cross-host drops;
      // garbage lines are skipped silently here.
      const manualLines = manualUrls
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      for (const line of manualLines) {
        if (!/^https?:\/\//i.test(line)) continue;
        try {
          new URL(line);
        } catch {
          continue;
        }
        merged.push({ url: line, source: "manual" });
      }

      // Primary domain: first valid absolute URL in source order.
      let primaryBase: URL | null = null;
      for (const e of merged) {
        try {
          const u = new URL(e.url.trim());
          if (u.protocol === "http:" || u.protocol === "https:") {
            primaryBase = u;
            break;
          }
        } catch {
          continue;
        }
      }
      if (!primaryBase) {
        set.status = 400;
        return { error: firstError || "No valid URLs found in the provided input" };
      }

      try {
        const { pages, info, droppedCrossDomain } = await buildManualDiscovery(
          merged,
          primaryBase,
          { maxUrls }
        );
        if (pages.length === 0) {
          set.status = 400;
          return { error: firstError || "No valid URLs found in the provided input" };
        }
        logger.info(
          `[API:DISCOVERY:SITEMAP] Manual discovery for ${info.domain}: ${pages.length} urls, ${droppedCrossDomain} cross-domain dropped`
        );
        return {
          success: true,
          domain: info.domain,
          origin: primaryBase.origin,
          pages,
          info,
          droppedCrossDomain,
        };
      } catch (err: any) {
        logger.error(`[API:DISCOVERY:SITEMAP] Manual discovery failed: ${err.message}`);
        set.status = 500;
        return { error: "Discovery failed", details: err.message };
      }
    },
    {
      body: t.Object({
        files: t.Optional(t.Files()),
        sitemapUrl: t.Optional(t.String()),
        manualUrls: t.Optional(t.String()),
        maxSitemapUrls: t.Optional(t.Union([t.String(), t.Number()])),
      }),
      detail: {
        summary: "Discover URLs from sitemaps or manual list",
        description:
          "Accepts uploaded sitemap files, a pasted sitemap URL, and/or a manual URL list. Returns the standard DiscoveryResponse.",
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

  // 3b. Cancel a live crawl job — frees the concurrency cap immediately.
  .post(
    "/jobs/:id/cancel",
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

      const terminal = ["READY", "FAILED", "CANCELLED"];
      if (terminal.includes(job.status)) {
        return { job, cancelled: false, message: `Job already ${job.status}` };
      }

      const [updated] = await db
        .update(crawlJobs)
        .set({
          status: "CANCELLED",
          errorSample: { operator: "cancelled via POST /api/crawler/jobs/:id/cancel" } as any,
          updatedAt: new Date(),
        })
        .where(eq(crawlJobs.id, job.id))
        .returning();

      if (job.snapshotId) {
        try {
          await db
            .update(companySnapshots)
            .set({ status: "CANCELLED" })
            .where(eq(companySnapshots.id, job.snapshotId));
        } catch {
          // Non-blocking
        }
      }

      logger.info(`[API:CANCEL] Crawl job ${job.id} (${job.status} -> CANCELLED)`);
      return { job: updated, cancelled: true };
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Cancel a crawl job",
        description: "Marks a live crawl job and its snapshot CANCELLED, freeing the concurrency cap.",
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
        maxPages,
        maxConcurrentJobs,
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
        maxPages: maxPages || 1000,
        maxConcurrentJobs: maxConcurrentJobs || 1,
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

          // Fire-and-forget brand appearance extraction (non-blocking for response).
          if (result.companyId && result.snapshotId) {
            let origin = clean;
            try {
              origin = new URL(clean).origin;
            } catch {
              // keep raw input
            }
            try {
              await brandQueue.add(
                "extract",
                { companyId: result.companyId, snapshotId: result.snapshotId, origin },
                { removeOnComplete: true }
              );
            } catch (err: any) {
              logger.warn(`[API:INGEST] brand enqueue skipped: ${err?.message ?? err}`);
            }
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
        maxPages: t.Optional(t.Number({ minimum: 1, maximum: 5000 })),
        maxConcurrentJobs: t.Optional(t.Number({ minimum: 1, maximum: 2 })),
      }),
      detail: {
        summary: "Stream Ingestion Pipeline",
        description:
          "High-concurrency crawl, deduplication, parsing, chunking, and Qdrant embedding streaming live progress via SSE.",
      },
    }
  );

