/**
 * Raw analytics events for the seeder.
 *
 * Generates 90 days of realistic traffic for each demo company and streams it
 * into the partitioned `page_views` table with `COPY FROM STDIN` — never one
 * INSERT per row. The rollup functions in `rollups.ts` then derive sessions,
 * metrics and HLL uniques from these raw rows, so every dashboard tab agrees.
 *
 * Volume targets (per company): ~432k non-bot pageviews, ~180k visits,
 * ~22k chat opens, ~47k chat messages, ~18k chat closes, ~2.7k voice calls,
 * ~4.5k conversions, plus interactions and ~8% bot traffic.
 */

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { client } from "../packages/database/src/index";
import type { SeededCompany } from "./content";
import { pick, randInt, rngFor, sha256, weighted } from "./ids";

export const WINDOW_DAYS = 90;
const DAY_MS = 86_400_000;

export interface AnalyticsSummary {
  /** Non-bot pageview rows (what every report counts). */
  pageviews: number;
  /** Bot pageview rows, excluded by the rollups. */
  bots: number;
  /** Total raw rows of every type. */
  events: number;
  /** Visitors generated per company/day. */
  visitors: number;
}

interface Device {
  ua: string;
  browser: string;
  os: string;
  viewports: string[];
}

const DEVICES: Device[] = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    browser: "chrome",
    os: "windows",
    viewports: ["1920x1080", "1536x864", "1366x768"],
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    browser: "safari",
    os: "macos",
    viewports: ["1728x1117", "1440x900", "1512x982"],
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    browser: "chrome",
    os: "macos",
    viewports: ["1728x1117", "1440x900"],
  },
  {
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    browser: "safari",
    os: "ios",
    viewports: ["390x844", "393x852", "430x932"],
  },
  {
    ua: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
    browser: "chrome",
    os: "android",
    viewports: ["412x915", "360x800", "384x854"],
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0",
    browser: "firefox",
    os: "linux",
    viewports: ["1920x1080", "1366x768"],
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
    browser: "edge",
    os: "windows",
    viewports: ["1920x1080", "1536x864"],
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 OPR/111.0.0.0",
    browser: "opera",
    os: "windows",
    viewports: ["1366x768", "1920x1080"],
  },
];

const DEVICE_WEIGHTS = [32, 14, 12, 18, 14, 4, 4, 2];
const TZ_OFFSETS = [-480, -420, -360, -300, -240, 0, 60, 120, 330, 480, 540, 600];
const TZ_WEIGHTS = [18, 4, 6, 16, 4, 14, 12, 8, 8, 4, 4, 2];
const REFERRERS = [
  "",
  "https://www.google.com/",
  "https://www.linkedin.com/",
  "https://twitter.com/",
  "https://www.bing.com/",
  "https://news.ycombinator.com/",
  "https://www.producthunt.com/",
];
const REFERRER_WEIGHTS = [38, 24, 9, 7, 6, 5, 11];
const HOUR_WEIGHTS = [1, 1, 1, 1, 1, 2, 3, 5, 7, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 8, 7, 5, 3];
const PAGEVIEW_COUNTS = [1, 2, 3, 4, 5, 6];
const PAGEVIEW_WEIGHTS = [30, 32, 20, 10, 6, 2];
const CONVERSION_VALUES = [29, 49, 99, 199, 499, 999];
const CONVERSION_WEIGHTS = [24, 26, 22, 14, 9, 5];
const BOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

const COPY_COLUMNS = [
  "event_id",
  "type",
  "company_id",
  "widget_key_id",
  "session_hash",
  "visitor_hash",
  "url",
  "path",
  "referrer",
  "viewport",
  "user_agent",
  "browser",
  "os",
  "tz_offset",
  "is_bot",
  "value",
  "meta",
  "created_at",
] as const;

/** 90 UTC days ending yesterday, oldest first. */
export function seedWindowDays(now = new Date()): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const yesterday = today - DAY_MS;
  const out: string[] = [];
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) {
    out.push(new Date(yesterday - i * DAY_MS).toISOString().slice(0, 10));
  }
  return out;
}

function dayStartMs(day: string): number {
  return new Date(`${day}T00:00:00Z`).getTime();
}

function escapeCopy(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\t/g, "\\t")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "\\N";
  if (typeof value === "boolean") return value ? "t" : "f";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "\\N";
  if (typeof value === "object") return escapeCopy(JSON.stringify(value));
  return escapeCopy(String(value));
}

const HOUR_INDICES = HOUR_WEIGHTS.map((_, i) => i);

const PAGE_WEIGHTS = new Map<string, { indices: number[]; weights: number[] }>();

function pageWeights(company: SeededCompany): { indices: number[]; weights: number[] } {
  const cached = PAGE_WEIGHTS.get(company.key);
  if (cached) return cached;
  const weights = company.pages.map((p) =>
    p.path === "/" ? 30 : p.category === "pricing" ? 12 : p.category === "docs" ? 10 : 6
  );
  const value = { indices: company.pages.map((_, i) => i), weights };
  PAGE_WEIGHTS.set(company.key, value);
  return value;
}

function pagePath(
  company: SeededCompany,
  rng: () => number,
  weights = pageWeights(company)
): { path: string; title: string } {
  const index = weighted(rng, weights.indices, weights.weights);
  const page = company.pages[index]!;
  return { path: page.path, title: page.title };
}

function weightedHour(rng: () => number): number {
  return weighted(rng, HOUR_INDICES, HOUR_WEIGHTS);
}

interface Visitor {
  ip: string;
  visitorHash: string;
  device: Device;
  viewport: string;
  tzOffset: number;
}

function visitorPool(
  company: SeededCompany,
  day: string,
  count: number,
  rng: () => number
): Visitor[] {
  const pool: Visitor[] = [];
  for (let i = 0; i < count; i++) {
    const device = weighted(rng, DEVICES, DEVICE_WEIGHTS);
    const viewport = pick(rng, device.viewports);
    const tzOffset = weighted(rng, TZ_OFFSETS, TZ_WEIGHTS);    // Per-company, per-day hash: the same visitor on two tenants is two
    // unrelated hashes (docs/auth-tenancy.md §5.3).
    const ip = `10.${randInt(rng, 0, 255)}.${randInt(rng, 0, 255)}.${randInt(rng, 1, 254)}`;
    pool.push({
      ip,
      visitorHash: sha256(`${day}|${company.id}|${ip}|${device.ua}`),
      device,
      viewport,
      tzOffset,
    });
  }
  return pool;
}

function makeLine(values: unknown[]): string {
  return values.map(cell).join("\t") + "\n";
}

interface Counters {
  events: number;
  pageviews: number;
  bots: number;
  visitors: number;
}

function* companyLines(
  company: SeededCompany,
  days: string[],
  counters: Counters
): Generator<string> {
  for (const day of days) {
    const rng = rngFor(`${company.key}:${day}:events`);
    const dayWeight = dayWeightFor(day, days);
    const nonBotPageviews = Math.max(50, Math.round((432_000 / WINDOW_DAYS) * dayWeight));
    const botPageviews = Math.round(nonBotPageviews * 0.08);
    const visitorCount = Math.max(80, Math.round(nonBotPageviews / 3.4));
    const visitors = visitorPool(company, day, visitorCount, rng);
    counters.visitors += visitorCount;

    const dayStart = dayStartMs(day);
    const widgetKey = () => (rng() < 0.8 ? company.widgetKeyIds[0]! : company.widgetKeyIds[1]!);
    const dayEnd = dayStart + DAY_MS;

    // ---------------------------------------------------------- human visits
    let pageviews = 0;
    let sessionIndex = 0;
    while (pageviews < nonBotPageviews) {
      const visitor = pick(rng, visitors);
      const sessionHash = sha256(`${company.key}:${day}:${sessionIndex}:session`).slice(0, 32);
      const pageviewCount = weighted(rng, PAGEVIEW_COUNTS, PAGEVIEW_WEIGHTS);

      const hour = Math.min(22, weightedHour(rng));
      const start = dayStart + hour * 3_600_000 + randInt(rng, 0, 59) * 60_000 + randInt(rng, 0, 59) * 1_000;
      let at = Math.min(start, dayEnd - 25 * 60_000);
      let eventIndex = 0;
      const key = widgetKey();
      const base = {
        company_id: company.id,
        widget_key_id: key,
        session_hash: sessionHash,
        visitor_hash: visitor.visitorHash,
        viewport: visitor.viewport,
        user_agent: visitor.device.ua,
        browser: visitor.device.browser,
        os: visitor.device.os,
        tz_offset: visitor.tzOffset,
        is_bot: false,
      };

      const emit = (type: string, opts: {
        path?: string;
        title?: string;
        referrer?: string;
        value?: number | null;
        meta?: Record<string, unknown> | null;
        at?: number;
      } = {}) => {
        let path = opts.path;
        let title = opts.title;
        if (path === undefined) {
          const page = pagePath(company, rng);
          path = page.path;
          title = page.title;
        }
        const createdAt = new Date(opts.at ?? at).toISOString();
        const line = makeLine([
          `evt_${company.key}_${day}_${sessionIndex}_${eventIndex++}`,
          type,
          base.company_id,
          base.widget_key_id,
          base.session_hash,
          base.visitor_hash,
          `${company.url}${path}`,
          path,
          opts.referrer ?? "",
          base.viewport,
          base.user_agent,
          base.browser,
          base.os,
          base.tz_offset,
          base.is_bot,
          opts.value ?? null,
          opts.meta ?? null,
          createdAt,
        ]);
        counters.events++;
        if (type === "pageview") {
          pageviews++;
          counters.pageviews++;
        }
        return line;
      };

      // Landing pageview.
      let currentPath: string | undefined;
      let currentTitle: string | undefined;
      const firstPage = pagePath(company, rng);
      currentPath = firstPage.path;
      currentTitle = firstPage.title;
      yield emit("pageview", {
        path: currentPath,
        title: currentTitle,
        referrer: weighted(rng, REFERRERS, REFERRER_WEIGHTS),
      });

      for (let p = 1; p < pageviewCount && at < dayEnd - 60_000; p++) {
        at += randInt(rng, 18_000, 150_000);
        if (at >= dayEnd) break;
        const page = pagePath(company, rng);
        currentPath = page.path;
        currentTitle = page.title;
        yield emit("pageview", { path: currentPath, title: currentTitle, at });
      }

      // Heartbeats / engagement.
      const beats = rng() < 0.55 ? randInt(rng, 1, 2) : 0;
      for (let b = 0; b < beats; b++) {
        at += randInt(rng, 10_000, 40_000);
        if (at >= dayEnd) break;
        yield emit("heartbeat", { path: currentPath, title: currentTitle, meta: { durationSec: 15 }, at });
      }
      const scrolls = rng() < 0.7 ? randInt(rng, 1, 2) : 0;
      for (let s = 0; s < scrolls; s++) {
        at += randInt(rng, 5_000, 30_000);
        if (at >= dayEnd) break;
        yield emit("scroll", { path: currentPath, title: currentTitle, meta: { durationSec: randInt(rng, 3, 30) }, at });
      }
      if (rng() < 0.25) {
        at += randInt(rng, 3_000, 20_000);
        if (at < dayEnd) yield emit("click", { path: currentPath, title: currentTitle, meta: { durationSec: randInt(rng, 1, 8) }, at });
      }
      if (rng() < 0.12) {
        at += randInt(rng, 3_000, 20_000);
        if (at < dayEnd) yield emit("download", { path: currentPath, title: currentTitle, meta: { durationSec: randInt(rng, 1, 8) }, at });
      }

      // Chat funnel: ~12% of visits open the widget.
      if (rng() < 0.12 && at < dayEnd - 5 * 60_000) {
        at += randInt(rng, 4_000, 25_000);
        yield emit("chat_open", { path: currentPath, title: currentTitle, meta: { turns: 0 }, at });
        const turns = randInt(rng, 1, 4);
        for (let t = 0; t < turns; t++) {
          at += randInt(rng, 8_000, 45_000);
          if (at >= dayEnd) break;
          yield emit("chat_message", { path: currentPath, title: currentTitle, meta: { turns: t + 1 }, at });
        }
        if (rng() < 0.84 && at < dayEnd) {
          at += randInt(rng, 4_000, 30_000);
          yield emit("chat_close", {
            path: currentPath,
            title: currentTitle,
            meta: { durationSec: Math.max(10, Math.round((at - start) / 1000)), turns },
            at,
          });
        }
      }

      // Voice: ~1.5% of visits.
      if (rng() < 0.015 && at < dayEnd - 3 * 60_000) {
        at += randInt(rng, 5_000, 25_000);
        yield emit("voice_start", { path: currentPath, title: currentTitle, meta: {}, at });
        at += randInt(rng, 20_000, 180_000);
        if (at < dayEnd) {
          const turns = randInt(rng, 0, 5);
          yield emit("voice_end", {
            path: currentPath,
            title: currentTitle,
            meta: {
              durationSec: Math.max(5, Math.round((at - start) / 1000)),
              turns,
              abandoned: turns === 0,
            },
            at,
          });
        }
      }

      // Conversion: ~2.5% of visits.
      if (rng() < 0.025 && at < dayEnd) {
        at += randInt(rng, 5_000, 30_000);
        yield emit("conversion", {
          path: currentPath,
          title: currentTitle,
          value: weighted(rng, CONVERSION_VALUES, CONVERSION_WEIGHTS),
          meta: null,
          at,
        });
      }

      sessionIndex++;
    }

    // ---------------------------------------------------------- bot traffic
    for (let i = 0; i < botPageviews; i++) {
      const page = pagePath(company, rng);
      const at = dayStart + randInt(rng, 0, 86_399) * 1_000;
      const visitorHash = sha256(`${day}|${company.id}|bot-${i}`);
      yield makeLine([
        `evt_${company.key}_${day}_bot_${i}`,
        "pageview",
        company.id,
        null,
        sha256(`bot-session:${company.key}:${day}:${i}`).slice(0, 32),
        visitorHash,
        `${company.url}${page.path}`,
        page.path,
        "",
        "1920x1080",
        BOT_UA,
        "other",
        "other",
        0,
        true,
        null,
        { title: page.title },
        new Date(at).toISOString(),
      ]);
      counters.events++;
      counters.bots++;
    }
  }
}

/** Weekday/weekend shape with a mild growth trend; normalised to 1. */
function dayWeightFor(day: string, days: string[]): number {
  const date = new Date(`${day}T12:00:00Z`);
  const weekday = date.getUTCDay();
  const weekend = weekday === 0 || weekday === 6 ? 0.82 : 1.05;
  const progress = days.indexOf(day) / Math.max(1, days.length - 1);
  const trend = 0.88 + progress * 0.24;
  const meanWeekend = (2 * 0.82 + 5 * 1.05) / 7;
  return (weekend * trend) / meanWeekend / 1.0;
}

export async function seedAnalyticsEvents(
  companies: SeededCompany[]
): Promise<AnalyticsSummary> {
  const days = seedWindowDays();
  const counters: Counters = { events: 0, pageviews: 0, bots: 0, visitors: 0 };
  const copySql = `COPY "page_views" (${COPY_COLUMNS.map((c) => `"${c}"`).join(", ")}) FROM STDIN`;

  for (const company of companies) {
    const writable = await client.unsafe(copySql).writable();
    await pipeline(Readable.from(companyLines(company, days, counters)), writable);
  }

  return {
    events: counters.events,
    pageviews: counters.pageviews,
    bots: counters.bots,
    visitors: counters.visitors,
  };
}
