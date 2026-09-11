import { logger } from "@ag-ui/shared";
import { validateSafeUrl } from "./ssrf";

export interface FetchResult {
  url: string;
  html: string;
  status: number;
  tier: "http" | "playwright";
}

/**
 * Checks if HTML is merely a blank SPA shell requiring client-side JavaScript execution.
 */
function isClientSideAppShell(html: string): boolean {
  // If HTML contains very little text but has typical SPA mount divs
  const lower = html.toLowerCase();
  const hasAppRoot =
    lower.includes('<div id="root"></div>') ||
    lower.includes('<div id="__next"></div>') ||
    lower.includes('<div id="app"></div>');

  if (hasAppRoot && html.length < 2500) {
    return true;
  }

  return false;
}

/**
 * Fetches page HTML via fast native HTTP request.
 */
async function fetchViaHttp(urlStr: string, timeoutMs = 8000): Promise<{ html: string; status: number }> {
  await validateSafeUrl(urlStr);

  const res = await fetch(urlStr, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-crawler/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });

  const html = await res.text();
  return { html, status: res.status };
}

/**
 * Dynamic fallback fetcher using Playwright headless browser.
 */
async function fetchViaPlaywright(urlStr: string, timeoutMs = 12000): Promise<{ html: string; status: number }> {
  await validateSafeUrl(urlStr);

  // Lazy import to avoid loading browser binary when not required
  const { chromium } = await import("playwright");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    const page = await context.newPage();
    // Block unnecessary media requests to accelerate render
    await page.route("**/*.{png,jpg,jpeg,webp,gif,svg,woff,woff2,mp4,mp3}", (route) => route.abort());

    const response = await page.goto(urlStr, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });

    // Short wait for client-side hydration
    await page.waitForTimeout(1000);

    const html = await page.content();
    const status = response ? response.status() : 200;

    await context.close();
    return { html, status };
  } finally {
    await browser.close();
  }
}

/**
 * Dual-tier fetcher: attempts fast HTTP first, escalating to Playwright if needed.
 */
export async function fetchPage(urlStr: string, options?: { forcePlaywright?: boolean }): Promise<FetchResult> {
  if (options?.forcePlaywright) {
    logger.debug(`[FETCHER] Playwright forced for ${urlStr}`);
    const { html, status } = await fetchViaPlaywright(urlStr);
    return { url: urlStr, html, status, tier: "playwright" };
  }

  try {
    const { html, status } = await fetchViaHttp(urlStr);

    if (status >= 200 && status < 300) {
      if (!isClientSideAppShell(html)) {
        return { url: urlStr, html, status, tier: "http" };
      }
      logger.info(`[FETCHER] Client-side app shell detected for ${urlStr}. Escalating to Playwright.`);
    } else {
      logger.warn(`[FETCHER] HTTP ${status} for ${urlStr}. Falling back to Playwright.`);
    }
  } catch (err: any) {
    logger.debug(`[FETCHER] HTTP fetch failed for ${urlStr} (${err.message}). Falling back to Playwright.`);
  }

  // Escalate to Playwright
  try {
    const { html, status } = await fetchViaPlaywright(urlStr);
    return { url: urlStr, html, status, tier: "playwright" };
  } catch (err: any) {
    logger.error(`[FETCHER] Both HTTP and Playwright failed for ${urlStr}: ${err.message}`);
    throw err;
  }
}
