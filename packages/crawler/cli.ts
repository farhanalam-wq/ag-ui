// Allow self-signed certificates for corporate proxy / local dev environments
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import { CompanyCrawler } from "./src/index";

async function main() {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.log("Usage: bun packages/crawler/cli.ts <url> [maxPages]");
    console.log("Example: bun packages/crawler/cli.ts https://anthropic.com 5\n");
    process.exit(1);
  }

  const maxPages = process.argv[3] ? parseInt(process.argv[3], 10) : 5;

  console.log(`[CLI] Starting test crawl for ${targetUrl} (maxPages: ${maxPages})...\n`);

  const crawler = new CompanyCrawler();
  const startTime = Date.now();

  try {
    const result = await crawler.crawl(targetUrl, { maxPages });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log("\n==========================================");
    console.log("           CRAWL RESULTS SUMMARY          ");
    console.log("==========================================");
    console.log(`Domain:          ${result.domain}`);
    console.log(`Base URL:        ${result.companyUrl}`);
    console.log(`Pages Crawled:   ${result.pagesCrawled}`);
    console.log(`Documents Saved: ${result.documents.length}`);
    console.log(`Duration:        ${duration}s`);
    console.log(`LLMs.txt Found:  ${result.llmsTxtInfo.hasLlmsTxt ? "YES" : "NO"}`);
    console.log(`LLMs-full Found: ${result.llmsTxtInfo.hasLlmsFull ? "YES" : "NO"}`);
    console.log("\n--- BRAND TOKENS ---");
    console.log(`Primary Color:   ${result.brand.tokens.colors.primary}`);
    console.log(`Secondary Color: ${result.brand.tokens.colors.secondary || "None"}`);
    console.log(`Logo URL:        ${result.brand.logoUrl || "None"}`);
    console.log(`Favicon URL:     ${result.brand.faviconUrl || "None"}`);
    console.log(`Typography:      ${result.brand.tokens.typography.headingFont || "Default"}`);
    console.log(`Style Tone:      ${result.brand.tokens.style}`);

    console.log("\n--- INGESTED DOCUMENTS ---");
    result.documents.forEach((doc, idx) => {
      console.log(`[${idx + 1}] [${doc.category.toUpperCase()}] ${doc.title}`);
      console.log(`    URL:     ${doc.url}`);
      console.log(`    Length:  ${doc.content.length} characters`);
      if (doc.headings.length > 0) {
        console.log(`    Sections: ${doc.headings.slice(0, 3).join(" | ")}`);
      }
      console.log(`    Snippet: ${doc.content.slice(0, 140).replace(/\n/g, " ")}...\n`);
    });

    console.log("==========================================");
  } catch (err: any) {
    console.error(`[CLI ERROR] Crawl failed: ${err.message}`);
    process.exit(1);
  }
}

main();
