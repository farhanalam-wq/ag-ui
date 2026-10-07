/**
 * scripts/show-stylesheet.ts
 *
 * Crawl one page, parse brand tokens, print the compiled stylesheet —
 * no database, no embeddings, no API keys.
 *
 * Usage:
 *   bun scripts/show-stylesheet.ts <url> [--show-vars] [--playwright] [--timeout N]
 *
 * Examples:
 *   bun scripts/show-stylesheet.ts https://example.com
 *   bun scripts/show-stylesheet.ts https://example.com --show-vars
 *   bun scripts/show-stylesheet.ts https://example.com --playwright
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { validateSafeUrl } from "../packages/crawler/src/ssrf";
import { extractBrandIntelligence, type BrandDiagEvent } from "../packages/crawler/src/brand";

interface ShowOpts {
  url: string;
  showVars: boolean;
  diagnose: boolean;
  usePlaywright: boolean;
  timeoutMs: number;
}

function printHelp() {
  console.log(`
show-stylesheet — crawl a page and print its compiled brand stylesheet (no DB, no embeddings).

Usage:
  bun scripts/show-stylesheet.ts <url> [--show-vars] [--diagnose] [--playwright] [--timeout N]

Options:
  --show-vars    Also print cssVariables JSON + per-field provenance
  --diagnose     Print fetch attribution table (final URL, HTML bytes, per-stylesheet outcomes, detector sources)
  --playwright   Fall back to headless render when the page is a JS shell
  --timeout N    Per-request timeout ms (default 10000, min 2000)
  --help         Show this help

Examples:
  bun scripts/show-stylesheet.ts https://example.com
  bun scripts/show-stylesheet.ts https://example.com --show-vars
  bun scripts/show-stylesheet.ts https://example.com --diagnose
`);
}

function parseArgs(argv: string[]): { url: string | null; opts: ShowOpts } {
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
  const positional = args.find((a) => !a.startsWith("--")) ?? null;
  const timeoutRaw = getVal("--timeout");
  return {
    url: positional,
    opts: {
      url: positional ?? "",
      showVars: args.includes("--show-vars"),
      diagnose: args.includes("--diagnose"),
      usePlaywright: args.includes("--playwright"),
      timeoutMs: Math.max(2000, parseInt(timeoutRaw ?? "10000", 10) || 10000),
    },
  };
}

async function fetchHtml(url: string, timeoutMs: number): Promise<{ html: string; status: number; finalUrl: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-crawler/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // @ts-ignore - Bun TLS opt
    tls: { rejectUnauthorized: false },
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { html: await res.text(), status: res.status, finalUrl: res.url || url };
}

/** Detects JS-shell / bot-block pages that carry no extractable brand signals. */
function shellReason(html: string): string | null {
  const l = html.toLowerCase();
  const tinyShell =
    (l.includes('<div id="root"></div>') || l.includes('<div id="__next"></div>') || l.includes('<div id="app"></div>')) &&
    html.length < 2500;
  if (tinyShell) return "empty JS mount point (React/Next shell)";
  if (html.length < 2500 && (l.includes("__nuxt") || l.includes("data-sveltekit") || l.includes("ng-version") || /<div id="(root|app|__next|__nuxt)">\s*<\/div>/.test(l))) {
    return "empty JS mount point (framework shell)";
  }
  if (html.length < 8000 && !l.includes("<style") && !l.includes('rel="stylesheet"') && !l.includes("rel='stylesheet'")) {
    if (/captcha|challenge|attention required|access denied|verify you are human|just a moment/i.test(html)) {
      return "bot-block / challenge page (no styles)";
    }
    if ((html.match(/<p[\s>]/gi) ?? []).length <= 1) {
      return "no stylesheets and almost no content (likely shell or block page)";
    }
  }
  return null;
}

async function fetchViaPlaywright(url: string, timeoutMs: number): Promise<{ html: string; status: number }> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const ctx = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    try {
      const page = await ctx.newPage();
      await page.route("**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,mp4,mp3}", (r: any) => r.abort());
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForTimeout(800);
      return { html: await page.content(), status: resp ? resp.status() : 200 };
    } finally {
      await ctx.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const { url, opts } = parseArgs(process.argv);
  if (!url) {
    printHelp();
    process.exit(1);
  }
  let target = url.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) target = "https://" + target;

  const baseUrl = await validateSafeUrl(target).catch((e: any) => {
    throw new Error(`[SSRF] blocked: ${e.message}`);
  });

  const { html, status, finalUrl } = await fetchHtml(baseUrl.toString(), opts.timeoutMs);
  if (status < 200 || status >= 300 || !html) throw new Error(`Fetch failed: HTTP ${status} (non-retryable)`);
  if (finalUrl !== baseUrl.toString()) {
    console.log(`[FETCH] redirected: ${baseUrl.toString()} -> ${finalUrl}`);
  }

  let pageHtml = html;
  const shell = shellReason(html);
  if (shell) {
    if (!opts.usePlaywright) {
      throw new Error(`Page looks like a ${shell} (retry with --playwright)`);
    }
    const r = await fetchViaPlaywright(baseUrl.toString(), Math.min(15000, opts.timeoutMs + 5000));
    if (r.status < 200 || r.status >= 300 || !r.html) throw new Error(`Playwright render failed: HTTP ${r.status}`);
    pageHtml = r.html;
  }

  const events: BrandDiagEvent[] = [];
  const brand = await extractBrandIntelligence(pageHtml, baseUrl, {
    fetchExternalCss: true,
    maxStylesheets: 10,
    timeoutMs: 8000,
    onStage: (ev) => events.push(ev),
  });
  const t = brand.tokens as any;
  const varCount = t?.cssVariables ? Object.keys(t.cssVariables).length : 0;
  console.log(`[BRAND] ${baseUrl.origin} primary=${t?.colors?.primary} theme=${t?.theme || "auto"} vars=${varCount} stylesheet=${t?.stylesheet ? "yes" : "no"}`);
  console.log("---STYLESHEET-BEGIN---");
  console.log(t?.stylesheet ?? "(no stylesheet extracted)");
  console.log("---STYLESHEET-END---");
  if (opts.showVars) {
    console.log("---VARS-BEGIN---");
    console.log(JSON.stringify({ cssVariables: t?.cssVariables ?? {}, sources: brand.sources ?? null }, null, 2));
    console.log("---VARS-END---");
  }
  if (opts.diagnose) {
    console.log("---DIAGNOSE-BEGIN---");
    console.log(`htmlBytes=${pageHtml.length} finalUrl=${finalUrl}`);
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
    console.log(`sources: ${JSON.stringify(brand.sources)}`);
    console.log("---DIAGNOSE-END---");
  }
}

main().catch((err) => {
  console.error("[STYLESHEET:FATAL]", err?.message ?? err);
  process.exit(1);
});
