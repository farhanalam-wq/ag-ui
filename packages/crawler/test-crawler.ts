import { validateSafeUrl, SSRFError } from "./src/ssrf";
import { defaultStorage } from "@ag-ui/shared";
import { extractCleanContent } from "./src/extractor";
import { extractBrandIntelligence } from "./src/brand";
import { extractUrlsFromLlmsTxt } from "./src/llms-txt";

async function runTests() {
  console.log("[TEST] Starting Crawler & Storage verification tests...\n");

  // Test 1: SSRF Protection
  console.log("[TEST 1] Verifying SSRF Protection...");
  let ssrfCaught = 0;

  try {
    await validateSafeUrl("http://127.0.0.1:8080/secret");
  } catch (err: any) {
    if (err instanceof SSRFError) ssrfCaught++;
  }

  try {
    await validateSafeUrl("http://localhost:3000");
  } catch (err: any) {
    if (err instanceof SSRFError) ssrfCaught++;
  }

  try {
    await validateSafeUrl("http://169.254.169.254/latest/meta-data/");
  } catch (err: any) {
    if (err instanceof SSRFError) ssrfCaught++;
  }

  if (ssrfCaught === 3) {
    console.log("[PASS] SSRF protection successfully blocked all 3 forbidden targets.\n");
  } else {
    console.error(`[FAIL] SSRF protection blocked ${ssrfCaught}/3 targets.\n`);
    process.exit(1);
  }

  // Test 2: Local Storage Provider
  console.log("[TEST 2] Verifying Local Storage Provider...");
  const testBuffer = Buffer.from("test-logo-content");
  const storedUrl = await defaultStorage.upload("logos/test-logo.png", testBuffer, "image/png");
  const retrievedBuffer = await defaultStorage.get("logos/test-logo.png");

  if (retrievedBuffer.toString() === "test-logo-content" && storedUrl.includes("/storage/logos/test-logo.png")) {
    console.log(`[PASS] Storage uploaded and retrieved asset successfully: ${storedUrl}\n`);
    await defaultStorage.delete("logos/test-logo.png");
  } else {
    console.error("[FAIL] Storage upload/retrieval verification failed.\n");
    process.exit(1);
  }

  // Test 3: LLMs.txt Parser
  console.log("[TEST 3] Verifying LLMs.txt markdown link extraction...");
  const sampleLlmsTxt = `
# Acme Corp
Acme provides cloud infrastructure.

## Documentation
- [Quickstart Guide](https://example.com/docs/quickstart): Get started in 5 minutes
- [API Reference](/docs/api): Full endpoints
- [Pricing](/pricing): All subscription tiers
`;
  const extractedUrls = extractUrlsFromLlmsTxt(sampleLlmsTxt, new URL("https://example.com"));
  if (
    extractedUrls.includes("https://example.com/docs/quickstart") &&
    extractedUrls.includes("https://example.com/docs/api") &&
    extractedUrls.includes("https://example.com/pricing")
  ) {
    console.log(`[PASS] LLMs.txt extracted ${extractedUrls.length} priority URLs correctly.\n`);
  } else {
    console.error("[FAIL] LLMs.txt extraction failed:", extractedUrls);
    process.exit(1);
  }

  // Test 4: Content Cleaner (Readability + Cheerio)
  console.log("[TEST 4] Verifying Content Cleaner & Category Inference...");
  const sampleHtml = `
    <html>
      <head><title>Acme Pricing & Plans</title></head>
      <body>
        <nav><a href="/">Home</a><a href="/login">Login</a></nav>
        <div id="cookie-banner">Accept cookies</div>
        <main>
          <h1>Enterprise Pricing</h1>
          <p>Our enterprise tier starts at $99 per seat per month with 99.99% SLA.</p>
        </main>
        <footer>Copyright 2026 Acme</footer>
      </body>
    </html>
  `;
  const clean = extractCleanContent(sampleHtml, "https://example.com/pricing");
  if (
    clean.category === "pricing" &&
    clean.content.includes("Our enterprise tier starts at $99") &&
    !clean.content.includes("Accept cookies")
  ) {
    console.log(`[PASS] Content cleaned: Category='${clean.category}', Title='${clean.title}'. Boilerplate stripped.\n`);
  } else {
    console.error("[FAIL] Content cleaning failed:", clean);
    process.exit(1);
  }

  // Test 5: Brand Intelligence Extraction
  console.log("[TEST 5] Verifying Brand Intelligence Extraction...");
  const brandHtml = `
    <html>
      <head>
        <meta name="theme-color" content="#10b981">
        <meta property="og:image" content="https://example.com/assets/og-logo.png">
        <link rel="icon" href="/favicon.svg">
        <style>
          :root { --primary: #10b981; --secondary: #059669; }
          body { font-family: "Inter", sans-serif; }
        </style>
      </head>
      <body>
        <h1>Welcome</h1>
      </body>
    </html>
  `;
  const brand = extractBrandIntelligence(brandHtml, new URL("https://example.com"));
  if (
    brand.tokens.colors.primary === "#10b981" &&
    brand.logoUrl === "https://example.com/assets/og-logo.png"
  ) {
    console.log(`[PASS] Brand extracted: Primary='${brand.tokens.colors.primary}', Logo='${brand.logoUrl}'.\n`);
  } else {
    console.error("[FAIL] Brand extraction failed:", brand);
    process.exit(1);
  }

  console.log("[ALL TESTS PASSED] packages/crawler is fully verified!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
