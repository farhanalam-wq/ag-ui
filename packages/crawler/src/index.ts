import { logger } from "@ag-ui/shared";
import { validateSafeUrl, SSRFError } from "./ssrf";
import { probeLlmsTxt, type LlmsTxtResult } from "./llms-txt";
import {
  discoverFromRobotsTxt,
  discoverFromSitemap,
  extractLinksFromHtml,
  normalizeUrl,
  calculatePriority,
  type DiscoveredUrl,
} from "./discovery";
import { fetchPage } from "./fetcher";
import { extractCleanContent, type ExtractedPageContent } from "./extractor";
import { extractBrandIntelligence, type ExtractedBrandData } from "./brand";

export * from "./ssrf";
export * from "./llms-txt";
export * from "./discovery";
export * from "./fetcher";
export * from "./extractor";
export * from "./brand";

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  forcePlaywright?: boolean;
}

export interface CrawledDocument extends ExtractedPageContent {
  url: string;
}

export interface CrawlResult {
  companyUrl: string;
  domain: string;
  brand: ExtractedBrandData;
  documents: CrawledDocument[];
  llmsTxtInfo: {
    hasLlmsFull: boolean;
    hasLlmsTxt: boolean;
  };
  pagesCrawled: number;
}

export class CompanyCrawler {
  /**
   * Executes a full autonomous crawl of a company website.
   */
  async crawl(targetUrlStr: string, options?: CrawlOptions): Promise<CrawlResult> {
    const maxPages = options?.maxPages ?? 30;
    const maxDepth = options?.maxDepth ?? 3;

    // 1. SSRF & URL Validation
    const baseUrl = await validateSafeUrl(targetUrlStr);
    const domain = baseUrl.hostname.replace(/^www\./, "");
    logger.info(`[CRAWLER] Starting ingestion for: ${baseUrl.origin} (maxPages: ${maxPages})`);

    const documents: CrawledDocument[] = [];
    const visitedUrls: Set<string> = new Set();
    const queue: DiscoveredUrl[] = [];

    let brandData: ExtractedBrandData = {
      tokens: {
        colors: { primary: "#2563eb", background: "#09090b", foreground: "#fafafa" },
        typography: {},
        radius: "0.5rem",
        style: "corporate",
      },
    };

    // 2. Probe /llms-full.txt and /llms.txt
    logger.info(`[CRAWLER] Probing /llms-full.txt and /llms.txt on ${domain}...`);
    const llmsResult: LlmsTxtResult = await probeLlmsTxt(baseUrl);

    // If /llms-full.txt exists, ingest it immediately as a comprehensive document
    if (llmsResult.hasLlmsFull && llmsResult.llmsFullContent) {
      documents.push({
        url: new URL("/llms-full.txt", baseUrl).toString(),
        title: `${domain} - Full Documentation (llms-full.txt)`,
        category: "docs",
        content: llmsResult.llmsFullContent,
        headings: ["Full Documentation"],
      });
      logger.info(`[CRAWLER] Ingested /llms-full.txt as primary document`);
    }

    // Seed priority URLs from /llms.txt
    for (const url of llmsResult.extractedUrls) {
      queue.push({ url, depth: 1, priority: 200 }); // Highest priority
    }

    // 3. Probe sitemaps
    const sitemaps = await discoverFromRobotsTxt(baseUrl);
    const defaultSitemap = new URL("/sitemap.xml", baseUrl).toString();
    if (!sitemaps.includes(defaultSitemap)) {
      sitemaps.push(defaultSitemap);
    }

    for (const sitemapUrl of sitemaps.slice(0, 2)) {
      const sitemapUrls = await discoverFromSitemap(sitemapUrl, baseUrl, maxPages);
      for (const url of sitemapUrls) {
        if (!visitedUrls.has(url) && !queue.some((q) => q.url === url)) {
          queue.push({
            url,
            depth: 1,
            priority: calculatePriority(url),
          });
        }
      }
    }

    // Ensure root URL is in queue with high priority
    const rootNormalized = normalizeUrl(baseUrl.toString(), baseUrl) || baseUrl.toString();
    if (!queue.some((q) => q.url === rootNormalized)) {
      queue.unshift({ url: rootNormalized, depth: 0, priority: 150 });
    }

    // 4. Crawl Queue Execution Loop
    while (queue.length > 0 && documents.length < maxPages) {
      // Sort queue so highest priority URLs are processed first
      queue.sort((a, b) => b.priority - a.priority);
      const current = queue.shift()!;

      if (visitedUrls.has(current.url)) continue;
      if (current.depth > maxDepth) continue;

      visitedUrls.add(current.url);
      logger.info(`[CRAWLER] [${documents.length + 1}/${maxPages}] Fetching: ${current.url}`);

      try {
        const fetchRes = await fetchPage(current.url, {
          forcePlaywright: options?.forcePlaywright,
        });

        if (fetchRes.status >= 200 && fetchRes.status < 300 && fetchRes.html) {
          // Extract brand on root page
          if (current.depth === 0 || current.url === rootNormalized) {
            brandData = extractBrandIntelligence(fetchRes.html, baseUrl);
            logger.info(
              `[CRAWLER] Extracted Brand: primary=${brandData.tokens.colors.primary}, logo=${brandData.logoUrl || "none"}`
            );
          }

          // Clean and extract document content
          const clean = extractCleanContent(fetchRes.html, current.url);
          if (clean.content.length > 50) {
            documents.push({
              ...clean,
              url: current.url,
            });
          }

          // Discover internal links if not at maxDepth
          if (current.depth < maxDepth) {
            const pageUrlObj = new URL(current.url);
            const discoveredLinks = extractLinksFromHtml(fetchRes.html, pageUrlObj, baseUrl);

            for (const link of discoveredLinks) {
              if (!visitedUrls.has(link) && !queue.some((q) => q.url === link)) {
                queue.push({
                  url: link,
                  depth: current.depth + 1,
                  priority: calculatePriority(link),
                });
              }
            }
          }
        }
      } catch (err: any) {
        logger.warn(`[CRAWLER] Error crawling ${current.url}: ${err.message}`);
      }
    }

    logger.info(
      `[CRAWLER] Finished ingestion for ${domain}. Total documents: ${documents.length}, Pages crawled: ${visitedUrls.size}`
    );

    return {
      companyUrl: baseUrl.origin,
      domain,
      brand: brandData,
      documents,
      llmsTxtInfo: {
        hasLlmsFull: llmsResult.hasLlmsFull,
        hasLlmsTxt: llmsResult.hasLlmsTxt,
      },
      pagesCrawled: visitedUrls.size,
    };
  }
}

export const defaultCrawler = new CompanyCrawler();
