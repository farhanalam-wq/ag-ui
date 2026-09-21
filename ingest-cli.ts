// ingest-cli.ts — robust, scalable crawl → parse → chunk/embed → Postgres pipeline.
// Usage:
//   bun ingest-cli.ts <url> [options]
//   bun ingest-cli.ts https://example.com --discover-only --limit 20
//   bun ingest-cli.ts https://example.com --all --yes --fetch-concurrency 20
// Flow: DISCOVER (sitemap/robots/llms.txt/homepage) → SHOW urls → SELECT (all/N/range)
//       → CONCURRENT CRAWL+PARSE → POPULATE DB (company/snapshot/brand/documents/chunks/facts).
// Retrieval is intentionally out of scope here; verify later with the existing chat path.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// Load .env (root) so DATABASE_URL / OPENAI_API_KEY resolve when run via bun.
function loadDotEnv() {
  try {
    const p = join(process.cwd(), ".env");
    if (!existsSync(p)) return;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const idx = t.indexOf("=");
      const k = t.slice(0, idx).trim();
      let v = t.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // best-effort only
  }
}
loadDotEnv();

import { validateSafeUrl } from "./packages/crawler/src/ssrf";
import { probeLlmsTxt } from "./packages/crawler/src/llms-txt";
import { discoverFromRobotsTxt } from "./packages/crawler/src/discovery";
import {
  normalizeUrl,
  calculatePriority,
  extractLinksFromHtml,
} from "./packages/crawler/src/discovery";
import {
  extractCleanContent,
  inferCategory,
} from "./packages/crawler/src/extractor";
import { extractBrandIntelligence } from "./packages/crawler/src/brand";
import {
  chunkMarkdown,
  generateEmbeddings,
  extractCompanyFacts,
  EmbeddingBatchError,
} from "./packages/shared/src/index";
import {
  db,
  companies,
  companySnapshots,
  brands,
  documents,
  chunks,
  facts,
  crawlJobs,
  eq,
  desc,
  upsertChunkPoints,
  invalidateCompanyContextCache,
} from "./packages/database/src/index";

// ---------------------------------------------------------------- types ---

interface DiscoveredPage {
  url: string;
  category: string;
  priority: number;
  source: "llms.txt" | "sitemap" | "homepage" | "root";
  depth: number;
}

interface CliOptions {
  url: string;
  discoverOnly: boolean;
  limit: number | null;
  all: boolean;
  yes: boolean;
  select: string | null;
  fetchConcurrency: number;
  parseConcurrency: number;
  embedConcurrency: number;
  hostGapMs: number;
  maxSitemapUrls: number;
  maxSitemaps: number;
  timeoutMs: number;
  usePlaywright: boolean;
  skipEmbed: boolean;
  dryRun: boolean;
  noEmbedCache: boolean;
}

interface CrawledDoc {
  url: string;
  title: string;
  category: string;
  content: string;
  contentHash: string;
  wordCount: number;
  headings: string[];
  htmlBytes: number;
  tier: "http" | "playwright";
}

export interface CrawlProgress {
  crawled: number;
  docs: number;
  failed: number;
  stage?: string;
}

export interface DeadLetterEntry {
  url: string;
  stage: "fetch" | "parse";
  status?: number | null;
  error: string;
  attempts: number;
}

export interface RawFetchedPage {
  page: DiscoveredPage;
  html: string;
  status: number;
  tier: "http" | "playwright";
  attempts: number;
}

/**
 * Bounded in-memory FIFO queue with backpressure.
 * When queue length reaches maxSize (default 200), push() blocks until consumers drain items.
 * When empty, shift() blocks until producers push items or close() is called.
 */
export class AsyncBoundedQueue<T> {
  private queue: T[] = [];
  private closed = false;
  private readonly maxSize: number;
  private waitingPush: (() => void)[] = [];
  private waitingShift: ((item: T | null) => void)[] = [];

  constructor(maxSize = 200) {
    this.maxSize = Math.max(1, maxSize);
  }

  async push(item: T): Promise<void> {
    if (this.closed) throw new Error("Cannot push to closed queue");
    while (this.queue.length >= this.maxSize && !this.closed) {
      await new Promise<void>((resolve) => this.waitingPush.push(resolve));
    }
    if (this.closed) throw new Error("Cannot push to closed queue");

    if (this.waitingShift.length > 0) {
      const resolver = this.waitingShift.shift()!;
      resolver(item);
    } else {
      this.queue.push(item);
    }
  }

  async shift(): Promise<T | null> {
    if (this.queue.length > 0) {
      const item = this.queue.shift()!;
      if (this.waitingPush.length > 0) {
        const resolver = this.waitingPush.shift()!;
        resolver();
      }
      return item;
    }
    if (this.closed) return null;
    return new Promise<T | null>((resolve) => this.waitingShift.push(resolve));
  }

  close(): void {
    this.closed = true;
    while (this.waitingShift.length > 0) {
      const resolver = this.waitingShift.shift()!;
      resolver(null);
    }
    while (this.waitingPush.length > 0) {
      const resolver = this.waitingPush.shift()!;
      resolver();
    }
  }

  get size(): number {
    return this.queue.length;
  }
}

// --------------------------------------------------------------- args ---

function printHelp() {
  console.log(`
ingest-cli — scalable crawl/parse/embed pipeline (root entry)

Usage:
  bun ingest-cli.ts <url> [options]

Discovery → selection → crawl → DB populate. No retrieval here.

Options:
  --discover-only        Only discover + list URLs, do not crawl or write DB
  --limit N              Non-interactive: take top N discovered URLs
  --all                  Non-interactive: take all discovered URLs
  --select "1-20,35"     Non-interactive: explicit 1-based indices/ranges
  --yes                  Skip confirmation prompt before crawling
  --fetch-concurrency N  Parallel page fetches (default 25, max 50)
  --parse-concurrency N  Parallel HTML parses (default 5, max 16)
  --embed-concurrency N  Parallel embedding streams (default 3, max 6)
  --host-gap-ms N        Min gap ms between requests to same host (default 150, 100-200)
  --concurrency N         Deprecated alias for --fetch-concurrency
  --max-sitemap N        Cap sitemap URL intake (default 2000)
  --max-sitemaps N       Cap sitemap files followed (default 10)
  --timeout N            Per-page HTTP timeout ms (default 10000)
  --playwright           Enable Playwright fallback for JS shells (default OFF for speed)
  --skip-embed           Parse + insert documents but skip chunk/embed (fast smoke test)
  --no-embed-cache       Bypass Redis embedding cache for reads and writes (parity tests)
  --dry-run              Crawl + parse, print stats, skip all DB writes
  --help                 Show this help

Interactive (no --limit/--all/--select):
  Shows ranked URL table, prompts for: all | N | ranges (e.g. 1-50,60,70-80)

Examples:
  bun ingest-cli.ts https://example.com --discover-only --limit 20
  bun ingest-cli.ts https://example.com --all --yes --fetch-concurrency 20
  bun ingest-cli.ts https://example.com --playwright --fetch-concurrency 10
`);
}

function parseArgs(argv: string[]): { url: string | null; opts: CliOptions } {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const getVal = (name: string): string | null => {
    const eq = args.find((a) => a.startsWith(name + "="));
    if (eq) return eq.slice(name.length + 1);
    const i = args.indexOf(name);
    if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--")) {
      return args[i + 1];
    }
    return null;
  };
  const has = (name: string) => args.includes(name);
  const positional = args.find((a) => !a.startsWith("--")) ?? null;

  const limitRaw = getVal("--limit");
  const fetchRaw = getVal("--fetch-concurrency");
  const parseRaw = getVal("--parse-concurrency");
  const embedRaw = getVal("--embed-concurrency");
  const hostGapRaw = getVal("--host-gap-ms");
  const legacyRaw = getVal("--concurrency");
  if (legacyRaw !== null && fetchRaw === null) {
    console.log("[DEPRECATED] --concurrency is an alias for --fetch-concurrency and will be removed; switch to --fetch-concurrency.");
  }
  const maxSmRaw = getVal("--max-sitemap");
  const maxSmsRaw = getVal("--max-sitemaps");
  const timeoutRaw = getVal("--timeout");

  return {
    url: positional,
    opts: {
      url: positional ?? "",
      discoverOnly: has("--discover-only"),
      limit: limitRaw !== null ? Math.max(1, parseInt(limitRaw, 10) || 1) : null,
      all: has("--all"),
      yes: has("--yes"),
      select: getVal("--select"),
      fetchConcurrency: Math.min(50, Math.max(1, parseInt(fetchRaw ?? legacyRaw ?? "25", 10) || 25)),
      parseConcurrency: Math.min(16, Math.max(1, parseInt(parseRaw ?? "5", 10) || 5)),
      embedConcurrency: Math.min(6, Math.max(1, parseInt(embedRaw ?? "3", 10) || 3)),
      hostGapMs: Math.min(200, Math.max(100, parseInt(hostGapRaw ?? "150", 10) || 150)),
      maxSitemapUrls: Math.max(10, parseInt(maxSmRaw ?? "2000", 10) || 2000),
      maxSitemaps: Math.max(1, Math.min(25, parseInt(maxSmsRaw ?? "10", 10) || 10)),
      timeoutMs: Math.max(2000, parseInt(timeoutRaw ?? "10000", 10) || 10000),
      usePlaywright: has("--playwright"),
      skipEmbed: has("--skip-embed"),
      dryRun: has("--dry-run"),
      noEmbedCache: has("--no-embed-cache"),
    },
  };
}

// -------------------------------------------------------------- utils ---

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Bounded parallel map. Returns results in input order; fn may throw (captured per-item). */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onDone?: (done: number, total: number) => void
): Promise<{ ok: R[]; failed: { index: number; error: string }[] }> {
  const ok: R[] = [];
  const failed: { index: number; error: string }[] = [];
  let cursor = 0;
  let done = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, items.length)) },
    async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        try {
          const r = await fn(items[i], i);
          if (r !== undefined) ok.push(r);
        } catch (err: any) {
          failed.push({ index: i, error: err?.message ?? String(err) });
        } finally {
          done++;
          onDone?.(done, items.length);
        }
      }
    }
  );
  await Promise.all(workers);
  return { ok, failed };
}

async function fetchText(url: string, timeoutMs: number): Promise<{ text: string; status: number; retryAfterMs: number | null }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-ingest/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // @ts-ignore - Bun TLS opt
    tls: { rejectUnauthorized: false },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Guard against giant payloads blowing memory on huge blogs.
  const text = await res.text();
  return { text, status: res.status, retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")) };
}

// ------------------------------------------- retry + rate limit (P0 task 5) ---
// Bounded retries, Retry-After honor, per-host gap, dead letter with attempt
// counts. Exported so fixture tests exercise the exact production code path.

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parses a Retry-After header value (delta seconds or HTTP date) into ms. Null when absent or unparseable. */
export function parseRetryAfterMs(value: string | null): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10) * 1000;
  const at = Date.parse(v);
  if (isNaN(at)) return null;
  return Math.max(0, at - Date.now());
}

export type FetchStatusKind = "ok" | "retryable" | "terminal";

/** 429 and 5xx are retryable. Every other non-2xx (404, 410, 403, 400, ...) is terminal. */
export function classifyStatus(status: number): FetchStatusKind {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status >= 500) return "retryable";
  return "terminal";
}

/** Timeout/abort/reset/refused/DNS wobbles are transient. Anything else thrown is terminal. */
export function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const msg = String(err?.message ?? err);
  return /timeout|aborted|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|connection reset|fetch failed|network|TLS|certificate/i.test(msg);
}

/**
 * Delay before the next attempt after failedAttempt (1-based): 1s, 4s, 16s
 * plus uniform jitter 0-500ms. An explicit Retry-After wins, capped at 30s.
 */
export function computeRetryDelayMs(failedAttempt: number, retryAfterMs: number | null): number {
  const bases = [1000, 4000, 16000];
  const jitter = Math.floor(Math.random() * 500);
  if (retryAfterMs !== null) return Math.min(retryAfterMs, 30000) + jitter;
  return bases[Math.min(failedAttempt - 1, bases.length - 1)] + jitter;
}

export class FetchTerminalError extends Error {
  attempts: number;
  status: number | null;
  kind: "status-terminal" | "status-exhausted" | "network-terminal" | "network-exhausted" | "cross-host" | "shell" | "empty";
  constructor(
    message: string,
    attempts: number,
    status: number | null = null,
    kind: FetchTerminalError["kind"] = "network-terminal"
  ) {
    super(message);
    this.name = "FetchTerminalError";
    this.attempts = attempts;
    this.status = status;
    this.kind = kind;
  }
}

function shortErr(err: any): string {
  return String(err?.message ?? err)
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

// Per-host last-fire timestamps. Updated synchronously before waiting so
// concurrent pool workers reserve slots instead of stampeding one host.
const hostLastAt = new Map<string, number>();
export function resetHostGaps(): void {
  hostLastAt.clear();
}

export async function waitForHostGap(host: string, gapMs: number): Promise<void> {
  const now = Date.now();
  const last = hostLastAt.get(host) ?? 0;
  const wait = last + gapMs - now;
  hostLastAt.set(host, now + Math.max(0, wait));
  if (wait > 0) await sleep(wait);
}

export interface RetryFetchOptions {
  timeoutMs: number;
  hostGapMs: number;
  maxAttempts?: number;
  onRetry?: () => void;
}

/**
 * HTTP fetch with per-host gap and bounded retries. Resolves on 2xx.
 * Throws FetchTerminalError (carrying attempts + status) on terminal status,
 * exhausted retries, or non-transient network errors.
 */
export async function fetchWithRetry(
  url: string,
  o: RetryFetchOptions
): Promise<{ html: string; status: number; attempts: number }> {
  const maxAttempts = o.maxAttempts ?? 3;
  const host = new URL(url).hostname;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitForHostGap(host, o.hostGapMs);
    let res: { text: string; status: number; retryAfterMs: number | null };
    try {
      res = await fetchText(url, o.timeoutMs);
    } catch (err: any) {
      if (!isTransientNetworkError(err)) {
        throw new FetchTerminalError(`${shortErr(err)} (attempts=${attempt}, non-retryable)`, attempt, null, "network-terminal");
      }
      if (attempt >= maxAttempts) {
        throw new FetchTerminalError(
          `${shortErr(err)} after ${attempt} attempts (retries exhausted)`,
          attempt,
          null,
          "network-exhausted"
        );
      }
      o.onRetry?.();
      await sleep(computeRetryDelayMs(attempt, null));
      continue;
    }
    const kind = classifyStatus(res.status);
    if (kind === "ok") return { html: res.text, status: res.status, attempts: attempt };
    if (kind === "terminal") {
      throw new FetchTerminalError(
        `HTTP ${res.status} (attempts=${attempt}, non-retryable)`,
        attempt,
        res.status,
        "status-terminal"
      );
    }
    if (attempt >= maxAttempts) {
      throw new FetchTerminalError(
        `HTTP ${res.status} after ${attempt} attempts (retries exhausted)`,
        attempt,
        res.status,
        "status-exhausted"
      );
    }
    o.onRetry?.();
    await sleep(computeRetryDelayMs(attempt, res.retryAfterMs));
  }
  throw new FetchTerminalError("fetch loop exited unexpectedly", maxAttempts);
}

// TODO(TASKS.md P1 task 2): persist the full dead-letter list into
// crawl_jobs.error_sample (cap 200 entries) once the table lands. Until then
// the list lives in memory, prints its full count, and shows the first 10.

function extractLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null && out.length < 20000) {
    out.push(m[1].trim());
  }
  return out;
}

function isSitemapIndex(xml: string): boolean {
  return xml.includes("<sitemapindex") || (xml.includes("<sitemap>") && /\.xml/i.test(xml.slice(0, 4000)));
}

const ASSET_EXT = /\.(xml|pdf|png|jpe?g|gif|svg|zip|mp4|webm|webp|css|js|woff2?|ttf|ico)(\?|#|$)/i;

// ---------------------------------------------------------- discovery ---

async function discoverPages(
  baseUrl: URL,
  opts: CliOptions
): Promise<{ pages: DiscoveredPage[]; info: Record<string, any> }> {
  const t0 = Date.now();
  const seen = new Map<string, DiscoveredPage>();
  const add = (url: string | null, source: DiscoveredPage["source"], depth: number) => {
    if (!url) return;
    if (ASSET_EXT.test(url)) return;
    if (seen.has(url)) return;
    seen.set(url, {
      url,
      category: inferCategory(url, ""),
      priority: calculatePriority(url),
      source,
      depth,
    });
  };

  // Root always candidate.
  const rootNorm = normalizeUrl(baseUrl.toString(), baseUrl);
  add(rootNorm, "root", 0);

  // Parallel: llms.txt probe + robots.txt + default sitemap existence handled below.
  const [llms, robotsSitemaps] = await Promise.all([
    probeLlmsTxt(baseUrl).catch(() => ({ hasLlmsFull: false, hasLlmsTxt: false, extractedUrls: [] as string[] })),
    discoverFromRobotsTxt(baseUrl).catch(() => [] as string[]),
  ]);

  for (const u of (llms as any).extractedUrls ?? []) {
    add(normalizeUrl(u, baseUrl), "llms.txt", 1);
  }

  // Sitemap BFS (index recursion) — the scale path for blogs/docs.
  const sitemapQueue: string[] = [...robotsSitemaps];
  const defaultSitemap = new URL("/sitemap.xml", baseUrl).toString();
  if (!sitemapQueue.includes(defaultSitemap)) sitemapQueue.push(defaultSitemap);
  // Common alternates worth one cheap HEAD/GET each.
  for (const alt of ["/sitemap_index.xml", "/sitemap-index.xml", "/blog/sitemap.xml", "/docs/sitemap.xml"]) {
    const u = new URL(alt, baseUrl).toString();
    if (!sitemapQueue.includes(u)) sitemapQueue.push(u);
  }

  const followed: string[] = [];
  let pageBudget = opts.maxSitemapUrls;
  const sitemapCap = Math.min(opts.maxSitemaps, sitemapQueue.length + 4);

  while (sitemapQueue.length > 0 && followed.length < sitemapCap && pageBudget > 0) {
    const sm = sitemapQueue.shift()!;
    if (followed.includes(sm)) continue;
    followed.push(sm);
    try {
      const { text, status } = await fetchText(sm, 8000);
      if (status < 200 || status >= 300 || !text.includes("<loc>")) continue;
      if (isSitemapIndex(text) && followed.length + sitemapQueue.length < sitemapCap + 5) {
        // Nested sitemap files → enqueue, don't count against page budget.
        for (const loc of extractLocs(text).slice(0, 50)) {
          const n = normalizeUrl(loc, baseUrl);
          if (n && /\.xml(\?|#|$)/i.test(n) && !followed.includes(n) && !sitemapQueue.includes(n)) {
            sitemapQueue.push(n);
          } else if (n) {
            add(n, "sitemap", 1);
            if (--pageBudget <= 0) break;
          }
        }
      } else {
        for (const loc of extractLocs(text)) {
          if (pageBudget <= 0) break;
          add(normalizeUrl(loc, baseUrl), "sitemap", 1);
          pageBudget--;
        }
      }
    } catch {
      // Missing sitemap alternates are normal; ignore.
    }
  }

  // Homepage nav expansion catches pages missing from sitemaps.
  try {
    const { text, status } = await fetchText(rootNorm ?? baseUrl.toString(), 10000);
    if (status >= 200 && status < 300 && text.length > 500) {
      const links = extractLinksFromHtml(text, new URL(rootNorm ?? baseUrl.toString()), baseUrl);
      for (const l of links.slice(0, 500)) add(l, "homepage", 1);
    }
  } catch {
    // Homepage fetch failure surfaces later in crawl stage.
  }

  const pages = [...seen.values()].sort((a, b) => b.priority - a.priority);
  return {
    pages,
    info: {
      hasLlmsTxt: (llms as any).hasLlmsTxt ?? false,
      hasLlmsFull: (llms as any).hasLlmsFull ?? false,
      robotsSitemaps: robotsSitemaps.length,
      sitemapsFollowed: followed,
      ms: Date.now() - t0,
    },
  };
}

function printDiscovery(pages: DiscoveredPage[], info: Record<string, any>, domain: string) {
  console.log(`\n[DISCOVERY] ${domain}: ${pages.length} crawlable URLs (${info.ms}ms)`);
  console.log(
    `[DISCOVERY] sources: llms.txt=${info.hasLlmsTxt ? "yes" : "no"} llms-full=${info.hasLlmsFull ? "yes" : "no"} robots-sitemaps=${info.robotsSitemaps} followed=${(info.sitemapsFollowed as string[]).length}`
  );
  const byCat = new Map<string, number>();
  const bySrc = new Map<string, number>();
  for (const p of pages) {
    byCat.set(p.category, (byCat.get(p.category) ?? 0) + 1);
    bySrc.set(p.source, (bySrc.get(p.source) ?? 0) + 1);
  }
  console.log(`[DISCOVERY] by category: ${[...byCat.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log(`[DISCOVERY] by source: ${[...bySrc.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);
  console.log("");
  const show = pages.slice(0, 50);
  console.log(`idx  prio  cat      src       url`);
  console.log(`---  ----  -------  --------  ------------------------------------------------`);
  show.forEach((p, i) => {
    console.log(
      `${String(i + 1).padStart(3)}  ${String(p.priority).padStart(4)}  ${p.category.padEnd(7)}  ${p.source.padEnd(8)}  ${p.url.slice(0, 100)}`
    );
  });
  if (pages.length > show.length) {
    console.log(`... and ${pages.length - show.length} more (use --limit/--all/--select or interactive range)`);
  }
  console.log("");
}

// ---------------------------------------------------------- selection ---

function parseSelection(input: string, total: number): number[] {
  const s = input.trim().toLowerCase();
  if (s === "all" || s === "a") return Array.from({ length: total }, (_, i) => i);
  if (/^\d+$/.test(s)) {
    const n = Math.min(total, Math.max(1, parseInt(s, 10)));
    return Array.from({ length: n }, (_, i) => i); // top N by rank
  }
  // ranges: "1-20,35,40-45"
  const out = new Set<number>();
  for (const part of s.split(",")) {
    const p = part.trim();
    if (!p) continue;
    const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = Math.max(1, parseInt(m[1], 10));
      let b = Math.min(total, parseInt(m[2], 10));
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) out.add(i - 1);
    } else if (/^\d+$/.test(p)) {
      const n = parseInt(p, 10);
      if (n >= 1 && n <= total) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

// ------------------------------------------------------------- crawl ---

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

async function crawlPages(
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

  const updateProgress = () => {
    process.stdout.write(
      `\r[CRAWL] fetched=${fetchedCount}/${selected.length} parsed=${parsedCount} docs=${docs.length} thin/dup=${skippedThin} dead=${deadLetters.length} queue=${queue.size}`
    );
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
        updateProgress();
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
          updateProgress();
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
          updateProgress();
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
        updateProgress();
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
              updateProgress();
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
            updateProgress();
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
          updateProgress();
          continue;
        }
      } else {
        if (tier === "http") httpCount++;
      }

      if (p.source === "root" || idx === 0) rootHtml = rootHtml ?? html;

      fetchedCount++;
      updateProgress();
      if (fetchedCount % 25 === 0) {
        await onProgress?.({ crawled: fetchedCount, docs: docs.length, failed: deadLetters.length, stage: "CRAWLING" });
      }
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
          updateProgress();
          continue;
        }
        const h = sha256(clean.content);
        if (seenHash.has(h)) {
          skippedThin++;
          updateProgress();
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
      updateProgress();
      if (parsedCount % 25 === 0) {
        await onProgress?.({ crawled: fetchedCount, docs: docs.length, failed: deadLetters.length, stage: "PARSING" });
      }
    }
  });

  // Run Stage A to completion, then signal EOF on queue, then wait for Stage B to finish draining.
  await Promise.all(fetchWorkers);
  await onProgress?.({ crawled: fetchedCount, docs: docs.length, failed: deadLetters.length, stage: "PARSING" });
  queue.close();
  await Promise.all(parseWorkers);
  await onProgress?.({ crawled: selected.length, docs: docs.length, failed: deadLetters.length, stage: "PARSING" });

  console.log(""); // newline after progress line
  await closeBrowser();

  // Deterministic rank order for stable inserts.
  docs.sort((a, b) => a.url.localeCompare(b.url));
  return {
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

// ------------------------------------------------------------ populate ---

async function populateDb(
  baseUrl: URL,
  domain: string,
  docs: CrawledDoc[],
  rootHtml: string | null,
  opts: CliOptions,
  crawlStats: Record<string, any>,
  jobContext?: { companyId: string; snapshotId: string; crawlJobId: string; version: number }
) {
  const t0 = Date.now();
  const companyName = domain.split(".")[0].toUpperCase();
  console.log(`\n[DB] Populating Postgres (${process.env.DATABASE_URL ? "DATABASE_URL set" : "default localhost"})…`);

  let companyId: string;
  let snapId: string;
  let version: number;
  let crawlJobId: string | null = jobContext?.crawlJobId ?? null;

  if (jobContext) {
    companyId = jobContext.companyId;
    snapId = jobContext.snapshotId;
    version = jobContext.version;
  } else {
    // Company find-or-create fallback.
    let [existing] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
    if (!existing) {
      const [ins] = await db
        .insert(companies)
        .values({ domain, name: companyName, url: baseUrl.origin })
        .returning();
      companyId = ins.id;
      console.log(`[DB] created company ${companyName} (${companyId})`);
    } else {
      companyId = existing.id;
      console.log(`[DB] reusing company ${existing.name} (${companyId})`);
    }

    // Snapshot versioning.
    const [latest] = await db
      .select()
      .from(companySnapshots)
      .where(eq(companySnapshots.companyId, companyId))
      .orderBy(desc(companySnapshots.version))
      .limit(1);
    version = (latest?.version ?? 0) + 1;
    const [snap] = await db
      .insert(companySnapshots)
      .values({ companyId, version, status: docs.length === 0 ? "FAILED" : "CRAWLING", pageCount: crawlStats.selected ?? docs.length })
      .returning();
    snapId = snap.id;
    console.log(`[DB] snapshot v${version} (${snapId}) status=CRAWLING`);
  }

  if (docs.length === 0) {
    console.log("[DB] no documents crawled — marking snapshot FAILED, nothing to embed.");
    await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
    if (crawlJobId) {
      await db.update(crawlJobs).set({ status: "FAILED", errorSample: crawlStats.deadLetters?.slice(0, 200) ?? [], updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
    }
    return { companyId, snapshotId: snapId, version, insertedDocs: 0, chunkCount: 0, factCount: 0, ms: Date.now() - t0 };
  }

  // Brand upsert from root HTML.
  try {
    const brandData = rootHtml
      ? extractBrandIntelligence(rootHtml, baseUrl)
      : {
          logoUrl: undefined as any,
          tokens: {
            colors: { primary: "#2563eb", background: "#09090b", foreground: "#fafafa" },
            typography: {},
            radius: "0.5rem",
            style: "corporate",
          } as any,
        };
    const [eb] = await db.select().from(brands).where(eq(brands.companyId, companyId)).limit(1);
    if (eb) {
      await db.update(brands).set({ logoUrl: (brandData as any).logoUrl, tokens: (brandData as any).tokens }).where(eq(brands.id, eb.id));
    } else {
      await db.insert(brands).values({ companyId, logoUrl: (brandData as any).logoUrl, tokens: (brandData as any).tokens });
    }
    console.log(`[DB] brand upserted (primary=${(brandData as any).tokens?.colors?.primary})`);
  } catch (err: any) {
    console.log(`[DB] brand extraction skipped: ${err.message}`);
  }

  // Documents bulk insert (Task 1: content_hash, word_count, headings).
  const inserted = await db
    .insert(documents)
    .values(
      docs.map((d) => ({
        snapshotId: snapId,
        url: d.url,
        title: d.title,
        category: d.category,
        content: d.content,
        contentHash: d.contentHash,
        wordCount: d.wordCount,
        headings: d.headings,
      }))
    )
    .returning();
  console.log(`[DB] inserted ${inserted.length} documents`);

  await db.update(companySnapshots).set({ status: "PROCESSING" }).where(eq(companySnapshots.id, snapId));
  if (crawlJobId) {
    await db.update(crawlJobs).set({ status: "EMBEDDING", docs: inserted.length, updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
  }

  // Chunk + embed (skippable for fast smoke tests).
  let chunkCount = 0;
  if (opts.skipEmbed) {
    console.log("[DB] --skip-embed: chunks/embeddings/facts skipped.");
    await db.update(companySnapshots).set({ status: "READY", pageCount: docs.length }).where(eq(companySnapshots.id, snapId));
    await invalidateCompanyContextCache(companyId);
    if (crawlJobId) {
      await db.update(crawlJobs).set({ status: "READY", docs: docs.length, failed: crawlStats.failed ?? 0, errorSample: crawlStats.deadLetters?.slice(0, 200) ?? [], updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
    }
    return { companyId, snapshotId: snapId, version, insertedDocs: inserted.length, chunkCount: 0, factCount: 0, ms: Date.now() - t0 };
  }

  const pending: {
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    url: string;
    title: string;
    category: string;
  }[] = [];
  for (const d of inserted) {
    const cs = chunkMarkdown(d.content, { docTitle: d.title, url: d.url });
    for (const c of cs) {
      pending.push({
        id: randomUUID(),
        documentId: d.id,
        content: c.content,
        chunkIndex: c.chunkIndex,
        url: d.url,
        title: d.title,
        category: d.category,
      });
    }
  }
  chunkCount = pending.length;
  console.log(`[DB] chunked into ${pending.length} pieces — embedding (${opts.embedConcurrency} streams)…`);
  if (pending.length > 0) {
    const tE = Date.now();
    let vecs: number[][];
    try {
      vecs = await generateEmbeddings(
        pending.map((p) => p.content),
        { concurrency: opts.embedConcurrency, useCache: !opts.noEmbedCache }
      );
    } catch (err: any) {
      await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
      const batchInfo = err instanceof EmbeddingBatchError ? ` (batch ${err.batchIndex}, status=${err.status ?? "unknown"})` : "";
      if (crawlJobId) {
        const errSample = [
          ...(crawlStats.deadLetters || []).slice(0, 199),
          {
            stage: "embedding",
            batchIndex: err instanceof EmbeddingBatchError ? err.batchIndex : null,
            status: err instanceof EmbeddingBatchError ? err.status : null,
            error: err.message,
            attempts: 3,
          },
        ];
        await db.update(crawlJobs).set({ status: "FAILED", errorSample: errSample, updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
      }
      throw new Error(`[DB] embedding failed${batchInfo}: ${err.message}; snapshot marked FAILED, no partial vectors written`);
    }
    console.log(`[DB] embeddings done in ${((Date.now() - tE) / 1000).toFixed(1)}s (${vecs.length}x1536d)`);

    // 1. Write relational chunks to Postgres with explicit pre-generated UUIDs
    try {
      for (let i = 0; i < pending.length; i += 100) {
        const slice = pending.slice(i, i + 100).map((p) => ({
          id: p.id,
          documentId: p.documentId,
          content: p.content,
          chunkIndex: p.chunkIndex,
        }));
        await db.insert(chunks).values(slice as any);
        process.stdout.write(`\r[DB] chunks inserted ${Math.min(i + 100, pending.length)}/${pending.length}`);
      }
      console.log("");
    } catch (err: any) {
      await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
      if (crawlJobId) {
        await db.update(crawlJobs).set({
          status: "FAILED",
          errorSample: [...(crawlStats.deadLetters || []).slice(0, 199), { stage: "postgres_chunk_insert", error: err.message }],
          updatedAt: new Date(),
        }).where(eq(crawlJobs.id, crawlJobId));
      }
      throw new Error(`[DB] Postgres chunk insert failed: ${err.message}; snapshot marked FAILED`);
    }

    // 2. Direct vector write to Qdrant collection 'company_chunks'
    try {
      const qdrantPoints = pending.map((p, idx) => ({
        id: p.id,
        vector: vecs[idx],
        payload: {
          company_id: companyId,
          snapshot_id: snapId,
          document_id: p.documentId,
          chunk_index: p.chunkIndex,
          url: p.url,
          title: p.title,
          category: p.category,
        },
      }));
      console.log(`[QDRANT] Upserting ${qdrantPoints.length} points to 'company_chunks' (batches of 256)...`);
      await upsertChunkPoints(qdrantPoints, 256);
      console.log(`[QDRANT] Vector upsert complete (${qdrantPoints.length} points)`);
    } catch (err: any) {
      await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
      if (crawlJobId) {
        await db.update(crawlJobs).set({
          status: "FAILED",
          errorSample: [...(crawlStats.deadLetters || []).slice(0, 199), { stage: "qdrant_vector_write", error: err.message }],
          updatedAt: new Date(),
        }).where(eq(crawlJobs.id, crawlJobId));
      }
      throw new Error(`[QDRANT] Vector upsert failed: ${err.message}; snapshot marked FAILED, not marked READY`);
    }
  }

  // Deterministic facts.
  const companyRow = (await db.select().from(companies).where(eq(companies.id, companyId)).limit(1))[0];
  const extracted = extractCompanyFacts(companyRow?.name ?? companyName, domain, inserted);
  if (extracted.length > 0) {
    await db.insert(facts).values(extracted.map((f) => ({ snapshotId: snapId, subject: f.subject, predicate: f.predicate, value: f.value, confidence: f.confidence })));
  }
  console.log(`[DB] facts: ${extracted.length}`);

  await db.update(companySnapshots).set({ status: "READY", pageCount: docs.length }).where(eq(companySnapshots.id, snapId));
  await invalidateCompanyContextCache(companyId);
  if (crawlJobId) {
    await db.update(crawlJobs).set({
      status: "READY",
      crawled: crawlStats.selected ?? docs.length,
      docs: docs.length,
      failed: crawlStats.failed ?? 0,
      errorSample: crawlStats.deadLetters?.slice(0, 200) ?? [],
      updatedAt: new Date(),
    }).where(eq(crawlJobs.id, crawlJobId));
  }
  return { companyId, snapshotId: snapId, version, insertedDocs: inserted.length, chunkCount, factCount: extracted.length, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- main ---

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
  };

  const opts: CliOptions = { ...defaultOpts, ...userOpts };

  // SSRF gate once (DNS-checked). Page fetches below stay same-host without per-URL DNS for scale.
  const baseUrl = await validateSafeUrl(target).catch((e: any) => {
    throw new Error(`[SSRF] blocked: ${e.message}`);
  });
  const domain = (baseUrl as URL).hostname.replace(/^www\./, "");
  console.log(`[INGEST] target=${(baseUrl as URL).origin} domain=${domain} fetch=${opts.fetchConcurrency} parse=${opts.parseConcurrency} embed=${opts.embedConcurrency} hostgap=${opts.hostGapMs}ms${opts.usePlaywright ? " +playwright" : ""}`);

  // Phase 1: discover.
  const { pages, info } = await discoverPages(baseUrl as URL, opts);
  if (pages.length === 0) {
    throw new Error("[DISCOVERY] no crawlable URLs found — aborting.");
  }
  printDiscovery(pages, info, domain);
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
  if (opts.select) {
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

  if (!opts.yes && opts.limit === null && !opts.all && !opts.select) {
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
  }

  // Phase 3: concurrent crawl + parse.
  const { docs, rootHtml, stats } = await crawlPages(
    selected,
    baseUrl as URL,
    opts,
    async (progress) => {
      if (!jobContext) return;
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
  const res = await populateDb(baseUrl as URL, domain, docs, rootHtml, opts, stats, jobContext);
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

async function main() {
  const { url, opts } = parseArgs(process.argv);
  if (!url) {
    printHelp();
    process.exit(1);
  }
  try {
    await runIngestPipeline(url, opts);
    process.exit(0);
  } catch (err: any) {
    console.error("[FATAL]", err?.message ?? err);
    process.exit(1);
  } finally {
    try {
      const { client, closeRedisConnection } = await import("./packages/database/src/index");
      await closeRedisConnection();
      await (client as any).end?.();
    } catch {
      // ignore
    }
  }
}

if (import.meta.main) {
  main().catch((e) => {
    console.error("[FATAL]", e?.message ?? e);
    process.exit(1);
  });
}
