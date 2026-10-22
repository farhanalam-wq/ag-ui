/**
 * packages/analytics/src/registry.ts
 *
 * The behaviour behind the metric contract: the channel taxonomy, the
 * report query validator, and the report schemas.
 *
 * The contract itself — every metric, dimension, surface and caveat — lives
 * in `catalogue.ts`, which is re-exported from here so the import paths
 * that predate the split keep working.
 *
 * No GA4, no third-party APIs, no paid services.
 */

import { DIMENSIONS, METRICS, type DimensionDef, type DimensionId } from "./catalogue";

export * from "./catalogue";

/* ------------------------------------------------------------------ */
/* Channel taxonomy (first-party).                                     */
/*                                                                     */
/* There is deliberately NO "Organic Search" bucket: the tag cannot    */
/* tell an organic click from any other search-engine referral, so     */
/* inventing the split would be fabrication. Search referrers land in  */
/* Referral with their host preserved as source. Organic Social is a   */
/* first-class channel and is never filtered by search exclusion.      */
/* ------------------------------------------------------------------ */

export type Channel = "Direct" | "Organic Social" | "Campaign" | "Email" | "Referral";

export const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "x.com", "twitter.com", "linkedin.com",
  "youtube.com", "youtu.be", "tiktok.com", "pinterest.com", "reddit.com",
  "snapchat.com", "whatsapp.com", "t.me", "telegram.me", "threads.net",
  "bsky.app", "discord.com", "tumblr.com", "twitch.tv", "vimeo.com",
];

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isSocialHost(host: string): boolean {
  return SOCIAL_HOSTS.some((s) => host === s || host.endsWith(`.${s}`));
}

export interface Utm {
  source: string;
  medium: string;
  campaign: string;
}

/** Pure UTM extraction from a tracked URL (never throws). */
export function parseUtm(url: string): Utm {
  try {
    const q = new URL(url).searchParams;
    return {
      source: (q.get("utm_source") ?? "").trim().slice(0, 128),
      medium: (q.get("utm_medium") ?? "").trim().slice(0, 128).toLowerCase(),
      campaign: (q.get("utm_campaign") ?? "").trim().slice(0, 128),
    };
  } catch {
    return { source: "", medium: "", campaign: "" };
  }
}

export interface Attribution {
  channel: Channel;
  source: string;
  medium: string;
  campaign: string;
}

/**
 * First-party attribution. Precedence: Email > Organic Social >
 * Campaign > Referral > Direct. Pure function — the unit-test surface.
 */
export function classifyChannel(referrer: string, url: string): Attribution {
  const utm = parseUtm(url);
  const refHost = hostOf(referrer);
  const medium = utm.medium;

  if (medium === "email" || medium === "newsletter" || medium === "mail") {
    return { channel: "Email", source: utm.source || refHost || "(direct)", medium, campaign: utm.campaign || "(not set)" };
  }
  if ((refHost && isSocialHost(refHost)) || medium === "social" || medium === "organic-social") {
    return { channel: "Organic Social", source: utm.source || refHost || "(direct)", medium: medium || "organic", campaign: utm.campaign || "(not set)" };
  }
  if (utm.campaign) {
    return { channel: "Campaign", source: utm.source || refHost || "(direct)", medium: medium || "(none)", campaign: utm.campaign };
  }
  if (refHost) {
    // Includes search-engine referrers: first-party cannot split organic
    // search, so they stay Referral with host as source — by design.
    return { channel: "Referral", source: refHost, medium: medium || "referral", campaign: "(not set)" };
  }
  if (utm.source) {
    return { channel: "Campaign", source: utm.source, medium: medium || "(none)", campaign: utm.campaign || "(not set)" };
  }
  return { channel: "Direct", source: "(direct)", medium: "(none)", campaign: "(not set)" };
}

/** Desktop vs Mobile from a "WxH" viewport string. */
export function classifyDevice(viewport: string): "Desktop" | "Mobile" {
  const w = parseInt((viewport || "").split("x")[0] ?? "", 10);
  if (Number.isFinite(w) && w > 0) return w < 768 ? "Mobile" : "Desktop";
  return "Desktop";
}

/* ------------------------------------------------------------------ */
/* Query validation.                                                    */
/* ------------------------------------------------------------------ */

export interface ReportQuery {
  metrics: string[];
  dimensions?: string[];
  rangeDays?: unknown;
  compare?: "previous-period" | "off";
  channelFilter?: string[];
}

export interface QueryError {
  code:
    | "unknown-metric"
    | "unknown-dimension"
    | "metric-not-available"
    | "dimension-not-available"
    | "conversion-scope-excluded"
    | "organic-search-unsupported"
    | "incompatible-dimensions"
    | "bad-range"
    | "bad-channel-filter";
  message: string;
}

export const MAX_RANGE_DAYS = 90;

const ORGANIC_SEARCH_ALIASES = ["organic search", "organic-search", "organic_search"];

/**
 * Validates a report query against the registry. Never throws.
 * Planned metrics/dimensions fail loudly with reasons — callers must
 * render the reason, never a zero.
 */
export function validateReportQuery(q: ReportQuery): { ok: true } | { ok: false; errors: QueryError[] } {
  const errors: QueryError[] = [];
  const metrics = Array.isArray(q.metrics) ? q.metrics : [];
  const dimensions = Array.isArray(q.dimensions) ? q.dimensions : [];

  if (metrics.length === 0) {
    errors.push({ code: "unknown-metric", message: "At least one metric is required." });
  }
  for (const id of metrics) {
    const m = METRICS[id];
    if (!m) {
      errors.push({ code: "unknown-metric", message: `Unknown metric "${id}".` });
      continue;
    }
    if (m.status === "excluded") {
      errors.push({ code: "conversion-scope-excluded", message: `"${id}" is conversion analysis, out of product scope.` });
    } else if (m.status === "planned") {
      errors.push({ code: "metric-not-available", message: `"${id}" is defined but not collected yet: ${m.note ?? ""}` });
    }
  }
  for (const id of dimensions) {
    const d = (DIMENSIONS as Record<string, DimensionDef>)[id];
    if (!d) {
      errors.push({ code: "unknown-dimension", message: `Unknown dimension "${id}".` });
      continue;
    }
    if (d.status !== "available") {
      errors.push({ code: "dimension-not-available", message: `"${id}" is defined but not resolvable yet: ${d.note ?? ""}` });
    }
  }
  // Compatibility: each available metric must support every requested dimension.
  for (const id of metrics) {
    const m = METRICS[id];
    if (!m || m.status !== "available" || !m.dimensions) continue;
    for (const d of dimensions) {
      if (!m.dimensions.includes(d as DimensionId)) {
        errors.push({
          code: "incompatible-dimensions",
          message: `"${id}" cannot break down by "${d}" (HLL keys are per company-day only).`,
        });
      }
    }
  }
  const range = q.rangeDays;
  if (typeof range !== "number" || !Number.isInteger(range) || range < 1 || range > MAX_RANGE_DAYS) {
    errors.push({ code: "bad-range", message: `rangeDays must be an integer 1..${MAX_RANGE_DAYS}.` });
  }
  for (const c of q.channelFilter ?? []) {
    if (ORGANIC_SEARCH_ALIASES.includes(String(c).toLowerCase())) {
      errors.push({
        code: "organic-search-unsupported",
        message: "There is no Organic Search bucket first-party; search referrers report under Referral. Organic Social is unaffected.",
      });
    } else if (!["Direct", "Organic Social", "Campaign", "Email", "Referral"].includes(c)) {
      errors.push({ code: "bad-channel-filter", message: `Unknown channel "${c}".` });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/* ------------------------------------------------------------------ */
/* Report schemas + error/freshness model.                              */
/* ------------------------------------------------------------------ */

export interface Freshness {
  computedAt: string;
  /** Rollup lag in minutes: website/acquisition numbers move on the worker tick. */
  rollupLagMinutes: number;
  live: boolean;
  dataQuality: string[];
}

export interface ReportError {
  code: QueryError["code"] | "backend-error";
  message: string;
}

export interface TrendPoint {
  d: string;
  [metric: string]: string | number;
}

export interface BreakdownRow {
  label: string;
  [metric: string]: string | number;
}

export interface AcquisitionReport {
  kind: "acquisition";
  companyId: string;
  rangeDays: number;
  compare: "previous-period" | "off";
  totals: Record<string, number>;
  previousTotals?: Record<string, number>;
  trend: TrendPoint[];
  byChannel: BreakdownRow[];
  bySourceMedium: BreakdownRow[];
  byCampaign: BreakdownRow[];
  byLandingPage: BreakdownRow[];
  freshness: Freshness;
}

export interface EngagementReport {
  kind: "engagement";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  trend: TrendPoint[];
  byPath: BreakdownRow[];
  byDevice: BreakdownRow[];
  freshness: Freshness;
}

export interface ContentReport {
  kind: "content";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  byPath: BreakdownRow[];
  byTitle: BreakdownRow[];
  byChannel: BreakdownRow[];
  byDevice: BreakdownRow[];
  freshness: Freshness;
}

export function freshnessStub(live: boolean, dataQuality: string[] = []): Freshness {
  return { computedAt: new Date().toISOString(), rollupLagMinutes: 15, live, dataQuality };
}
