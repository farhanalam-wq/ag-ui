/**
 * packages/analytics/src/registry.ts
 *
 * Phase 1 — first-party metric/dimension registry, channel taxonomy,
 * report query validator, and report schemas.
 *
 * Free-only constraint: every "available" metric/dimension must be
 * computable from what the existing snippet tag already collects
 * (pageview/chat/conversion events in page_views + rollups + HLL).
 * Anything needing uncollected data is status "planned" (Phase 3 tag
 * work) or "excluded" (product scope) — never silently faked.
 *
 * No GA4, no third-party APIs, no paid services.
 */

export type MetricStatus = "available" | "planned" | "excluded";

export interface MetricDef {
  id: string;
  label: string;
  /** How the frontend should render the raw number. */
  format: "int" | "float1" | "percent1" | "money1";
  definition: string;
  status: MetricStatus;
  /** Where the number comes from when available. */
  source?: string;
  /** Dimensions this metric can break down by (empty = total only). */
  dimensions?: DimensionId[];
  /** Why planned/excluded — surfaced to callers, never a silent zero. */
  note?: string;
}

export type DimensionId =
  | "day"
  | "path"
  | "channel"
  | "source"
  | "medium"
  | "campaign"
  | "landingPage"
  | "device"
  | "referrer"
  | "title";

export interface DimensionDef {
  id: DimensionId;
  label: string;
  definition: string;
  status: MetricStatus;
  source?: string;
  note?: string;
}

export const METRICS: Record<string, MetricDef> = {
  sessions: {
    id: "sessions",
    label: "Sessions",
    format: "int",
    definition: "Island-counted sessions: one tab-session splits after 30 min inactivity.",
    status: "available",
    source: "metrics_daily.sessions",
    dimensions: ["day", "path", "channel", "source", "medium", "campaign", "landingPage", "device", "referrer"],
  },
  pageviews: {
    id: "pageviews",
    label: "Views",
    format: "int",
    definition: "Human pageview events (bot traffic filtered at write time).",
    status: "available",
    source: "metrics_daily.pageviews / page_views COUNT",
    dimensions: ["day", "path", "title", "channel", "source", "medium", "campaign", "landingPage", "device", "referrer"],
  },
  uniques: {
    id: "uniques",
    label: "Total users",
    format: "int",
    definition: "Approx. distinct visitors via daily Redis HLL merged over the range.",
    status: "available",
    source: "ahll:{company}:{day} PFMERGE",
    dimensions: ["day"],
    note: "HLL keys exist per company-day only, so uniques cannot split by channel/path yet.",
  },
  chatOpens: {
    id: "chatOpens",
    label: "Widget opened",
    format: "int",
    definition: "chat_open events: visitor opened the chat widget.",
    status: "available",
    source: "metrics_daily.chat_opens",
    dimensions: ["day", "path", "channel", "source", "medium", "campaign", "device"],
  },
  messages: {
    id: "messages",
    label: "Chat messages",
    format: "int",
    definition: "chat_message events in range.",
    status: "available",
    source: "metrics_daily.messages",
    dimensions: ["day"],
  },
  engagedSessions: {
    id: "engagedSessions",
    label: "Engaged sessions",
    format: "int",
    definition: "Distinct tab-sessions with 2+ pageviews or any interaction (chat, conversion, scroll, download, configured click) in the window.",
    status: "available",
    source: "raw distinct tab-session scan (engagement.ts)",
    dimensions: ["day", "path", "device"],
  },
  engagementRate: {
    id: "engagementRate",
    label: "Engagement rate",
    format: "percent1",
    definition: "engagedSessions / sessions * 100 (raw tab-session denominator, see engagement-denominator-raw).",
    status: "available",
    source: "engagement.ts",
    dimensions: ["day"],
  },
  avgEngagementTime: {
    id: "avgEngagementTime",
    label: "Avg. engagement time",
    format: "float1",
    definition: "Mean active seconds per session: 15s per heartbeat, capped at 30min per island.",
    status: "available",
    source: "sessions.active_seconds",
    dimensions: ["day"],
  },
  scrolls: {
    id: "scrolls",
    label: "Scroll events",
    format: "int",
    definition: "Depth-threshold (25/50/75/90%) scroll events fired once per threshold per page.",
    status: "available",
    source: "metrics_daily.scrolls / page_views COUNT",
    dimensions: ["day", "path", "device"],
  },
  downloads: {
    id: "downloads",
    label: "Download clicks",
    format: "int",
    definition: "File-download clicks (anchor download attr or file extension).",
    status: "available",
    source: "metrics_daily.downloads / page_views COUNT",
    dimensions: ["day", "path", "device"],
  },
  clicks: {
    id: "clicks",
    label: "Configured clicks",
    format: "int",
    definition: "Clicks on [data-ag-click] elements.",
    status: "available",
    source: "metrics_daily.clicks / page_views COUNT",
    dimensions: ["day", "path", "device"],
  },
  newUsers: {
    id: "newUsers",
    label: "New users",
    format: "int",
    definition: "Visitors never seen before the range.",
    status: "planned",
    note: "Needs cross-day visitor history lookup (Phase 3).",
  },
  conversions: {
    id: "conversions",
    label: "Conversions",
    format: "int",
    definition: "Recorded conversion events.",
    status: "excluded",
    note: "Conversion analysis is out of product scope; served only by the legacy conversions page.",
  },
  revenue: {
    id: "revenue",
    label: "Revenue",
    format: "money1",
    definition: "Sum of conversion values.",
    status: "excluded",
    note: "Out of product scope (see conversions).",
  },
};

export const DIMENSIONS: Record<DimensionId, DimensionDef> = {
  day: { id: "day", label: "Day", definition: "UTC calendar day.", status: "available", source: "metrics_daily.day" },
  path: { id: "path", label: "Page path", definition: "Tracked page path.", status: "available", source: "page_views.path" },
  channel: {
    id: "channel",
    label: "Channel",
    definition: "First-party channel from referrer + UTM (Direct, Organic Social, Campaign, Email, Referral).",
    status: "available",
    source: "classifyChannel(referrer, url) at query time",
  },
  source: {
    id: "source",
    label: "Source",
    definition: "utm_source, else referrer host, else (direct).",
    status: "available",
    source: "parseUtm(url) / referrer host",
  },
  medium: {
    id: "medium",
    label: "Medium",
    definition: "utm_medium, else channel default.",
    status: "available",
    source: "parseUtm(url) / channel default",
  },
  campaign: {
    id: "campaign",
    label: "Campaign",
    definition: "utm_campaign value, else (not set).",
    status: "available",
    source: "parseUtm(url)",
  },
  landingPage: {
    id: "landingPage",
    label: "Landing page",
    definition: "Entry path of each session: first pageview per session_hash in the window.",
    status: "available",
    source: "DISTINCT ON (session_hash) over the range window",
  },
  device: {
    id: "device",
    label: "Device",
    definition: "Desktop vs Mobile bucketed from viewport width.",
    status: "available",
    source: "page_views.viewport width bucket",
  },
  referrer: {
    id: "referrer",
    label: "Referrer",
    definition: "Raw document referrer host.",
    status: "available",
    source: "page_views.referrer",
  },
  title: {
    id: "title",
    label: "Page title",
    definition: "document.title captured on pageview into event meta.",
    status: "available",
    source: "page_views.meta->>'title'",
  },
};

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
