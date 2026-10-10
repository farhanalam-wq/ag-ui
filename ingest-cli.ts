// ingest-cli.ts — robust, scalable crawl → parse → chunk/embed → Postgres pipeline.
// Usage:
//   bun ingest-cli.ts <url> [options]
//   bun ingest-cli.ts https://example.com --discover-only --limit 20
//   bun ingest-cli.ts https://example.com --all --yes --fetch-concurrency 20
// Flow: DISCOVER (sitemap/robots/llms.txt/homepage) → SHOW urls → SELECT (all/N/range)
//       → CONCURRENT CRAWL+PARSE → POPULATE DB (company/snapshot/brand/documents/chunks/facts).
// Retrieval is intentionally out of scope here; verify later with the existing chat path.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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


import { runIngestPipeline, PipelineExitError, type CliOptions } from "./packages/ingest/src/index";

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
  --max-pages N           Cap crawled pages to top N by priority (default 1000, 1-5000)
  --max-concurrent-jobs N Refuse when live jobs at cap (default 1, max 2)
  --max-sitemap N        Cap sitemap URL intake (default 2000)
  --max-sitemaps N       Cap sitemap files followed (default 10)
  --timeout N            Per-page HTTP timeout ms (default 10000)
  --playwright           Enable Playwright fallback for JS shells (default OFF for speed)
  --skip-embed           Parse + insert documents but skip chunk/embed (fast smoke test)
  --no-embed-cache       Bypass Redis embedding cache for reads and writes (parity tests)
  --dry-run              Crawl + parse, print stats, skip all DB writes
  --with-brand           Enqueue dembrandt appearance extraction on the brand queue after DB populate
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
  const maxPagesRaw = getVal("--max-pages");
  const maxJobsRaw = getVal("--max-concurrent-jobs");

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
      maxPages: Math.min(5000, Math.max(1, parseInt(maxPagesRaw ?? "1000", 10) || 1000)),
      maxConcurrentJobs: Math.min(2, Math.max(1, parseInt(maxJobsRaw ?? "1", 10) || 1)),
      maxSitemapUrls: Math.max(10, parseInt(maxSmRaw ?? "2000", 10) || 2000),
      maxSitemaps: Math.max(1, Math.min(25, parseInt(maxSmsRaw ?? "10", 10) || 10)),
      timeoutMs: Math.max(2000, parseInt(timeoutRaw ?? "10000", 10) || 10000),
      usePlaywright: has("--playwright"),
      skipEmbed: has("--skip-embed"),
      dryRun: has("--dry-run"),
      noEmbedCache: has("--no-embed-cache"),
      withBrand: has("--with-brand"),
    },
  };
}

// -------------------------------------------------------------- utils ---


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
    process.exit(err instanceof PipelineExitError ? err.exitCode : 1);
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
    process.exit(e instanceof PipelineExitError ? e.exitCode : 1);
  });
}
