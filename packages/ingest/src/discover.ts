// Canonical discovery lives in @ag-ui/crawler. This module adapts its shape to
// what the pipeline stages expect (info.ms) and owns discovery printing.

import {
  discoverPages as discoverCanonical,
  type DiscoveredPage,
  type DiscoveryInfo,
} from "@ag-ui/crawler";

export interface PipelineDiscoveryOptions {
  maxSitemaps?: number;
  maxSitemapUrls?: number;
}

export async function discoverPages(
  baseUrl: URL,
  opts: PipelineDiscoveryOptions
): Promise<{ pages: DiscoveredPage[]; info: DiscoveryInfo & { ms: number } }> {
  const { pages, info } = await discoverCanonical(baseUrl, {
    maxSitemaps: opts.maxSitemaps,
    maxSitemapUrls: opts.maxSitemapUrls,
  });
  return { pages, info: { ...info, ms: info.durationMs } };
}
export function printDiscovery(pages: DiscoveredPage[], info: Record<string, any>, domain: string) {
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
