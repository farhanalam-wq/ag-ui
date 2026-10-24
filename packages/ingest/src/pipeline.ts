import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CliOptions, DiscoveredPage } from "./types";
import { validateSafeUrl, inferCategory, calculatePriority } from "@ag-ui/crawler";
import { discoverPages, printDiscovery } from "./discover";
import { applyMaxPages, parseSelection } from "./select";
import { crawlPages } from "./crawl";
import { populateDb } from "./populate";
import {
  db,
  companies,
  companySnapshots,
  crawlJobs,
  eq,
  and,
  desc,
  inArray,
  isUuid,
  resolveOwnedCompanyByDomain,
  recordError,
} from "@ag-ui/database";
import { sha256 } from "./utils";

/**
 * Task 6 — fatal pipeline failure with a process exit code. The CLI maps this
 * to process.exit(exitCode); API callers surface it as an SSE error event.
 */
export class PipelineExitError extends Error {
  exitCode: number;
  constructor(message: string, exitCode: number) {
    super(message);
    this.name = "PipelineExitError";
    this.exitCode = exitCode;
  }
}

/** Task 6 — job statuses that count as live for the concurrency cap. */
export const LIVE_JOB_STATUSES = ["QUEUED", "DISCOVERING", "CRAWLING", "PARSING", "EMBEDDING"];

/** Terminal statuses — a job already here must never be overwritten by a failure path. */
const TERMINAL_JOB_STATUSES = ["READY", "FAILED", "CANCELLED"];

/**
 * Best-effort failure marker: flips a live job + snapshot to FAILED with the
 * real cause in error_sample. Never throws — progress/failure paths stay
 * non-fatal to the marking itself. Skips jobs that already reached terminal.
 */
async function markJobFailed(
  crawlJobId: string,
  snapshotId: string | null,
  errorSample: unknown,
  failure: { message: string; stack?: string }
): Promise<void> {
  let jobCompanyId: string | null = null;
  try {
    const [current] = await db
      .select({ status: crawlJobs.status, companyId: crawlJobs.companyId })
      .from(crawlJobs)
      .where(eq(crawlJobs.id, crawlJobId))
      .limit(1);
    jobCompanyId = current?.companyId ?? null;
    if (current && !TERMINAL_JOB_STATUSES.includes(current.status)) {
      await db
        .update(crawlJobs)
        .set({ status: "FAILED", errorSample: errorSample as any, updatedAt: new Date() })
        .where(eq(crawlJobs.id, crawlJobId));
    }
  } catch {
    // Non-blocking
  }
  if (snapshotId) {
    try {
      const [snap] = await db
        .select({ status: companySnapshots.status })
        .from(companySnapshots)
        .where(eq(companySnapshots.id, snapshotId))
        .limit(1);
      if (snap && !TERMINAL_JOB_STATUSES.includes(snap.status)) {
        await db
          .update(companySnapshots)
          .set({ status: "FAILED" })
          .where(eq(companySnapshots.id, snapshotId));
      }
    } catch {
      // Non-blocking
    }
  }

  // Single pipeline sink. The crawler route's `.catch` turns the same throw into
  // an SSE error, so instrumenting it as well would double-record. Record even
  // when the job is already terminal: populateDb flips it to FAILED before
  // throwing, and a terminal guard here would drop embedding/chunk failures.
  const message =
    failure.message.trim() || lastErrorSampleMessage(errorSample) || "Ingestion failed";
  // Await so short-lived CLI failures flush before the process exits. `recordError`
  // is total, so this cannot change the failure outcome.
  await recordError({
    source: "crawler",
    message,
    stack: failure.stack,
    context: {
      jobId: crawlJobId,
      companyId: jobCompanyId,
      snapshotId,
      stage: "ingest",
    },
    companyId: jobCompanyId,
  });
}

/** Last non-empty `error` string in an error_sample payload, if any. */
function lastErrorSampleMessage(sample: unknown): string | null {
  if (!Array.isArray(sample)) return null;
  for (let i = sample.length - 1; i >= 0; i--) {
    const entry = sample[i];
    if (entry && typeof entry === "object" && typeof (entry as any).error === "string") {
      const msg = (entry as any).error.trim();
      if (msg) return msg;
    }
  }
  return null;
}

/** One-line summary of the first few dead letters for error messages. */
function summarizeDeadLetters(deadLetters: any[], max = 3): string {
  return (deadLetters ?? []).slice(0, max).map((f: any) => {
    const st = f.status !== null && f.status !== undefined ? `HTTP ${f.status}` : "NET";
    return `${f.url} (${st}, attempts=${f.attempts}): ${f.error}`;
  }).join(" | ");
}

export interface IngestPipelineResult {
  companyId: string;
  companyName: string;
  domain: string;
  snapshotId: string;
  version: number;
  insertedDocs: number;
  chunkCount: number;
  factCount: number;
  timings: {
    discoveryMs: number;
    crawlMs: number;
    dbMs: number;
    totalMs: number;
  };
}

export async function runIngestPipeline(
  urlInput: string,
  ownerId: string,
  userOpts?: Partial<CliOptions>
): Promise<IngestPipelineResult> {
  const tStart = Date.now();

  // The owner is the session user, supplied by the route (never the request
  // body). A missing owner is a hard error: no unowned company may be created.
  if (!isUuid(ownerId)) {
    throw new PipelineExitError(
      "[AUTH] ownerId must be a user uuid (docs/auth-tenancy.md §12.1)",
      1
    );
  }

  let target = urlInput.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) target = "https://" + target;

  const defaultOpts: CliOptions = {
    url: target,
    discoverOnly: false,
    limit: null,
    all: false,
    yes: false,
    select: null,
    fetchConcurrency: 25,
    parseConcurrency: 5,
    embedConcurrency: 3,
    hostGapMs: 150,
    maxPages: 1000,
    maxConcurrentJobs: 1,
    maxSitemapUrls: 2000,
    maxSitemaps: 10,
    timeoutMs: 10000,
    usePlaywright: false,
    skipEmbed: false,
    dryRun: false,
    noEmbedCache: false,
    withBrand: false,
  };

  const opts: CliOptions = { ...defaultOpts, ...userOpts };

  // SSRF gate once (DNS-checked). Page fetches below stay same-host without per-URL DNS for scale.
  const baseUrl = await validateSafeUrl(target).catch((e: any) => {
    throw new Error(`[SSRF] blocked: ${e.message}`);
  });
  const domain = (baseUrl as URL).hostname.replace(/^www\./, "");
  console.log(`[INGEST] target=${(baseUrl as URL).origin} domain=${domain} fetch=${opts.fetchConcurrency} parse=${opts.parseConcurrency} embed=${opts.embedConcurrency} hostgap=${opts.hostGapMs}ms${opts.usePlaywright ? " +playwright" : ""}`);

  // Phase 1: discover.
  let pages: DiscoveredPage[];
  let info: any;

  if (opts.selectedUrls && opts.selectedUrls.length > 0) {
    pages = opts.selectedUrls.map((u) => ({
      url: u,
      category: inferCategory(u, ""),
      priority: calculatePriority(u),
      source: "sitemap" as const,
      depth: 1,
    }));
    info = {
      domain,
      totalUrls: pages.length,
      durationMs: 0,
      hasLlmsTxt: false,
      hasLlmsFull: false,
      robotsSitemaps: 0,
      sitemapsFollowed: [],
      byCategory: {},
      bySource: {},
      ms: 0,
    };
    console.log(`[INGEST] using ${pages.length} pre-selected URLs from client (skipping redundant discovery)`);
  } else {
    const res = await discoverPages(baseUrl as URL, opts);
    pages = res.pages;
    info = res.info;
    if (pages.length === 0) {
      throw new Error("[DISCOVERY] no crawlable URLs found — aborting.");
    }
    printDiscovery(pages, info, domain);
  }

  if (opts.discoverOnly) {
    const n = opts.limit ?? pages.length;
    console.log(`[DISCOVER-ONLY] top ${Math.min(n, pages.length)}:`);
    pages.slice(0, n).forEach((p, i) => console.log(`  ${i + 1}. [${p.category}] ${p.url}`));
    return {
      companyId: "",
      companyName: domain.split(".")[0].toUpperCase(),
      domain,
      snapshotId: "",
      version: 0,
      insertedDocs: 0,
      chunkCount: 0,
      factCount: 0,
      timings: { discoveryMs: info.ms, crawlMs: 0, dbMs: 0, totalMs: Date.now() - tStart },
    };
  }

  // Phase 2: select.
  let indices: number[];
  if (opts.selectedUrls && opts.selectedUrls.length > 0) {
    indices = pages.map((_, i) => i);
  } else if (opts.select) {
    indices = parseSelection(opts.select, pages.length);
  } else if (opts.all) {
    indices = pages.map((_, i) => i);
  } else if (opts.limit !== null) {
    indices = pages.slice(0, opts.limit).map((_, i) => i);
  } else {
    const rl = readline.createInterface({ input, output });
    const ans = await rl.question(`Select pages to ingest: 'all' | N (e.g. 5, 20) | ranges (e.g. 1-20,35) [default 20]: `);
    rl.close();
    const cleanAns = ans.trim() === "" ? "20" : ans.trim();
    indices = parseSelection(cleanAns, pages.length);
  }
  if (indices.length === 0) {
    throw new Error("[SELECT] empty selection — aborting.");
  }
  let selected = indices.map((i) => pages[i]).filter(Boolean);
  console.log(`[SELECT] ${selected.length}/${pages.length} pages selected (est. crawl ~${Math.ceil(selected.length / opts.fetchConcurrency)} waves x ~1-3s)`);

  // Task 6 — max_pages ceiling: keep highest-priority URLs, cut the long tail.
  const { kept, truncated } = applyMaxPages(selected, opts.maxPages);
  if (truncated > 0) {
    console.log(`[SELECT] truncated ${truncated} urls to max_pages=${opts.maxPages} (kept highest priority)`);
    selected = kept;
  }

  if (!opts.yes && opts.limit === null && !opts.all && !opts.select && (!opts.selectedUrls || opts.selectedUrls.length === 0)) {
    const rl2 = readline.createInterface({ input, output });
    const c = await rl2.question(`Crawl ${selected.length} pages (fetch ${opts.fetchConcurrency}, parse ${opts.parseConcurrency}, embed ${opts.embedConcurrency})? [Y/n]: `);
    rl2.close();
    if (c.trim().toLowerCase() === "n" || c.trim().toLowerCase() === "no") {
      throw new Error("Ingestion aborted by user.");
    }
  }

  // Pre-initialize Company, Snapshot, and CrawlJob when not dry-run
  let jobContext: { companyId: string; snapshotId: string; crawlJobId: string; version: number } | undefined;
  const companyName = domain.split(".")[0].toUpperCase();
  let cId = "";
  let snapVersion = 1;

  if (!opts.dryRun) {
    // Task 6 — max_concurrent_jobs: refuse when this owner's live jobs are at
    // the cap. Scoped to the owner so one tenant cannot block another, and the
    // error never names another tenant's job ids.
    const liveJobs = await db
      .select({ id: crawlJobs.id, status: crawlJobs.status })
      .from(crawlJobs)
      .innerJoin(companies, eq(companies.id, crawlJobs.companyId))
      .where(
        and(
          inArray(crawlJobs.status, LIVE_JOB_STATUSES),
          eq(companies.ownerId, ownerId)
        )
      );
    if (liveJobs.length >= opts.maxConcurrentJobs) {
      const ids = liveJobs.map((j) => `${j.id} (${j.status})`).join(", ");
      throw new PipelineExitError(
        `[JOBS] ${liveJobs.length} live crawl job(s) at cap (max_concurrent_jobs=${opts.maxConcurrentJobs}): ${ids}. Wait or cancel before starting a new ingest.`,
        3
      );
    }

    // Find-or-create this owner's company. Domains are unique per owner, never
    // globally (docs/auth-tenancy.md §5.1, §12.1).
    const existingComp = await resolveOwnedCompanyByDomain(ownerId, domain);
    if (!existingComp) {
      const [ins] = await db
        .insert(companies)
        .values({ ownerId, domain, name: companyName, url: (baseUrl as URL).origin })
        .returning();
      cId = ins.id;
      console.log(`[DB] created company ${companyName} (${cId})`);
    } else {
      cId = existingComp.id;
      console.log(`[DB] reusing company ${existingComp.name} (${cId})`);
    }

    // Generate selection hash & idempotency key per Task 2 / Task 3 / Section 0
    // contract. Both include owner + company so identical selections under two
    // tenants never collide (docs/auth-tenancy.md §12.1).
    const chunkerVersion = "chunker-v1:1800:250";
    const embedModelVersion = "text-embedding-3-small:1536";
    const sortedUrls = selected.map((p) => p.url).sort();
    const selectionInput = `${ownerId}\n${cId}\n${sortedUrls.join("\n")}\n${chunkerVersion}\n${embedModelVersion}`;
    const idempotencyKey = sha256(selectionInput);
    const selectionHash = sha256(`${ownerId}\n${cId}\n${sortedUrls.join("\n")}`);

    // Check crawl_jobs by (company, idempotency key) (Task 3).
    const [existingJob] = await db
      .select()
      .from(crawlJobs)
      .where(
        and(
          eq(crawlJobs.companyId, cId),
          eq(crawlJobs.idempotencyKey, idempotencyKey)
        )
      )
      .limit(1);

    if (existingJob) {
      if (existingJob.status === "READY") {
        console.log(`[IDEMPOTENCY HIT] Identical crawl job already completed: ${existingJob.id}`);
        console.log(`  company=${cId} snapshot=${existingJob.snapshotId} docs=${existingJob.docs} crawled=${existingJob.crawled}`);
        console.log(`Reusing existing indexed knowledge base.`);
        return {
          companyId: cId,
          companyName,
          domain,
          snapshotId: existingJob.snapshotId ?? "",
          version: snapVersion,
          insertedDocs: existingJob.docs,
          chunkCount: 0,
          factCount: 0,
          timings: {
            discoveryMs: info.ms,
            crawlMs: 0,
            dbMs: 0,
            totalMs: Date.now() - tStart,
          },
        };
      } else if (LIVE_JOB_STATUSES.includes(existingJob.status)) {
        throw new PipelineExitError(
          `[IDEMPOTENCY HIT] Active crawl job ${existingJob.id} is currently ${existingJob.status} for the identical selection. Wait for it or cancel it before resubmitting.`,
          2
        );
      } else {
        console.log(`[IDEMPOTENCY] Previous job ${existingJob.id} was ${existingJob.status}. Removing stale record to retry...`);
        await db.delete(crawlJobs).where(eq(crawlJobs.id, existingJob.id));
      }
    }

    const [latestSnap] = await db
      .select()
      .from(companySnapshots)
      .where(eq(companySnapshots.companyId, cId))
      .orderBy(desc(companySnapshots.version))
      .limit(1);
    snapVersion = (latestSnap?.version ?? 0) + 1;
    const [snap] = await db
      .insert(companySnapshots)
      .values({ companyId: cId, version: snapVersion, status: "CRAWLING", pageCount: selected.length })
      .returning();

    const [job] = await db
      .insert(crawlJobs)
      .values({
        companyId: cId,
        snapshotId: snap.id,
        selectionHash,
        idempotencyKey,
        status: "CRAWLING",
        selected: selected.length,
        crawled: 0,
        docs: 0,
        failed: 0,
        priority: 0,
      })
      .returning();

    jobContext = { companyId: cId, snapshotId: snap.id, crawlJobId: job.id, version: snapVersion };
    console.log(`[DB] crawl_job initialized: ${job.id} (snapshot v${snapVersion})`);

    try {
      await opts.onProgress?.({
        stage: "CRAWLING",
        jobId: job.id,
        companyId: cId,
        snapshotId: snap.id,
        crawled: 0,
        docs: 0,
        failed: 0,
        skippedThin: 0,
        totalSelected: selected.length,
        message: `Crawl job registered: ${job.id}`,
      });
    } catch {
      // Non-blocking
    }
  }

  // Phase 3: concurrent crawl + parse. Any throw below must strand nothing:
  // the job + snapshot flip to FAILED with the real cause (previously a
  // crash here left a live PARSING row blocking the cap forever).
  let docs: Awaited<ReturnType<typeof crawlPages>>["docs"];
  let rootHtml: string | null;
  let stats: Record<string, any>;
  try {
    ({ docs, rootHtml, stats } = await crawlPages(
      selected,
      baseUrl as URL,
      opts,
      async (progress) => {
        if (jobContext) {
          try {
            const updateData: any = {
              crawled: progress.crawled,
              docs: progress.docs,
              failed: progress.failed,
              updatedAt: new Date(),
            };
            if (progress.stage) updateData.status = progress.stage;
            await db.update(crawlJobs).set(updateData).where(eq(crawlJobs.id, jobContext.crawlJobId));
          } catch {
            // Non-blocking progress update
          }
        }
        try {
          await opts.onProgress?.({
            stage: (progress.stage as any) || "CRAWLING",
            jobId: jobContext?.crawlJobId,
            companyId: jobContext?.companyId,
            snapshotId: jobContext?.snapshotId,
            crawled: progress.crawled,
            docs: progress.docs,
            failed: progress.failed,
            skippedThin: progress.skippedThin ?? 0,
            totalSelected: selected.length,
          });
        } catch {
          // Non-blocking
        }
      }
    ));
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (jobContext) {
      await markJobFailed(
        jobContext.crawlJobId,
        jobContext.snapshotId,
        [{ stage: "crawl", error: message }],
        { message, stack: err?.stack }
      );
    }
    throw err;
  }
  const elapsedCrawl = ((stats.ms as number) / 1000).toFixed(1);
  const pps = (docs.length / Math.max(0.5, (stats.ms as number) / 1000)).toFixed(1);
  console.log(`[CRAWL] done: docs=${docs.length} failed=${stats.failed} retries=${stats.retries} http=${stats.httpCount} playwright=${stats.pwCount} thin/dup=${stats.skippedThin} in ${elapsedCrawl}s (${pps} docs/s)`);
  if (stats.deadLetters && stats.deadLetters.length > 0) {
    console.log(`[CRAWL] dead-letter failures (${stats.failed} total, showing ${Math.min(10, stats.deadLetters.length)}):`);
    for (const f of stats.deadLetters.slice(0, 10)) {
      const st = f.status !== null && f.status !== undefined ? `HTTP ${f.status}` : "NET";
      console.log(`  - [${f.stage}] ${f.url} (${st}, attempts=${f.attempts}): ${f.error}`);
    }
  }
  if (opts.dryRun || docs.length === 0) {
    if (!opts.dryRun && docs.length === 0 && jobContext) {
      // Every page dead-lettered (WAF/403, JS shell, timeouts). Fail loudly
      // with the real per-page causes instead of stranding a live row that
      // blocks the concurrency cap on the next attempt.
      const sample = summarizeDeadLetters(stats.deadLetters);
      const failureMessage =
        `[CRAWL] all ${selected.length} pages failed, 0 docs kept. ` +
        `Top failures: ${sample || "unknown"}. ` +
        `Full list in crawl_jobs.error_sample.`;
      await markJobFailed(
        jobContext.crawlJobId,
        jobContext.snapshotId,
        (stats.deadLetters ?? []).slice(0, 200),
        { message: failureMessage }
      );
      throw new Error(failureMessage);
    }
    console.log(`[DRY] ${opts.dryRun ? "--dry-run: skipping DB." : "no docs: skipping DB."} Top docs:`);
    docs.slice(0, 5).forEach((d, i) => console.log(`  ${i + 1}. [${d.category}] ${d.title} (${d.content.length} chars) ${d.url}`));
    return {
      companyId: cId,
      companyName,
      domain,
      snapshotId: jobContext?.snapshotId ?? "",
      version: snapVersion,
      insertedDocs: docs.length,
      chunkCount: 0,
      factCount: 0,
      timings: { discoveryMs: info.ms, crawlMs: stats.ms as number, dbMs: 0, totalMs: Date.now() - tStart },
    };
  }

  // Phase 4: populate DB (chunk → embed → facts).
  try {
    await opts.onProgress?.({
      stage: "EMBEDDING",
      docs: docs.length,
      failed: stats.failed,
      skippedThin: stats.skippedThin,
      totalSelected: selected.length,
    });
  } catch {}

  // Phase 4: populate DB (chunk → embed → facts). populateDb marks FAILED on
  // its known error branches; this catch covers anything unexpected so no
  // throw path leaves a live row behind.
  let res: Awaited<ReturnType<typeof populateDb>>;
  try {
    res = await populateDb(baseUrl as URL, domain, docs, rootHtml, opts, stats, ownerId, jobContext);
  } catch (err: any) {
    const message = String(err?.message ?? err);
    if (jobContext) {
      await markJobFailed(
        jobContext.crawlJobId,
        jobContext.snapshotId,
        [
          ...(stats.deadLetters ?? []).slice(0, 199),
          { stage: "populate", error: message },
        ],
        { message, stack: err?.stack }
      );
    }
    throw err;
  }

  if (opts.withBrand && res.companyId && res.snapshotId) {
    try {
      await opts.onProgress?.({
        stage: "EXTRACTING_APPEARANCE",
        companyId: res.companyId,
        snapshotId: res.snapshotId,
        message: "Queuing brand appearance extraction...",
      });
    } catch {}
    try {
      const { brandQueue } = await import("@ag-ui/queues");
      let origin = (baseUrl as URL).origin;
      try {
        origin = new URL(target).origin;
      } catch {
        // keep baseUrl origin
      }
      await brandQueue.add(
        "extract",
        { companyId: res.companyId, snapshotId: res.snapshotId, origin },
        { removeOnComplete: true }
      );
      console.log(`[BRAND] appearance extraction queued for ${origin}`);
    } catch (err: any) {
      console.log(`[BRAND] queue unavailable, skipping appearance extraction: ${err?.message ?? err}`);
    }
  }

  try {
    await opts.onProgress?.({
      stage: "READY",
      docs: res.insertedDocs,
      chunks: res.chunkCount,
      facts: res.factCount,
      totalSelected: selected.length,
    });
  } catch {}
  const total = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\n==============================================`);
  console.log(`INGEST COMPLETE  domain=${domain} total=${total}s`);
  console.log(`  company=${res.companyId} snapshot=${res.snapshotId} v${res.version}`);
  console.log(`  discovered=${pages.length} selected=${selected.length} docs=${res.insertedDocs} chunks=${res.chunkCount} facts=${res.factCount}`);
  console.log(`  crawl=${elapsedCrawl}s (${pps} docs/s) db=${(res.ms / 1000).toFixed(1)}s`);
  console.log(`==============================================`);

  return {
    companyId: res.companyId,
    companyName,
    domain,
    snapshotId: res.snapshotId,
    version: res.version,
    insertedDocs: res.insertedDocs,
    chunkCount: res.chunkCount,
    factCount: res.factCount,
    timings: {
      discoveryMs: info.ms,
      crawlMs: stats.ms as number,
      dbMs: res.ms,
      totalMs: Date.now() - tStart,
    },
  };
}
