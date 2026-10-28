
// ---------------------------------------------------------------- types ---

import type { DiscoveredPage, RobotsRules } from "@ag-ui/crawler";

export type { DiscoveredPage };

import type { FailureSummary } from "./summarize";

export interface PipelineProgressEvent {
  stage: "DISCOVERING" | "CRAWLING" | "PARSING" | "EMBEDDING" | "EXTRACTING" | "EXTRACTING_APPEARANCE" | "READY";
  jobId?: string;
  companyId?: string;
  snapshotId?: string;
  crawled?: number;
  totalSelected?: number;
  docs?: number;
  failed?: number;
  skippedThin?: number;
  chunks?: number;
  facts?: number;
  message?: string;
  /**
   * Crawl-failure summary (TASKS.md #24) — present on the final CRAWLING
   * event and on READY events where the crawl stats are in scope.
   */
  failures?: FailureSummary;
}

export interface CliOptions {
  url: string;
  discoverOnly: boolean;
  limit: number | null;
  all: boolean;
  yes: boolean;
  select: string | null;
  selectedUrls?: string[];
  fetchConcurrency: number;
  parseConcurrency: number;
  embedConcurrency: number;
  hostGapMs: number;
  maxPages: number;
  maxConcurrentJobs: number;
  maxSitemapUrls: number;
  maxSitemaps: number;
  timeoutMs: number;
  usePlaywright: boolean;
  skipEmbed: boolean;
  dryRun: boolean;
  noEmbedCache: boolean;
  withBrand: boolean;
  /**
   * Opt-in robots.txt compliance (TASKS.md #23). When true, discovery
   * consults robots.txt and `robotsRules` (resolved by the pipeline) gate
   * every crawl fetch. Default false: robots.txt is never read.
   */
  useRobots?: boolean;
  /** Set by the pipeline from the discovery result; the crawl phase re-checks. */
  robotsRules?: RobotsRules | null;
  onProgress?: (event: PipelineProgressEvent) => void | Promise<void>;
}

export interface CrawledDoc {
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
  skippedThin?: number;
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

