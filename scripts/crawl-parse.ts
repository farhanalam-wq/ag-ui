/**
 * scripts/crawl-parse.ts
 *
 * Crawl + parse + stylesheet WITHOUT embeddings and WITHOUT any database.
 * Thin CLI over CompanyCrawler (packages/crawler): discovery (llms.txt,
 * robots/sitemap, link expansion) -> fetch (static + Playwright fallback) ->
 * parse (Readability/Cheerio markdown) + root-page brand/stylesheet.
 *
 * Usage:
 *   bun scripts/crawl-parse.ts <url> [options]
 *
 * Examples:
 *   bun scripts/crawl-parse.ts https://example.com --max-pages 5
 *   bun scripts/crawl-parse.ts https://example.com --max-pages 10 --json
 *   bun scripts/crawl-parse.ts https://example.com --max-pages 5 --json --full --show-vars --diagnose
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { CompanyCrawler } from "../packages/crawler/src/index";
import type { BrandDiagEvent } from "../packages/crawler/src/brand";

interface CrawlParseOpts {
  url: string;
  maxPages: number;
  depth: number;
  playwright: boolean;
  json: boolean;
  full: boolean;
  showVars: boolean;
  diagnose: boolean;
}

function printHelp() {
  console.log(`
crawl-parse — multi-page crawl + parse + stylesheet. No DB, no embeddings, no API keys.

Usage:
  bun scripts/crawl-parse.ts <url> [options]

Stages: discover (llms.txt/sitemap/links) -> fetch -> parse -> brand/stylesheet (homepage).

Options:
  --max-pages N  Cap pages crawled (default 10, 1-100)
  --depth N      Link-follow depth (default 2, 0-5)
  --playwright   Force headless render for every page (slow; default: static fetch)
  --json         Append delimited JSON block (pages + brand tokens + stats)
  --full         With --json: embed full page markdown (default: 1000-char preview)
  --show-vars    Print cssVariables JSON + per-field provenance
  --diagnose     Print fetch attribution (stylesheets found, per-file outcomes, detector sources)
  --help         Show this help

Examples:
  bun scripts/crawl-parse.ts https://example.com --max-pages 5
  bun scripts/crawl-parse.ts https://example.com --max-pages 10 --json
  bun scripts/crawl-parse.ts https://example.com --max-pages 5 --json --full --show-vars --diagnose
`);
}

function parseArgs(argv: string[]): { url: string | null; opts: CrawlParseOpts } {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const getVal = (name: string): string | null => {
    const eq = args.find((a) => a.startsWith(name + "="));
    if (eq) return eq.slice(name.length + 1);
    const i = args.indexOf(name);
    if (i >= 0 && i + 1 < args.length && !args[i + 1].startsWith("--")) return args[i + 1];
    return null;
  };
  const has = (n: string) => args.includes(n);
  const positional = args.find((a) => !a.startsWith("--")) ?? null;
  const maxRaw = getVal("--max-pages");
  const depthRaw = getVal("--depth");
  return {
    url: positional,
    opts: {
      url: positional ?? "",
      maxPages: Math.min(100, Math.max(1, parseInt(maxRaw ?? "10", 10) || 10)),
      depth: Math.min(5, Math.max(0, parseInt(depthRaw ?? "2", 10) || 2)),
      playwright: has("--playwright"),
      json: has("--json"),
      full: has("--full"),
      showVars: has("--show-vars"),
      diagnose: has("--diagnose"),
    },
  };
}

async function main() {
  const { url, opts } = parseArgs(process.argv);
  if (!url) {
    printHelp();
    process.exit(1);
  }
  let target = url.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) target = "https://" + target;

  const events: BrandDiagEvent[] = [];
  const crawler = new CompanyCrawler();
  const t0 = Date.now();
  const res = await crawler.crawl(target, {
    maxPages: opts.maxPages,
    maxDepth: opts.depth,
    forcePlaywright: opts.playwright || undefined,
    brandOptions: {
      fetchExternalCss: true,
      maxStylesheets: 10,
      timeoutMs: 8000,
      onStage: opts.diagnose ? (ev) => events.push(ev) : undefined,
    },
  });
  const ms = Date.now() - t0;

  // 1. Human summary per page.
  console.log(`\n[CRAWL] ${res.domain}: ${res.documents.length} parsed docs (${res.pagesCrawled} fetched, ${ms}ms)`);
  console.log(`[CRAWL] llms-full=${res.llmsTxtInfo.hasLlmsFull ? "yes" : "no"} llms-txt=${res.llmsTxtInfo.hasLlmsTxt ? "yes" : "no"}`);
  console.log(`idx  cat      chars   url`);
  console.log(`---  -------  ------  ------------------------------------------------`);
  res.documents.forEach((d, i) => {
    console.log(`${String(i + 1).padStart(3)}  ${d.category.padEnd(7)}  ${String(d.content.length).padStart(6)}  ${d.url.slice(0, 80)}`);
  });

  // 2. Stylesheet (always printed).
  const t = res.brand.tokens as any;
  const varCount = t?.cssVariables ? Object.keys(t.cssVariables).length : 0;
  console.log(`\n[BRAND] primary=${t?.colors?.primary || "(empty)"} theme=${t?.theme || "auto"} vars=${varCount} stylesheet=${t?.stylesheet ? "yes" : "no"}`);
  console.log("---STYLESHEET-BEGIN---");
  console.log(t?.stylesheet ?? "(no stylesheet extracted)");
  console.log("---STYLESHEET-END---");
  if (opts.showVars) {
    console.log("---VARS-BEGIN---");
    console.log(JSON.stringify({ cssVariables: t?.cssVariables ?? {}, sources: res.brand.sources ?? null }, null, 2));
    console.log("---VARS-END---");
  }

  // 3. Machine-readable JSON block (pipe-safe delimiters).
  if (opts.json) {
    const payload = {
      mode: "crawl-parse",
      domain: res.domain,
      companyUrl: res.companyUrl,
      brand: {
        logoUrl: res.brand.logoUrl ?? null,
        tokens: res.brand.tokens,
        sources: res.brand.sources ?? null,
      },
      documents: res.documents.map((d) => ({
        url: d.url,
        title: d.title ?? "",
        category: d.category ?? "",
        chars: d.content.length,
        headings: d.headings ?? [],
        content: opts.full ? d.content : d.content.slice(0, 1000),
        truncated: opts.full ? false : d.content.length > 1000,
      })),
      stats: {
        docs: res.documents.length,
        fetched: res.pagesCrawled,
        ms,
        llmsFull: res.llmsTxtInfo.hasLlmsFull,
        llmsTxt: res.llmsTxtInfo.hasLlmsTxt,
      },
    };
    console.log("---JSON-BEGIN---");
    console.log(JSON.stringify(payload, null, 2));
    console.log("---JSON-END---");
  }

  if (opts.diagnose) {
    console.log("---DIAGNOSE-BEGIN---");
    for (const ev of events) {
      if (ev.type === "stylesheets-found") {
        console.log(`stylesheets: found=${ev.urls?.length ?? 0}`);
        for (const u of ev.urls ?? []) console.log(`  link: ${u}`);
      } else if (ev.type === "stylesheet-fetch") {
        console.log(`  fetch ${ev.ok ? "ok" : "FAIL"} bytes=${ev.bytes} ms=${ev.ms} ${ev.url}${ev.error ? ` (${ev.error})` : ""}`);
      } else if (ev.type === "css-bytes") {
        console.log(`css: total=${ev.totalBytes} inline=${ev.inlineBytes} external=${(ev.totalBytes ?? 0) - (ev.inlineBytes ?? 0)}`);
      } else if (ev.type === "primary-source") {
        console.log(`primary: source=${ev.source} value=${ev.primary || "(empty)"}`);
      }
    }
    console.log(`sources: ${JSON.stringify(res.brand.sources)}`);
    console.log("---DIAGNOSE-END---");
  }
}

main().catch((err) => {
  console.error("[CRAWL-PARSE:FATAL]", err?.message ?? err);
  process.exit(1);
});
