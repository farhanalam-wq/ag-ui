
// ---------------------------------------------------------------- types ---

import type { DiscoveredPage } from "@ag-ui/crawler";

export type { DiscoveredPage };

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
  maxSitemapUrls: number;
  maxSitemaps: number;
  timeoutMs: number;
  usePlaywright: boolean;
  skipEmbed: boolean;
  dryRun: boolean;
  noEmbedCache: boolean;
  withBrand: boolean;
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

