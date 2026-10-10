import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import type { CliOptions, DiscoveredPage } from "./types";
import { validateSafeUrl, inferCategory } from "@ag-ui/crawler";
import { discoverPages, printDiscovery } from "./discover";
import { parseSelection } from "./select";
import { crawlPages } from "./crawl";
import { populateDb } from "./populate";
import {
  db,
  companies,
  companySnapshots,
  crawlJobs,
  eq,
  desc,
} from "@ag-ui/database";
import { sha256 } from "./utils";

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
  userOpts?: Partial<CliOptions>
): Promise<IngestPipelineResult> {
  const tStart = Date.now();
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
      priority: 5,
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
  const selected = indices.map((i) => pages[i]).filter(Boolean);
  console.log(`[SELECT] ${selected.length}/${pages.length} pages selected (est. crawl ~${Math.ceil(selected.length / opts.fetchConcurrency)} waves x ~1-3s)`);

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
    let [existingComp] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
    if (!existingComp) {
      const [ins] = await db.insert(companies).values({ domain, name: companyName, url: (baseUrl as URL).origin }).returning();
      cId = ins.id;
      console.log(`[DB] created company ${companyName} (${cId})`);
    } else {
      cId = existingComp.id;
      console.log(`[DB] reusing company ${existingComp.name} (${cId})`);
    }

    // Generate selection hash & idempotency key per Task 2 / Task 3 / Section 0 contract
    const chunkerVersion = "chunker-v1:1800:250";
    const embedModelVersion = "text-embedding-3-small:1536";
    const sortedUrls = selected.map((p) => p.url).sort();
    const selectionInput = `${domain}\n${sortedUrls.join("\n")}\n${chunkerVersion}\n${embedModelVersion}`;
    const idempotencyKey = sha256(selectionInput);
    const selectionHash = sha256(`${domain}\n${sortedUrls.join("\n")}`);

    // Check crawl_jobs by idempotency key (Task 3)
    const [existingJob] = await db
      .select()
      .from(crawlJobs)
      .where(eq(crawlJobs.idempotencyKey, idempotencyKey))
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
      } else if (["QUEUED", "CRAWLING", "PROCESSING", "EMBEDDING"].includes(existingJob.status)) {
        console.log(`[IDEMPOTENCY HIT] Active crawl job ${existingJob.id} is currently ${existingJob.status}.`);
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

  // Phase 3: concurrent crawl + parse.
  const { docs, rootHtml, stats } = await crawlPages(
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
          skippedThin: progress.skippedThin ?? stats?.skippedThin ?? 0,
          totalSelected: selected.length,
        });
      } catch {
        // Non-blocking
      }
    }
  );
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

  const res = await populateDb(baseUrl as URL, domain, docs, rootHtml, opts, stats, jobContext);

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
