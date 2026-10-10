import type {
  CliOptions,
  CrawledDoc,
  CrawlProgress,
  DeadLetterEntry,
  DiscoveredPage,
  RawFetchedPage,
} from "./types";
import { AsyncBoundedQueue } from "./queue";
import { fetchWithRetry, FetchTerminalError, shortErr, waitForHostGap } from "./fetch";
import { extractCleanContent } from "@ag-ui/crawler";
import { sha256 } from "./utils";

function isShell(html: string): boolean {
  const l = html.toLowerCase();
  return (
    (l.includes('<div id="root"></div>') || l.includes('<div id="__next"></div>') || l.includes('<div id="app"></div>')) &&
    html.length < 2500
  );
}

// Singleton browser for --playwright fallback (avoids launch-per-page cost).
let _browser: any = null;
async function fetchViaPlaywrightReuse(url: string, timeoutMs: number): Promise<{ html: string; status: number }> {
  const { chromium } = await import("playwright");
  if (!_browser) {
    _browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
  }
  const ctx = await _browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  try {
    const page = await ctx.newPage();
    await page.route("**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,mp4,mp3}", (r: any) => r.abort());
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(800);
    const html = await page.content();
    return { html, status: resp ? resp.status() : 200 };
  } finally {
    await ctx.close().catch(() => {});
  }
}
async function closeBrowser() {
  try {
    await _browser?.close();
  } catch {
    // ignore
  }
  _browser = null;
}

export async function crawlPages(
  selected: DiscoveredPage[],
  baseUrl: URL,
  opts: CliOptions,
  onProgress?: (progress: CrawlProgress) => Promise<void> | void
): Promise<{ docs: CrawledDoc[]; rootHtml: string | null; stats: Record<string, any> }> {
  const t0 = Date.now();
  const seenHash = new Set<string>();
  const docs: CrawledDoc[] = [];
  const deadLetters: DeadLetterEntry[] = [];
  let rootHtml: string | null = null;
  let httpCount = 0;
  let pwCount = 0;
  let skippedThin = 0;
  let retriedCount = 0;
  let fetchedCount = 0;
  let parsedCount = 0;

  const sameHost = (u: string) => {
    try {
      const x = new URL(u);
      const b = baseUrl.hostname.replace(/^www\./, "");
      const t = x.hostname.replace(/^www\./, "");
      return t === b || t.endsWith("." + b);
    } catch {
      return false;
    }
  };

  const queue = new AsyncBoundedQueue<RawFetchedPage>(200);

  console.log(`[CRAWL] starting ${selected.length} pages (fetch width ${opts.fetchConcurrency}, parse width ${opts.parseConcurrency})`);

  let lastProgressEmit = 0;
  let progressTimer: any = null;

  const notifyProgress = (stage: string = "CRAWLING", immediate = false) => {
    process.stdout.write(
      `\r[CRAWL] fetched=${fetchedCount}/${selected.length} parsed=${parsedCount} docs=${docs.length} thin/dup=${skippedThin} dead=${deadLetters.length} queue=${queue.size}`
    );

    const fire = () => {
      lastProgressEmit = Date.now();
      onProgress?.({
        crawled: fetchedCount,
        docs: docs.length,
        failed: deadLetters.length,
        skippedThin,
        stage,
      });
    };

    const now = Date.now();
    if (immediate || now - lastProgressEmit >= 40 || fetchedCount === selected.length) {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
      fire();
    } else if (!progressTimer) {
      progressTimer = setTimeout(() => {
        progressTimer = null;
        fire();
      }, 40);
    }
  };

  // Stage A: Fetch workers (fetchConcurrency)
  let fetchCursor = 0;
  const fetchWorkerCount = Math.min(opts.fetchConcurrency, Math.max(1, selected.length));
  const fetchWorkers = Array.from({ length: fetchWorkerCount }, async () => {
    while (true) {
      const idx = fetchCursor++;
      if (idx >= selected.length) break;
      const p = selected[idx];

      if (!sameHost(p.url)) {
        deadLetters.push({
          url: p.url,
          stage: "fetch",
          status: null,
          error: "cross-host skip (non-retryable)",
          attempts: 0,
        });
        fetchedCount++;
        notifyProgress("CRAWLING");
        continue;
      }

      let html = "";
      let status = 0;
      let tier: CrawledDoc["tier"] = "http";
      let attempts = 0;

      const attemptPlaywright = async (timeout: number) => {
        await waitForHostGap(new URL(p.url).hostname, opts.hostGapMs);
        const r = await fetchViaPlaywrightReuse(p.url, timeout);
        attempts++;
        pwCount++;
        return r;
      };

      try {
        const r = await fetchWithRetry(p.url, {
          timeoutMs: opts.timeoutMs,
          hostGapMs: opts.hostGapMs,
          onRetry: () => {
            retriedCount++;
          },
        });
        html = r.html;
        status = r.status;
        attempts = r.attempts;
      } catch (err: any) {
        const terminal = err instanceof FetchTerminalError ? err : null;
        attempts = terminal?.attempts ?? attempts;
        const noPwFallback =
          !opts.usePlaywright ||
          (terminal !== null &&
            terminal.kind === "status-terminal" &&
            terminal.status !== null &&
            terminal.status < 500);

        if (noPwFallback) {
          deadLetters.push({
            url: p.url,
            stage: "fetch",
            status: terminal?.status ?? null,
            error: terminal?.message ?? shortErr(err),
            attempts,
          });
          fetchedCount++;
          notifyProgress("CRAWLING");
          continue;
        }

        try {
          const r = await attemptPlaywright(Math.min(15000, opts.timeoutMs + 5000));
          html = r.html;
          status = r.status;
          tier = "playwright";
        } catch (pwErr: any) {
          deadLetters.push({
            url: p.url,
            stage: "fetch",
            status: status || null,
            error: `${shortErr(pwErr)} (attempts=${attempts}, playwright fallback failed)`,
            attempts,
          });
          fetchedCount++;
          notifyProgress("CRAWLING");
          continue;
        }
      }

      if (status < 200 || status >= 300 || !html) {
        deadLetters.push({
          url: p.url,
          stage: "fetch",
          status: status || null,
          error: `HTTP ${status || "fetch-fail"} empty-or-bad (non-retryable)`,
          attempts,
        });
        fetchedCount++;
        notifyProgress("CRAWLING");
        continue;
      }

      if (isShell(html)) {
        if (opts.usePlaywright) {
          try {
            const r = await attemptPlaywright(12000);
            html = r.html;
            status = r.status;
            tier = "playwright";
            if (status < 200 || status >= 300 || !html) {
              deadLetters.push({
                url: p.url,
                stage: "fetch",
                status,
                error: `HTTP ${status} after playwright render (non-retryable)`,
                attempts,
              });
              fetchedCount++;
              notifyProgress("CRAWLING");
              continue;
            }
          } catch (pwErr: any) {
            deadLetters.push({
              url: p.url,
              stage: "fetch",
              status,
              error: `Playwright render failed: ${shortErr(pwErr)}`,
              attempts,
            });
            fetchedCount++;
            notifyProgress("CRAWLING");
            continue;
          }
        } else {
          deadLetters.push({
            url: p.url,
            stage: "fetch",
            status,
            error: `JS shell (retry with --playwright)`,
            attempts,
          });
          fetchedCount++;
          notifyProgress("CRAWLING");
          continue;
        }
      } else {
        if (tier === "http") httpCount++;
      }

      if (p.source === "root" || idx === 0) rootHtml = rootHtml ?? html;

      fetchedCount++;
      notifyProgress("CRAWLING");
      await queue.push({ page: p, html, status, tier, attempts });
    }
  });

  // Stage B: Parse workers (parseConcurrency)
  const parseWorkerCount = Math.min(opts.parseConcurrency, Math.max(1, selected.length));
  const parseWorkers = Array.from({ length: parseWorkerCount }, async () => {
    while (true) {
      const raw = await queue.shift();
      if (raw === null) break;

      parsedCount++;
      try {
        const clean = extractCleanContent(raw.html, raw.page.url);
        if (!clean.content || clean.content.length < 50) {
          skippedThin++;
          notifyProgress("PARSING");
          continue;
        }
        const h = sha256(clean.content);
        if (seenHash.has(h)) {
          skippedThin++;
          notifyProgress("PARSING");
          continue;
        }
        seenHash.add(h);

        const wordCount = clean.content.split(/\s+/).filter(Boolean).length;
        const headings = (clean.headings || []).slice(0, 50);

        docs.push({
          url: raw.page.url,
          title: clean.title,
          category: clean.category,
          content: clean.content,
          contentHash: h,
          wordCount,
          headings,
          htmlBytes: raw.html.length,
          tier: raw.tier,
        });
      } catch (parseErr: any) {
        deadLetters.push({
          url: raw.page.url,
          stage: "parse",
          status: raw.status,
          error: `Parse failed: ${shortErr(parseErr)}`,
          attempts: 1,
        });
      }
      notifyProgress("PARSING");
    }
  });

  // Run Stage A to completion, then signal EOF on queue, then wait for Stage B to finish draining.
  await Promise.all(fetchWorkers);
  notifyProgress("PARSING", true);
  queue.close();
  await Promise.all(parseWorkers);
  notifyProgress("PARSING", true);

  console.log(""); // newline after progress line
  await closeBrowser();

  // Deterministic rank order for stable inserts.
  docs.sort((a, b) => a.url.localeCompare(b.url));  return {
    docs,
    rootHtml,
    stats: {
      selected: selected.length,
      docs: docs.length,
      failed: deadLetters.length,
      deadLetters,
      failures: deadLetters.slice(0, 10),
      httpCount,
      pwCount,
      skippedThin,
      retries: retriedCount,
      ms: Date.now() - t0,
    },
  };
}

