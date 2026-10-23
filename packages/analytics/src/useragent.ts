/**
 * packages/analytics/src/useragent.ts
 *
 * Where a visitor's browser and operating system come from.
 *
 * The parser is deliberately not allowed to be clever: the product reports
 * six browsers and six operating systems and nothing else (the taxonomies
 * live in the catalogue, `BROWSER_VALUES` / `OS_VALUES`), so a report never
 * shows a browser the customer cannot act on — and a new browser cannot
 * silently appear in a breakdown and change a percentage.
 *
 * Parsing happens once, at the collector, and the verdict is stored on the
 * event. A report never re-parses a user agent: the same row must not be
 * able to read as two different browsers depending on which library version
 * the API happened to be running.
 *
 * `ua-parser-js` does the reading; this module does the deciding.
 */

import { UAParser } from "ua-parser-js";
import { BROWSER_VALUES, OS_VALUES, type BrowserValue, type OsValue } from "./catalogue";

export interface ParsedUserAgent {
  browser: BrowserValue;
  os: OsValue;
}

/**
 * Maps a parsed browser name onto the product's taxonomy.
 *
 * Order matters only for names that contain another name's word ("Chrome
 * Mobile iOS" is a Chrome). `ua-parser-js` reports a clean family name, so
 * a substring match is enough.
 */
function browserValue(name: string | undefined): BrowserValue {
  const n = (name ?? "").toLowerCase();
  if (n.length === 0) return "other";
  if (n.includes("edge")) return "edge";
  if (n.includes("opera")) return "opera";
  if (n.includes("chrome")) return "chrome";
  if (n.includes("firefox")) return "firefox";
  if (n.includes("safari")) return "safari";
  return "other";
}

/** Maps a parsed OS name onto the product's taxonomy. */
function osValue(name: string | undefined): OsValue {
  const n = (name ?? "").toLowerCase();
  if (n.length === 0) return "other";
  if (n.includes("android")) return "android";
  if (n.includes("ios") || n.includes("iphone") || n.includes("ipad")) return "ios";
  if (n.includes("windows")) return "windows";
  if (n.includes("mac")) return "macos";
  if (n.includes("linux")) return "linux";
  return "other";
}

/**
 * Reads one user agent into the product's taxonomy.
 *
 * Never throws: a hostile or empty user agent is "other", not an error. The
 * bot gate (`bots.ts`) is a separate concern and still runs on the raw
 * string — a crawler is filtered before it ever reaches a report.
 */
export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = (userAgent ?? "").trim();
  if (ua.length === 0) return { browser: "other", os: "other" };
  try {
    const parsed = new UAParser(ua);
    return {
      browser: browserValue(parsed.getBrowser().name),
      os: osValue(parsed.getOS().name),
    };
  } catch {
    return { browser: "other", os: "other" };
  }
}

/** The value sets, re-exported so callers do not need two imports. */
export { BROWSER_VALUES, OS_VALUES };
export type { BrowserValue, OsValue };
