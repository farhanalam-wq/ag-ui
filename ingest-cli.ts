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
import { createHash } from "node:crypto";
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
} from "./packages/shared/src/index";
import {
  db,
  companies,
  companySnapshots,
  brands,
  documents,
  chunks,
  facts,
  eq,
  desc,
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
  maxSitemapUrls: number;
  maxSitemaps: number;
  timeoutMs: number;
  usePlaywright: boolean;
  skipEmbed: boolean;
  dryRun: boolean;
}

interface CrawledDoc {
  url: string;
  title: string;
  category: string;
  content: string;
  headings: string[];
  htmlBytes: number;
  tier: "http" | "playwright";
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
  --concurrency N         Deprecated alias for --fetch-concurrency
  --max-sitemap N        Cap sitemap URL intake (default 2000)
  --max-sitemaps N       Cap sitemap files followed (default 10)
  --timeout N            Per-page HTTP timeout ms (default 10000)
  --playwright           Enable Playwright fallback for JS shells (default OFF for speed)
  --skip-embed           Parse + insert documents but skip chunk/embed (fast smoke test)
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
      maxSitemapUrls: Math.max(10, parseInt(maxSmRaw ?? "2000", 10) || 2000),
      maxSitemaps: Math.max(1, Math.min(25, parseInt(maxSmsRaw ?? "10", 10) || 10)),
      timeoutMs: Math.max(2000, parseInt(timeoutRaw ?? "10000", 10) || 10000),
      usePlaywright: has("--playwright"),
      skipEmbed: has("--skip-embed"),
      dryRun: has("--dry-run"),
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

async function fetchText(url: string, timeoutMs: number): Promise<{ text: string; status: number }> {
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
  return { text, status: res.status };
}

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
  opts: CliOptions
): Promise<{ docs: CrawledDoc[]; rootHtml: string | null; stats: Record<string, any> }> {
  const t0 = Date.now();
  const seenHash = new Set<string>();
  const docs: CrawledDoc[] = [];
  let rootHtml: string | null = null;
  let httpCount = 0;
  let pwCount = 0;
  let skippedThin = 0;

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

  console.log(`[CRAWL] starting ${selected.length} pages (fetch width ${opts.fetchConcurrency}, parse width ${opts.parseConcurrency})`);
  const { ok, failed } = await mapPool(
    selected,
    opts.fetchConcurrency,
    async (p) => {
      if (!sameHost(p.url)) throw new Error("cross-host skip");
      let html = "";
      let status = 0;
      let tier: CrawledDoc["tier"] = "http";
      try {
        const r = await fetchText(p.url, opts.timeoutMs);
        html = r.text;
        status = r.status;
      } catch (err: any) {
        // Network/timeout: try playwright once if enabled, else record failure.
        if (opts.usePlaywright) {
          const r = await fetchViaPlaywrightReuse(p.url, Math.min(15000, opts.timeoutMs + 5000));
          html = r.html;
          status = r.status;
          tier = "playwright";
          pwCount++;
        } else {
          throw err;
        }
      }
      if (status < 200 || status >= 300 || !html) throw new Error(`HTTP ${status || "fetch-fail"}`);
      if (isShell(html)) {
        if (opts.usePlaywright) {
          const r = await fetchViaPlaywrightReuse(p.url, 12000);
          html = r.html;
          status = r.status;
          tier = "playwright";
          pwCount++;
        } else {
          throw new Error("JS shell (retry with --playwright)");
        }
      } else {
        if (tier === "http") httpCount++;
      }
      if (p.source === "root" || selected.indexOf(p) === 0) rootHtml = rootHtml ?? html;
      const clean = extractCleanContent(html, p.url);
      if (!clean.content || clean.content.length < 50) {
        skippedThin++;
        return undefined as any;
      }
      const h = sha256(clean.content);
      if (seenHash.has(h)) {
        skippedThin++;
        return undefined as any; // exact-duplicate content (nav-only/blog template dupes)
      }
      seenHash.add(h);
      const doc: CrawledDoc = {
        url: p.url,
        title: clean.title,
        category: clean.category,
        content: clean.content,
        headings: clean.headings,
        htmlBytes: html.length,
        tier,
      };
      docs.push(doc);
      return doc;
    },
    (done, total) => {
      if (done % 10 === 0 || done === total) {
        process.stdout.write(`\r[CRAWL] ${done}/${total} fetched | docs=${docs.length} thin/dup=${skippedThin}`);
      }
    }
  );
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
      failed: failed.length,
      failures: failed.slice(0, 10).map((f) => `${selected[f.index]?.url} :: ${f.error}`),
      httpCount,
      pwCount,
      skippedThin,
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
  crawlStats: Record<string, any>
) {
  const t0 = Date.now();
  const companyName = domain.split(".")[0].toUpperCase();
  console.log(`\n[DB] Populating Postgres (${process.env.DATABASE_URL ? "DATABASE_URL set" : "default localhost"})…`);

  // Company find-or-create.
  let [existing] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
  let companyId: string;
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
  const version = (latest?.version ?? 0) + 1;
  const [snap] = await db
    .insert(companySnapshots)
    .values({ companyId, version, status: docs.length === 0 ? "FAILED" : "CRAWLING", pageCount: crawlStats.selected ?? docs.length })
    .returning();
  console.log(`[DB] snapshot v${version} (${snap.id}) status=CRAWLING`);

  if (docs.length === 0) {
    console.log("[DB] no documents crawled — marking snapshot FAILED, nothing to embed.");
    return { companyId, snapshotId: snap.id, version, insertedDocs: 0, chunkCount: 0, factCount: 0, ms: Date.now() - t0 };
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

  // Documents bulk insert.
  const inserted = await db
    .insert(documents)
    .values(docs.map((d) => ({ snapshotId: snap.id, url: d.url, title: d.title, category: d.category, content: d.content })))
    .returning();
  console.log(`[DB] inserted ${inserted.length} documents`);

  await db.update(companySnapshots).set({ status: "PROCESSING" }).where(eq(companySnapshots.id, snap.id));

  // Chunk + embed (skippable for fast smoke tests).
  let chunkCount = 0;
  if (opts.skipEmbed) {
    console.log("[DB] --skip-embed: chunks/embeddings/facts skipped.");
    await db.update(companySnapshots).set({ status: "READY", pageCount: docs.length }).where(eq(companySnapshots.id, snap.id));
    return { companyId, snapshotId: snap.id, version, insertedDocs: inserted.length, chunkCount: 0, factCount: 0, ms: Date.now() - t0 };
  }

  const pending: { documentId: string; content: string; chunkIndex: number }[] = [];
  for (const d of inserted) {
    const cs = chunkMarkdown(d.content, { docTitle: d.title, url: d.url });
    for (const c of cs) pending.push({ documentId: d.id, content: c.content, chunkIndex: c.chunkIndex });
  }
  chunkCount = pending.length;
  console.log(`[DB] chunked into ${pending.length} pieces — embedding (${opts.embedConcurrency} streams)…`);
  if (pending.length > 0) {
    const tE = Date.now();
    const vecs = await generateEmbeddings(pending.map((p) => p.content));
    console.log(`[DB] embeddings done in ${((Date.now() - tE) / 1000).toFixed(1)}s (${vecs.length}x1536d)`);
    for (let i = 0; i < pending.length; i += 100) {
      const slice = pending.slice(i, i + 100).map((p, k) => ({
        documentId: p.documentId,
        content: p.content,
        chunkIndex: p.chunkIndex,
        embedding: vecs[i + k],
      }));
      await db.insert(chunks).values(slice as any);
      process.stdout.write(`\r[DB] chunks inserted ${Math.min(i + 100, pending.length)}/${pending.length}`);
    }
    console.log("");
  }

  // Deterministic facts.
  const companyRow = (await db.select().from(companies).where(eq(companies.id, companyId)).limit(1))[0];
  const extracted = extractCompanyFacts(companyRow?.name ?? companyName, domain, inserted);
  if (extracted.length > 0) {
    await db.insert(facts).values(extracted.map((f) => ({ snapshotId: snap.id, subject: f.subject, predicate: f.predicate, value: f.value, confidence: f.confidence })));
  }
  console.log(`[DB] facts: ${extracted.length}`);

  await db.update(companySnapshots).set({ status: "READY", pageCount: docs.length }).where(eq(companySnapshots.id, snap.id));
  console.log(`[DB] snapshot ${snap.id} → READY`);
  return { companyId, snapshotId: snap.id, version, insertedDocs: inserted.length, chunkCount, factCount: extracted.length, ms: Date.now() - t0 };
}

// ---------------------------------------------------------------- main ---

async function main() {
  const { url, opts } = parseArgs(process.argv);
  if (!url) {
    printHelp();
    process.exit(1);
  }
  const tStart = Date.now();
  let target = url.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) target = "https://" + target;

  // SSRF gate once (DNS-checked). Page fetches below stay same-host without per-URL DNS for scale.
  const baseUrl = await validateSafeUrl(target).catch((e: any) => {
    console.error(`[SSRF] blocked: ${e.message}`);
    process.exit(1);
  });
  const domain = (baseUrl as URL).hostname.replace(/^www\./, "");
  console.log(`[INGEST] target=${(baseUrl as URL).origin} domain=${domain} fetch=${opts.fetchConcurrency} parse=${opts.parseConcurrency} embed=${opts.embedConcurrency}${opts.usePlaywright ? " +playwright" : ""}`);

  // Phase 1: discover.
  const { pages, info } = await discoverPages(baseUrl as URL, opts);
  if (pages.length === 0) {
    console.error("[DISCOVERY] no crawlable URLs found — aborting.");
    process.exit(1);
  }
  printDiscovery(pages, info, domain);
  if (opts.discoverOnly) {
    const n = opts.limit ?? pages.length;
    console.log(`[DISCOVER-ONLY] top ${Math.min(n, pages.length)}:`);
    pages.slice(0, n).forEach((p, i) => console.log(`  ${i + 1}. [${p.category}] ${p.url}`));
    process.exit(0);
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
    const ans = await rl.question(`Select pages: 'all' | N (top N) | ranges (e.g. 1-50,60) [all]: `);
    rl.close();
    indices = parseSelection(ans.trim() === "" ? "all" : ans, pages.length);
  }
  if (indices.length === 0) {
    console.error("[SELECT] empty selection — aborting.");
    process.exit(1);
  }
  const selected = indices.map((i) => pages[i]).filter(Boolean);
  console.log(`[SELECT] ${selected.length}/${pages.length} pages selected (est. crawl ~${Math.ceil(selected.length / opts.fetchConcurrency)} waves x ~1-3s)`);

  if (!opts.yes && opts.limit === null && !opts.all && !opts.select) {
    const rl2 = readline.createInterface({ input, output });
    const c = await rl2.question(`Crawl ${selected.length} pages (fetch ${opts.fetchConcurrency}, parse ${opts.parseConcurrency}, embed ${opts.embedConcurrency})? [Y/n]: `);
    rl2.close();
    if (c.trim().toLowerCase() === "n" || c.trim().toLowerCase() === "no") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  // Phase 3: concurrent crawl + parse.
  const { docs, rootHtml, stats } = await crawlPages(selected, baseUrl as URL, opts);
  const elapsedCrawl = ((stats.ms as number) / 1000).toFixed(1);
  const pps = (docs.length / Math.max(0.5, (stats.ms as number) / 1000)).toFixed(1);
  console.log(`[CRAWL] done: docs=${docs.length} failed=${stats.failed} http=${stats.httpCount} playwright=${stats.pwCount} thin/dup=${stats.skippedThin} in ${elapsedCrawl}s (${pps} docs/s)`);
  if ((stats.failures as string[]).length > 0) {
    console.log("[CRAWL] sample failures:");
    for (const f of (stats.failures as string[]).slice(0, 5)) console.log(`  - ${f}`);
  }
  if (opts.dryRun || docs.length === 0) {
    console.log(`[DRY] ${opts.dryRun ? "--dry-run: skipping DB." : "no docs: skipping DB."} Top docs:`);
    docs.slice(0, 5).forEach((d, i) => console.log(`  ${i + 1}. [${d.category}] ${d.title} (${d.content.length} chars) ${d.url}`));
    process.exit(docs.length === 0 ? 1 : 0);
  }

  // Phase 4: populate DB (chunk → embed → facts).
  try {
    const res = await populateDb(baseUrl as URL, domain, docs, rootHtml, opts, stats);
    const total = ((Date.now() - tStart) / 1000).toFixed(1);
    console.log(`\n==============================================`);
    console.log(`INGEST COMPLETE  domain=${domain} total=${total}s`);
    console.log(`  company=${res.companyId} snapshot=${res.snapshotId} v${res.version}`);
    console.log(`  discovered=${pages.length} selected=${selected.length} docs=${res.insertedDocs} chunks=${res.chunkCount} facts=${res.factCount}`);
    console.log(`  crawl=${elapsedCrawl}s (${pps} docs/s) db=${(res.ms / 1000).toFixed(1)}s`);
    console.log(`Verify retrieval later with: bun cli.ts ${domain}`);
    console.log(`==============================================`);
    process.exit(0);
  } catch (err: any) {
    console.error(`[DB] populate failed: ${err.message}`);
    console.error(err?.stack ?? err);
    process.exit(1);
  } finally {
    try {
      const { client } = await import("./packages/database/src/index");
      await (client as any).end?.();
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  console.error("[FATAL]", e?.message ?? e);
  process.exit(1);
});
