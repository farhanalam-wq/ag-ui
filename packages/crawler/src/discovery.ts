import * as cheerio from "cheerio";
import { logger } from "@ag-ui/shared";
import { validateSafeUrl } from "./ssrf";

const PRIORITY_KEYWORDS = [
  "pricing",
  "plan",
  "about",
  "product",
  "feature",
  "solution",
  "doc",
  "guide",
  "case-stud",
  "company",
  "contact",
  "shop",
  "menu",
  "book",
  "order",
  "service",
  "blog",
  "changelog",
  "news",
  "post",
];

/**
 * Structural signals that feed priority scoring. Everything here is
 * language-agnostic except the small keyword bonus below.
 */
export interface PrioritySignals {
  /** 0 for the site root, +1 per path level. */
  depth?: number;
  /** Where the URL was found. Owner-curated sources outrank crawled ones. */
  source?: "llms.txt" | "sitemap" | "homepage" | "root";
  /** How many discovery passes surfaced this URL (repeat sightings). */
  sightings?: number;
  /** Sitemap <priority> hint, 0..1, when the sitemap provides one. */
  sitemapPriority?: number;
}

/**
 * Scores a URL so ranking survives any language or vertical: structure first
 * (root, depth, owner curation, sitemap hints, repeat sightings), keywords as
 * a flat bonus. Deterministic; higher means crawl earlier.
 */
export function calculatePriority(urlStr: string, signals?: PrioritySignals): number {
  let score = 10;
  const depth = signals?.depth ?? 1;
  const source = signals?.source;

  if (source === "root") score += 30;
  else if (source === "llms.txt") score += 20;

  score += Math.max(0, 12 - depth * 4);

  if (signals?.sitemapPriority !== undefined) {
    const clamped = Math.min(1, Math.max(0, signals.sitemapPriority));
    score += Math.round(clamped * 15);
  }

  if (signals?.sightings !== undefined && signals.sightings > 1) {
    score += Math.min(20, 2 * (signals.sightings - 1));
  }

  const lower = urlStr.toLowerCase();
  for (const keyword of PRIORITY_KEYWORDS) {
    if (lower.includes(keyword)) {
      score += 25;
      break;
    }
  }
  return score;
}

export interface DiscoveredUrl {
  url: string;
  depth: number;
  priority: number; // Higher number = higher priority
}

/**
 * Normalizes a URL by stripping hashes and tracking query parameters.
 */
export function normalizeUrl(rawUrl: string, baseUrl: URL): string | null {
  try {
    const url = new URL(rawUrl, baseUrl);

    // Only allow http/https
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    // Enforce same hostname or immediate subdomain
    const baseHost = baseUrl.hostname.replace(/^www\./, "");
    const targetHost = url.hostname.replace(/^www\./, "");

    if (targetHost !== baseHost && !targetHost.endsWith(`.${baseHost}`)) {
      return null;
    }

    // Strip hash
    url.hash = "";

    // Strip tracking query parameters
    const trackingParams = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
      "source",
    ];
    for (const param of trackingParams) {
      url.searchParams.delete(param);
    }

    // Remove trailing slash for normalization (unless root)
    let cleaned = url.toString();
    if (cleaned.endsWith("/") && url.pathname !== "/") {
      cleaned = cleaned.slice(0, -1);
    }

    return cleaned;
  } catch {
    return null;
  }
}

/**
 * Fetches and parses robots.txt for sitemaps.
 */
export async function discoverFromRobotsTxt(baseUrl: URL): Promise<string[]> {
  const sitemaps: string[] = [];
  const robotsUrl = new URL("/robots.txt", baseUrl);

  try {
    await validateSafeUrl(robotsUrl.toString());
    const res = await fetch(robotsUrl.toString(), {
      headers: { "User-Agent": "ag-ui-crawler/1.0" },
      // @ts-ignore - Bun native fetch TLS configuration
      tls: { rejectUnauthorized: false },
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const text = await res.text();
      const lines = text.split("\n");
      for (const line of lines) {
        const match = line.match(/^sitemap:\s*(https?:\/\/[^\s]+)/i);
        if (match && match[1]) {
          sitemaps.push(match[1].trim());
        }
      }
    }
  } catch (err: any) {
    logger.debug(`[DISCOVERY] robots.txt check failed: ${err.message}`);
  }

  return sitemaps;
}

/**
 * Fetches and parses a sitemap.xml for target URLs.
 */
export async function discoverFromSitemap(sitemapUrlStr: string, baseUrl: URL, maxUrls = 50): Promise<string[]> {
  const foundUrls: Set<string> = new Set();

  try {
    await validateSafeUrl(sitemapUrlStr);
    const res = await fetch(sitemapUrlStr, {
      headers: { "User-Agent": "ag-ui-crawler/1.0" },
      // @ts-ignore - Bun native fetch TLS configuration
      tls: { rejectUnauthorized: false },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return [];

    const xmlText = await res.text();
    // Fast regex extraction for <loc> tags in XML sitemaps
    const locRegex = /<loc>(https?:\/\/[^<]+)<\/loc>/gi;
    let match;

    while ((match = locRegex.exec(xmlText)) !== null && foundUrls.size < maxUrls) {
      const loc = match[1].trim();
      const normalized = normalizeUrl(loc, baseUrl);
      if (normalized && !normalized.endsWith(".xml") && !normalized.endsWith(".pdf") && !normalized.endsWith(".png")) {
        foundUrls.add(normalized);
      }
    }
  } catch (err: any) {
    logger.debug(`[DISCOVERY] Sitemap fetch failed for ${sitemapUrlStr}: ${err.message}`);
  }

  return Array.from(foundUrls);
}

/**
 * Extracts internal links from HTML markup.
 */
export function extractLinksFromHtml(html: string, pageUrl: URL, baseUrl: URL): string[] {
  const links: Set<string> = new Set();
  const $ = cheerio.load(html);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      const normalized = normalizeUrl(href, pageUrl);
      if (normalized) {
        // Exclude asset extensions
        if (!/\.(jpg|jpeg|png|gif|svg|pdf|zip|mp4|webm|webp|css|js)$/i.test(normalized)) {
          links.add(normalized);
        }
      }
    }
  });

  return Array.from(links);
}

export interface DiscoveredPage {
  url: string;
  category: "pricing" | "product" | "docs" | "blog" | "general" | "about";
  priority: number;
  source: "llms.txt" | "sitemap" | "homepage" | "root";
  depth: number;
}

export interface DiscoveryOptions {
  maxSitemaps?: number;
  maxSitemapUrls?: number;
}

export interface DiscoveryInfo {
  domain: string;
  totalUrls: number;
  durationMs: number;
  hasLlmsTxt: boolean;
  hasLlmsFull: boolean;
  robotsSitemaps: number;
  sitemapsFollowed: string[];
  byCategory: Record<string, number>;
  bySource: Record<string, number>;
}

const ASSET_EXT = /\.(xml|pdf|png|jpe?g|gif|svg|zip|mp4|webm|webp|css|js|woff2?|ttf|ico)(\?|#|$)/i;

function isSitemapIndex(xml: string): boolean {
  return xml.includes("<sitemapindex") || (xml.includes("<sitemap>") && /\.xml/i.test(xml.slice(0, 4000)));
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

function extractSitemapEntries(xml: string): { url: string; priority?: number }[] {
  const out: { url: string; priority?: number }[] = [];
  const blocks = xml.match(/<url>([\s\S]*?)<\/url>/gi) ?? [];
  if (blocks.length === 0) {
    // Non-standard file (bare loc list, index): no per-URL priority available.
    for (const loc of extractLocs(xml)) out.push({ url: loc });
    return out;
  }
  for (const block of blocks) {
    const loc = /<loc>(https?:\/\/[^<]+)<\/loc>/i.exec(block)?.[1]?.trim();
    if (!loc) continue;
    const pr = /<priority>(0(?:\.\d+)?|1(?:\.0+)?)<\/priority>/i.exec(block)?.[1];
    out.push({ url: loc, priority: pr !== undefined ? parseFloat(pr) : undefined });
    if (out.length >= 20000) break;
  }
  return out;
}

async function fetchDiscoveryText(url: string, timeoutMs: number): Promise<{ text: string; status: number }> {
  try {
    await validateSafeUrl(url);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-crawler/1.0",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // @ts-ignore - Bun native fetch TLS configuration
      tls: { rejectUnauthorized: false },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return { text, status: res.status };
  } catch {
    return { text: "", status: 0 };
  }
}

/**
 * High-speed autonomous discovery of all crawlable URLs for a domain.
 * Probes llms.txt, robots.txt, recursive sitemap index BFS, and homepage links.
 */
export async function discoverPages(
  baseUrl: URL,
  opts?: DiscoveryOptions
): Promise<{ pages: DiscoveredPage[]; info: DiscoveryInfo }> {
  const { probeLlmsTxt } = await import("./llms-txt");
  const { inferCategory } = await import("./extractor");

  const t0 = Date.now();
  const maxSitemaps = opts?.maxSitemaps ?? 10;
  const maxSitemapUrls = opts?.maxSitemapUrls ?? 2000;
  const domain = baseUrl.hostname.replace(/^www\./, "");

  const seen = new Map<string, DiscoveredPage>();
  // Repeat sightings across passes (sitemap + nav, llms.txt + sitemap) and
  // sitemap <priority> hints. Resolved into scores in a post-pass below.
  const sightings = new Map<string, number>();
  const sitemapHints = new Map<string, number>();
  const pathDepth = (u: string): number => {
    try {
      return new URL(u).pathname.split("/").filter(Boolean).length;
    } catch {
      return 1;
    }
  };
  const scoreSignals = (url: string, source: DiscoveredPage["source"], depth: number): PrioritySignals => ({
    source,
    depth: depth === 0 ? 0 : Math.max(1, pathDepth(url)),
    sightings: sightings.get(url) ?? 1,
    sitemapPriority: sitemapHints.get(url),
  });
  const add = (
    url: string | null,
    source: DiscoveredPage["source"],
    depth: number,
    sitemapPriority?: number
  ) => {
    if (!url) return;
    if (ASSET_EXT.test(url)) return;
    sightings.set(url, (sightings.get(url) ?? 0) + 1);
    if (sitemapPriority !== undefined) sitemapHints.set(url, sitemapPriority);
    if (seen.has(url)) return;
    seen.set(url, {
      url,
      category: inferCategory(url, "") as DiscoveredPage["category"],
      priority: calculatePriority(url, scoreSignals(url, source, depth)),
      source,
      depth,
    });
  };

  // 1. Root candidate
  const rootNorm = normalizeUrl(baseUrl.toString(), baseUrl);
  add(rootNorm, "root", 0);

  // 2. Parallel: llms.txt probe + robots.txt sitemaps
  const [llms, robotsSitemaps] = await Promise.all([
    probeLlmsTxt(baseUrl).catch(() => ({ hasLlmsFull: false, hasLlmsTxt: false, extractedUrls: [] as string[] })),
    discoverFromRobotsTxt(baseUrl).catch(() => [] as string[]),
  ]);

  for (const u of (llms as any).extractedUrls ?? []) {
    add(normalizeUrl(u, baseUrl), "llms.txt", 1);
  }

  // 3. Sitemap BFS (index recursion)
  const sitemapQueue: string[] = [...robotsSitemaps];
  const defaultSitemap = new URL("/sitemap.xml", baseUrl).toString();
  if (!sitemapQueue.includes(defaultSitemap)) sitemapQueue.push(defaultSitemap);
  for (const alt of ["/sitemap_index.xml", "/sitemap-index.xml", "/blog/sitemap.xml", "/docs/sitemap.xml"]) {
    const u = new URL(alt, baseUrl).toString();
    if (!sitemapQueue.includes(u)) sitemapQueue.push(u);
  }

  const followed: string[] = [];
  let pageBudget = maxSitemapUrls;
  const sitemapCap = Math.min(maxSitemaps, sitemapQueue.length + 4);

  while (sitemapQueue.length > 0 && followed.length < sitemapCap && pageBudget > 0) {
    const sm = sitemapQueue.shift()!;
    if (followed.includes(sm)) continue;
    followed.push(sm);
    try {
      const { text, status } = await fetchDiscoveryText(sm, 8000);
      if (status < 200 || status >= 300 || !text.includes("<loc>")) continue;
      if (isSitemapIndex(text) && followed.length + sitemapQueue.length < sitemapCap + 5) {
        for (const entry of extractSitemapEntries(text).slice(0, 50)) {
          const n = normalizeUrl(entry.url, baseUrl);
          if (n && /\.xml(\?|#|$)/i.test(n) && !followed.includes(n) && !sitemapQueue.includes(n)) {
            sitemapQueue.push(n);
          } else if (n) {
            add(n, "sitemap", 1, entry.priority);
            if (--pageBudget <= 0) break;
          }
        }
      } else {
        for (const entry of extractSitemapEntries(text)) {
          if (pageBudget <= 0) break;
          add(normalizeUrl(entry.url, baseUrl), "sitemap", 1, entry.priority);
          pageBudget--;
        }
      }
    } catch {
      // Ignore sitemap fetch errors
    }
  }

  // 4. Homepage nav expansion
  try {
    const { text, status } = await fetchDiscoveryText(rootNorm ?? baseUrl.toString(), 10000);
    if (status >= 200 && status < 300 && text.length > 500) {
      const links = extractLinksFromHtml(text, new URL(rootNorm ?? baseUrl.toString()), baseUrl);
      for (const l of links.slice(0, 500)) add(l, "homepage", 1);
    }
  } catch {
    // Non-blocking homepage fetch
  }

  // Post-pass: fold final repeat-sighting counts and sitemap hints into scores.
  for (const page of seen.values()) {
    page.priority = calculatePriority(page.url, scoreSignals(page.url, page.source, page.depth));
  }

  const pages = [...seen.values()].sort((a, b) => b.priority - a.priority);

  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const p of pages) {
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    bySource[p.source] = (bySource[p.source] ?? 0) + 1;
  }

  return {
    pages,
    info: {
      domain,
      totalUrls: pages.length,
      durationMs: Date.now() - t0,
      hasLlmsTxt: (llms as any).hasLlmsTxt ?? false,
      hasLlmsFull: (llms as any).hasLlmsFull ?? false,
      robotsSitemaps: robotsSitemaps.length,
      sitemapsFollowed: followed,
      byCategory,
      bySource,
    },
  };
}

