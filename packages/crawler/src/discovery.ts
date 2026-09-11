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
];

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
 * Assigns an ingestion priority score to a URL based on route keywords.
 */
export function calculatePriority(urlStr: string): number {
  const lower = urlStr.toLowerCase();
  for (let i = 0; i < PRIORITY_KEYWORDS.length; i++) {
    if (lower.includes(PRIORITY_KEYWORDS[i])) {
      return 100 - i; // Higher score for earlier keywords
    }
  }
  return 10; // Default priority
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
