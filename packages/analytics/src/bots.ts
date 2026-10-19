/**
 * packages/analytics/src/bots.ts
 *
 * Phase 1 — cheap user-agent bot gate (v1). Runs in the batch worker at
 * write time; the verdict is stored on the row so "humans only" dashboards
 * are a free filter, not a query-time computation.
 *
 * Deliberately v1: UA substrings only. ASN/datacenter-IP filtering needs a
 * GeoIP database and belongs in Phase 3, not here.
 */

const BOT_UA_SUBSTRINGS = [
  "bot",
  "crawl",
  "spider",
  "slurp",
  "mediapartners",
  "baidu",
  "yandex",
  "sogou",
  "exabot",
  "facebot",
  "ia_archiver",
  "ahrefs",
  "semrush",
  "mj12bot",
  "dotbot",
  "petalbot",
  "bytespider",
  "gptbot",
  "ccbot",
  "claudebot",
  "anthropic",
  "headless",
  "phantom",
  "selenium",
  "puppeteer",
  "playwright",
  "datadome",
  "perimeterx",
  "imperva",
  "monitor",
  "uptime",
  "pingdom",
  "newrelic",
  "curl",
  "wget",
  "python-requests",
  "axios",
  "go-http-client",
  "java/",
  "httpclient",
];

export function isBot(userAgent: string): boolean {
  const ua = (userAgent || "").toLowerCase();
  if (ua.length === 0) return true; // empty UA on a pageview is not a browser
  return BOT_UA_SUBSTRINGS.some((s) => ua.includes(s));
}
