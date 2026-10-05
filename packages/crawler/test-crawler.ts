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
    clean.content.includes("# Enterprise Pricing") &&
    clean.content.includes("Our enterprise tier starts at $99") &&
    !clean.content.includes("Accept cookies")
  ) {
    console.log(`[PASS] Content cleaned & Markdown headings preserved: Category='${clean.category}', Title='${clean.title}'.\n`);
  } else {
    console.error("[FAIL] Content cleaning failed or headings missing:", clean);
    process.exit(1);
  }

  // Test 5: Brand Intelligence Extraction (Classic Hex)
  console.log("[TEST 5] Verifying Brand Intelligence Extraction (Classic Hex)...");
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
  const brand = await extractBrandIntelligence(brandHtml, new URL("https://example.com"), { fetchExternalCss: false });
  if (
    brand.tokens.colors.primary === "#10b981" &&
    brand.logoUrl === "https://example.com/assets/og-logo.png" &&
    brand.tokens.stylesheet &&
    brand.tokens.stylesheet.includes("--brand-primary: #10b981;")
  ) {
    console.log(`[PASS] Brand extracted: Primary='${brand.tokens.colors.primary}', Logo='${brand.logoUrl}', Stylesheet compiled.\n`);
  } else {
    console.error("[FAIL] Brand extraction failed:", brand);
    process.exit(1);
  }

  // Test 6: Modern Tailwind / shadcn HSL & Dynamic Stylesheet Generation
  console.log("[TEST 6] Verifying Modern Tailwind HSL & Dynamic Stylesheet Compilation...");
  const modernBrandHtml = `
    <html class="light">
      <head>
        <style>
          :root {
            --primary: 221.2 83.2% 53.3%;
            --secondary: 217.2 91.2% 59.8%;
            --background: 0 0% 100%;
            --foreground: 222.2 84% 4.9%;
            --radius: 0.75rem;
          }
        </style>
      </head>
      <body>
        <h1>Modern SaaS</h1>
      </body>
    </html>
  `;
  const modernBrand = await extractBrandIntelligence(modernBrandHtml, new URL("https://modern.example.com"), { fetchExternalCss: false });
  if (
    modernBrand.tokens.colors.primary &&
    modernBrand.tokens.colors.primary.startsWith("#") &&
    modernBrand.tokens.theme === "light" &&
    modernBrand.tokens.colors.background === "#ffffff" &&
    modernBrand.tokens.radius === "0.75rem" &&
    modernBrand.tokens.cssVariables &&
    modernBrand.tokens.cssVariables["--brand-primary"] === modernBrand.tokens.colors.primary
  ) {
    console.log(`[PASS] Tailwind HSL converted to Hex: Primary='${modernBrand.tokens.colors.primary}', Theme='${modernBrand.tokens.theme}', Radius='${modernBrand.tokens.radius}'.\n`);
  } else {
    console.error("[FAIL] Modern Tailwind HSL brand extraction failed:", modernBrand);
    process.exit(1);
  }

  // Test 7: Dark Mode Detection via Background Luminance
  console.log("[TEST 7] Verifying Dark Theme Luminance Detection...");
  const darkBrandHtml = `
    <html class="dark">
      <head>
        <style>
          :root {
            --primary: #8b5cf6;
            --background: #0f172a;
            --foreground: #f8fafc;
          }
        </style>
      </head>
      <body>
        <h1>Dark Console</h1>
      </body>
    </html>
  `;
  const darkBrand = await extractBrandIntelligence(darkBrandHtml, new URL("https://dark.example.com"), { fetchExternalCss: false });
  if (
    darkBrand.tokens.colors.primary === "#8b5cf6" &&
    darkBrand.tokens.theme === "dark" &&
    darkBrand.tokens.colors.background === "#0f172a" &&
    darkBrand.tokens.colors.foreground === "#f8fafc"
  ) {
    console.log(`[PASS] Dark theme detected: Theme='${darkBrand.tokens.theme}', Background='${darkBrand.tokens.colors.background}'.\n`);
  } else {
    console.error("[FAIL] Dark theme detection failed:", darkBrand);
    process.exit(1);
  }

  // Test 8: Untrusted font/radius sanitization (CSS breakout must be neutralized)
  console.log("[TEST 8] Verifying Font/Radius Sanitization...");
  const evilBrandHtml = `
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css?family=Evil%3B%7D+body%7Bdisplay%3Anone%7D+%23z%7B" rel="stylesheet">
        <style>
          :root { --radius: 0px; } body{display:none} #z{color:red} }
        </style>
      </head>
      <body>
        <h1> evil site</h1>
      </body>
    </html>
  `;
  const evilBrand = await extractBrandIntelligence(evilBrandHtml, new URL("https://evil.example.com"), { fetchExternalCss: false });
  const evilCss = evilBrand.tokens.stylesheet || "";
  const evilFontOk =
    !evilBrand.tokens.typography.headingFont || /^[A-Za-z][A-Za-z0-9 \-]{0,48}$/.test(evilBrand.tokens.typography.headingFont);
  if (
    evilFontOk &&
    !/body\s*\{\s*display\s*:\s*none/i.test(evilCss) &&
    !/@import|url\(|expression|javascript:/i.test(evilCss)
  ) {
    console.log(`[PASS] Malicious font payload neutralized: headingFont='${evilBrand.tokens.typography.headingFont}'. No breakout in compiled stylesheet.\n`);
  } else {
    console.error("[FAIL] Font sanitization failed:", evilBrand.tokens.typography, evilCss.slice(0, 500));
    process.exit(1);
  }

  // Test 9: Legit Google Fonts with weight suffix still resolve
  console.log("[TEST 9] Verifying Legit Weighted Font Preserved...");
  const goodFontHtml = `
    <html>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
      </head>
      <body><h1>Good SaaS</h1></body>
    </html>
  `;
  const goodBrand = await extractBrandIntelligence(goodFontHtml, new URL("https://good.example.com"), { fetchExternalCss: false });
  if (goodBrand.tokens.typography.headingFont === "Inter") {
    console.log(`[PASS] Weighted font suffix stripped, family preserved: '${goodBrand.tokens.typography.headingFont}'.\n`);
  } else {
    console.error("[FAIL] Legit font handling failed:", goodBrand.tokens.typography);
    process.exit(1);
  }

  console.log("[ALL TESTS PASSED] packages/crawler is fully verified with dynamic stylesheets, markdown headings & sanitization!");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
