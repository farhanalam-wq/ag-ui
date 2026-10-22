/**
 * packages/shared/src/analytics-catalogue.ts
 *
 * The metric contract. One place that says what every number in the
 * analytics module is, where it comes from, what it means, and which
 * surface owns it.
 *
 * It lives here — not in the analytics package — because both sides need to
 * read it: the API validates queries against it and resolves caveat codes
 * into sentences, and the browser renders the same sentences plus the metric
 * stories. It is pure data with no imports, so it is safe in the browser
 * bundle (exported from `./client`).
 *
 * Before this file, `METRICS` was imported by exactly one module — its own
 * test — while the metric vocabulary was duplicated in several places: the
 * registry, the API routes and the web pages. This module is the single
 * source the rest of the module reads.
 *
 * The rules it holds itself to (`catalogue.test.ts`):
 *
 *   - every metric answers a business question (`story`), or it does not
 *     belong here;
 *   - every available metric has a `source` that resolves to something real
 *     — a column in the schema, a Redis key, or a derivation of other
 *     metrics;
 *   - a metric belongs to exactly one surface, and is only ever displayed
 *     on tabs of that surface;
 *   - a caveat id that is not in `CAVEATS` does not exist.
 *
 * Free-only constraint: every "available" metric must be computable from
 * what the existing snippet tag already collects. Anything needing
 * uncollected data is "planned"; anything outside product scope is
 * "excluded" — never silently faked.
 */

export type MetricStatus = "available" | "planned" | "excluded";

/** The unit a number is counted in. */
export type MetricUnit = "count" | "percent" | "ratio" | "seconds" | "currency" | "score";

/** What one unit of the number represents. */
export type MetricGrain = "visit" | "event" | "visitor" | "derived";

/** Where the number comes from, and how fresh it is. */
export type MetricFreshness = "rollup" | "live";

/** The tables a metric or dimension can point at. */
export type SourceTable =
  | "page_views"
  | "sessions"
  | "metrics_daily"
  | "metrics_hourly"
  | "conversations"
  | "messages";

/**
 * A typed pointer at the origin of a number.
 *
 * `column` is checked against the Drizzle schema by the catalogue tests, so
 * a renamed or dropped column fails the build instead of quietly producing
 * a zero.
 */
export type SourceRef =
  | { kind: "column"; table: SourceTable; column: string }
  | { kind: "redis"; key: string }
  | { kind: "derived"; of: string[] }
  | { kind: "computed"; how: string };

export interface MetricDef {
  id: string;
  label: string;
  /** How the frontend should render the raw number. */
  format: "int" | "float1" | "percent1" | "money1";
  /** The business question this metric answers. One sentence. */
  story: string;
  /** The GA4 report this mirrors; null when GA has no equivalent. */
  gaEquivalent: string | null;
  /** The surface that owns the metric. */
  surface: SurfaceId;
  /** The tab on that surface where the metric lives. */
  tab: string;
  unit: MetricUnit;
  grain: MetricGrain;
  freshness: MetricFreshness;
  /** Where the number comes from. Required for every available metric. */
  source?: SourceRef;
  /** The dataQuality codes that can ride along with this metric. */
  caveats?: CaveatId[];
  definition: string;
  status: MetricStatus;
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
  | "sourceMedium"
  | "campaign"
  | "landingPage"
  | "device"
  | "browser"
  | "os"
  | "hour"
  | "referrer"
  | "title";

/**
 * The browser taxonomy.
 *
 * One list, in the product's own words — not the parser's. `ua-parser-js`
 * names forty browsers; the product reports six, and the sixth is "other",
 * so a report never shows a browser the customer cannot act on.
 */
export const BROWSER_VALUES = ["chrome", "safari", "firefox", "edge", "opera", "other"] as const;
export type BrowserValue = (typeof BROWSER_VALUES)[number];

/** The operating-system taxonomy, same rule: six values, "other" catches the rest. */
export const OS_VALUES = ["windows", "macos", "ios", "android", "linux", "other"] as const;
export type OsValue = (typeof OS_VALUES)[number];

export interface DimensionDef {
  id: DimensionId;
  label: string;
  definition: string;
  status: MetricStatus;
  source?: SourceRef;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                             */
/* ------------------------------------------------------------------ */

export interface TabDef {
  label: string;
  /** The metrics displayed on this tab. A metric may appear on several. */
  metrics: string[];
  /** The dimensions this tab can break its metrics down by. */
  dimensions: DimensionId[];
}

export interface SurfaceDef {
  label: string;
  tabs: Record<string, TabDef>;
}

/**
 * The surfaces, and the tabs on them.
 *
 * Only the tabs that exist today are declared. The rest of the target
 * navigation (Website/Audience once P2 lands, Agent/Questions, Agent/Quality,
 * Agent/Voice, Intent Radar) is added by the phase that builds it, together
 * with the metrics it introduces.
 */
export const SURFACES = {
  website: {
    label: "Website",
    tabs: {
      overview: {
        label: "Overview",
        metrics: [
          "sessions",
          "uniques",
          "pageviews",
          "engagedSessions",
          "engagementRate",
          "bounceRate",
          "pagesPerSession",
          "avgEngagementTime",
        ],
        dimensions: ["day"],
      },
      acquisition: {
        label: "Acquisition",
        metrics: ["sessions", "uniques", "pageviews"],
        dimensions: ["day", "channel", "source", "medium", "campaign", "landingPage", "device"],
      },
      content: {
        label: "Content",
        metrics: ["pageviews", "sessions", "scrolls", "downloads", "clicks"],
        dimensions: ["day", "path", "title", "channel", "device", "referrer"],
      },
      audience: {
        label: "Audience",
        // Empty until the audience metrics land (P2).
        metrics: [],
        dimensions: ["day", "device"],
      },
    },
  },
  agent: {
    label: "Agent",
    tabs: {
      overview: {
        label: "Overview",
        metrics: ["agentSessions", "chatOpens", "chatOpenRate", "messages", "questionsPerSession"],
        dimensions: ["day"],
      },
      questions: {
        label: "Questions",
        metrics: ["messages", "questionsPerSession", "avgOpenDuration", "maxOpenDuration"],
        dimensions: ["day", "path"],
      },
      quality: {
        label: "Quality",
        metrics: [
          "groundedAnswerRate",
          "answersWithoutEvidence",
          "answerTimeP50",
          "answerTimeP95",
        ],
        dimensions: ["day", "path"],
      },
      voice: {
        label: "Voice",
        metrics: [
          "textVsVoice",
          "voiceCalls",
          "voiceTurns",
          "voiceAvgDuration",
          "voiceMaxDuration",
          "voiceAbandonedCalls",
          "voiceAbandonRate",
        ],
        dimensions: ["day"],
      },
    },
  },
  parked: {
    label: "Conversions",
    tabs: {
      conversions: {
        label: "Conversions",
        metrics: ["conversions", "revenue"],
        dimensions: ["day"],
      },
    },
  },
} as const satisfies Record<string, SurfaceDef>;

export type SurfaceId = keyof typeof SURFACES;

/* ------------------------------------------------------------------ */
/* Caveats                                                              */
/* ------------------------------------------------------------------ */

/**
 * The dataQuality codes and the sentence shown for each.
 *
 * These live here, next to the code that raises them, so a flag can never
 * ship without a sentence to show and the wording cannot drift from the
 * report that produces it.
 */
export const CAVEATS = {
  "tracking-off": 'No tracked traffic in this range. Add data-track="on" to the embed snippet.',
  "uniques-unavailable": "Unique-visitor estimates need a day of tracked traffic.",
  "uniques-unavailable-filtered": "Unique visitors cannot be split by channel.",
  sampled: "Message volume was capped at 20,000; figures are from the most recent slice.",
  "assisted-approximate": "Assisted conversions are matched on the visit, not the day — approximate.",
  "channel-overlap": "A session active in two channels counts in both.",
  "rollup-stale": "Totals are older than one rollup cycle.",
  "timezone-unavailable":
    "Some visits did not report a timezone, so those hours are shown in UTC instead of the visitor's own time.",
  "dimensions-unavailable":
    "Some events in this range were collected before the collector recorded a browser and operating system, so they are counted as Unknown.",
} as const;

export type CaveatId = keyof typeof CAVEATS;

/* ------------------------------------------------------------------ */
/* Metric groups                                                         */
/* ------------------------------------------------------------------ */

/**
 * Named groups of metrics, for code that reasons about a family rather
 * than a single metric (the API's report groups, the surfaces' KPI rows).
 */
export const GROUPS = {
  engagement: [
    "engagedSessions",
    "engagementRate",
    "bounceRate",
    "pagesPerSession",
    "avgEngagementTime",
    "scrolls",
    "downloads",
    "clicks",
  ],
} as const satisfies Record<string, readonly string[]>;

/* ------------------------------------------------------------------ */
/* The metrics                                                           */
/* ------------------------------------------------------------------ */

export const METRICS: Record<string, MetricDef> = {
  sessions: {
    id: "sessions",
    label: "Sessions",
    format: "int",
    story: "How many visits you got.",
    gaEquivalent: "Sessions",
    surface: "website",
    tab: "overview",
    unit: "count",
    grain: "visit",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "sessions" },
    definition:
      "Visits: a run of events with no gap wider than 30 minutes. One page load is not one session — a visitor who reads for an hour is one session.",
    status: "available",
    dimensions: [
      "day", "path", "channel", "source", "medium", "campaign", "landingPage",
      "device", "browser", "os", "hour", "referrer",
    ],
  },
  uniques: {
    id: "uniques",
    label: "Total users",
    format: "int",
    story: "How many distinct humans reached you.",
    gaEquivalent: "Users",
    surface: "website",
    tab: "overview",
    unit: "count",
    grain: "visitor",
    freshness: "rollup",
    source: { kind: "redis", key: "ahll:{company}:{day}" },
    caveats: ["uniques-unavailable", "uniques-unavailable-filtered"],
    definition: "Approx. distinct visitors via daily Redis HLL merged over the range.",
    status: "available",
    dimensions: ["day"],
    note: "HLL keys exist per company-day only, so uniques cannot split by channel/path yet.",
  },
  pageviews: {
    id: "pageviews",
    label: "Views",
    format: "int",
    story: "How much content was consumed.",
    gaEquivalent: "Pageviews",
    surface: "website",
    tab: "overview",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "pageviews" },
    definition: "Human pageview events. Bot traffic is flagged at write time and excluded from every report.",
    status: "available",
    dimensions: [
      "day", "path", "title", "channel", "source", "medium", "campaign", "landingPage",
      "device", "browser", "os", "hour", "referrer",
    ],
  },
  engagedSessions: {
    id: "engagedSessions",
    label: "Engaged sessions",
    format: "int",
    story: "How many visits did something rather than just land.",
    gaEquivalent: "Engaged sessions",
    surface: "website",
    tab: "overview",
    unit: "count",
    grain: "visit",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "engaged_sessions" },
    definition:
      "Sessions with 2+ pageviews or any interaction (chat, conversion, scroll, download, configured click) in the window. The rollup decides this once, per session.",
    status: "available",
    dimensions: ["day", "path", "device"],
  },
  engagementRate: {
    id: "engagementRate",
    label: "Engagement rate",
    format: "percent1",
    story: "Are visitors engaging, or leaving immediately.",
    gaEquivalent: "Engagement rate",
    surface: "website",
    tab: "overview",
    unit: "percent",
    grain: "derived",
    freshness: "rollup",
    source: { kind: "derived", of: ["engagedSessions", "sessions"] },
    definition: "Engaged sessions / sessions * 100. Both terms are the same unit — a visit.",
    status: "available",
    dimensions: ["day"],
  },
  bounceRate: {
    id: "bounceRate",
    label: "Bounce rate",
    format: "percent1",
    story: "Share of visits that never engaged.",
    gaEquivalent: "Bounce rate",
    surface: "website",
    tab: "overview",
    unit: "percent",
    grain: "derived",
    freshness: "rollup",
    source: { kind: "derived", of: ["engagedSessions", "sessions"] },
    definition: "Sessions that were not engaged / sessions * 100. The complement of engagement rate.",
    status: "available",
    dimensions: ["day"],
  },
  pagesPerSession: {
    id: "pagesPerSession",
    label: "Pages per session",
    format: "float1",
    story: "How deep a visit goes.",
    gaEquivalent: "Pages/session",
    surface: "website",
    tab: "overview",
    unit: "ratio",
    grain: "derived",
    freshness: "rollup",
    source: { kind: "derived", of: ["pageviews", "sessions"] },
    definition: "Views / sessions. The average number of pages a visitor saw in one session.",
    status: "available",
    dimensions: ["day"],
  },
  avgEngagementTime: {
    id: "avgEngagementTime",
    label: "Avg. engagement time",
    format: "float1",
    story: "How long a genuinely active visitor stays.",
    gaEquivalent: "Avg. engagement time",
    surface: "website",
    tab: "overview",
    unit: "seconds",
    grain: "visit",
    freshness: "rollup",
    source: { kind: "column", table: "sessions", column: "active_seconds" },
    definition: "Mean active seconds per session: 15s per heartbeat, capped at 30min per session.",
    status: "available",
    dimensions: ["day"],
  },
  scrolls: {
    id: "scrolls",
    label: "Scroll events",
    format: "int",
    story: "Do they move past the fold.",
    gaEquivalent: null,
    surface: "website",
    tab: "content",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "scrolls" },
    definition: "Depth-threshold (25/50/75/90%) scroll events fired once per threshold per page.",
    status: "available",
    dimensions: ["day", "path", "device"],
    note: "GA4's Scroll depth is a different metric (a percentage of a pageview), not a count of scroll events.",
  },
  downloads: {
    id: "downloads",
    label: "Download clicks",
    format: "int",
    story: "File-download intent.",
    gaEquivalent: "Events",
    surface: "website",
    tab: "content",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "downloads" },
    definition: "File-download clicks (anchor download attr or file extension).",
    status: "available",
    dimensions: ["day", "path", "device"],
  },
  clicks: {
    id: "clicks",
    label: "Configured clicks",
    format: "int",
    story: "CTA engagement.",
    gaEquivalent: "Events",
    surface: "website",
    tab: "content",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "clicks" },
    definition: "Clicks on [data-ag-click] elements.",
    status: "available",
    dimensions: ["day", "path", "device"],
  },
  chatOpens: {
    id: "chatOpens",
    label: "Widget opened",
    format: "int",
    story: "How many visitors actually open the widget, instead of never noticing it.",
    gaEquivalent: null,
    surface: "agent",
    tab: "overview",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "chat_opens" },
    definition: "chat_open events: visitor opened the chat widget.",
    status: "available",
    dimensions: ["day", "path", "channel", "source", "medium", "campaign", "device"],
  },
  messages: {
    id: "messages",
    label: "Questions asked",
    format: "int",
    story: "How much demand the agent captured.",
    gaEquivalent: null,
    surface: "agent",
    tab: "overview",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "messages" },
    definition: "chat_message events in range: one per question the visitor sent.",
    status: "available",
    note: "Counted from when the embed snippet started sending chat events; questions asked with an older snippet are not counted.",
    dimensions: ["day", "path"],
  },
  agentSessions: {
    id: "agentSessions",
    label: "Agent sessions",
    format: "int",
    story: "How many visits actually use the agent, out of all of them.",
    gaEquivalent: null,
    surface: "agent",
    tab: "overview",
    unit: "count",
    grain: "visit",
    freshness: "live",
    source: {
      kind: "computed",
      how: "distinct browser sessions with a chat_message or voice_start event, bots excluded",
    },
    definition:
      "Visits that asked the agent something or called it. Counted by browser session id, so a pause longer than 30 minutes inside one tab counts once where the Website page would count two visits.",
    status: "available",
    dimensions: ["day"],
  },
  chatOpenRate: {
    id: "chatOpenRate",
    label: "Open rate",
    format: "percent1",
    story: "How many visitors notice the widget at all — the gap between the orb and the conversation.",
    gaEquivalent: null,
    surface: "agent",
    tab: "overview",
    unit: "percent",
    grain: "derived",
    freshness: "live",
    source: { kind: "computed", how: "distinct visits with chat_open / rollup sessions × 100" },
    definition: "Share of all visits in range that opened the chat widget.",
    status: "available",
    dimensions: ["day"],
  },
  questionsPerSession: {
    id: "questionsPerSession",
    label: "Questions per session",
    format: "float1",
    story: "Is the agent a one-question lookup or a real back-and-forth.",
    gaEquivalent: null,
    surface: "agent",
    tab: "questions",
    unit: "ratio",
    grain: "derived",
    freshness: "live",
    source: { kind: "computed", how: "chat_message events / visits with at least one question" },
    definition: "Mean questions asked in a visit that asked any.",
    status: "available",
    dimensions: ["day"],
  },
  groundedAnswerRate: {
    id: "groundedAnswerRate",
    label: "Grounded answers",
    format: "percent1",
    story: "Whether an answer is backed by something the customer wrote down — the difference between an assistant and a guess.",
    gaEquivalent: null,
    surface: "agent",
    tab: "quality",
    unit: "percent",
    grain: "derived",
    freshness: "live",
    source: {
      kind: "computed",
      how: "assistant messages with ≥1 retrieved source / assistant messages × 100",
    },
    definition: "Share of answers in range that cited at least one retrieved source.",
    status: "available",
    dimensions: ["day", "path"],
  },
  answersWithoutEvidence: {
    id: "answersWithoutEvidence",
    label: "Answers without a source",
    format: "int",
    story: "The content gap the team can close: questions the agent answered with nothing retrieved.",
    gaEquivalent: null,
    surface: "agent",
    tab: "quality",
    unit: "count",
    grain: "event",
    freshness: "live",
    source: {
      kind: "computed",
      how: "assistant messages whose evidence array is null or empty",
    },
    definition: "Answers that cited no retrieved source. Not a failure count: the answer may still be correct, but it is not traceable.",
    status: "available",
    dimensions: ["day", "path"],
  },
  answerTimeP50: {
    id: "answerTimeP50",
    label: "Typical answer time",
    format: "float1",
    story: "How long a visitor waits for a typical answer before they give up.",
    gaEquivalent: null,
    surface: "agent",
    tab: "quality",
    unit: "seconds",
    grain: "derived",
    freshness: "live",
    source: {
      kind: "computed",
      how: "median of (assistant message created_at − preceding user message created_at)",
    },
    definition: "Median generation + streaming time per answer. Retrieval is excluded, because the user row is written immediately before the model call.",
    status: "available",
    dimensions: ["day"],
  },
  answerTimeP95: {
    id: "answerTimeP95",
    label: "Slow answers (p95)",
    format: "float1",
    story: "The tail a visitor actually feels: one answer in twenty is slower than this.",
    gaEquivalent: null,
    surface: "agent",
    tab: "quality",
    unit: "seconds",
    grain: "derived",
    freshness: "live",
    source: {
      kind: "computed",
      how: "95th percentile of (assistant message created_at − preceding user message created_at)",
    },
    definition: "Generation + streaming time that 95% of answers stay under. Retrieval is excluded.",
    status: "available",
    dimensions: ["day"],
  },
  avgOpenDuration: {
    id: "avgOpenDuration",
    label: "Average panel time",
    format: "int",
    story: "Whether visitors read the answer or close the panel the moment it appears.",
    gaEquivalent: null,
    surface: "agent",
    tab: "questions",
    unit: "seconds",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "average meta.durationSec over chat_close events" },
    definition: "Mean time between opening the widget and closing it.",
    status: "available",
    dimensions: ["day"],
  },
  maxOpenDuration: {
    id: "maxOpenDuration",
    label: "Longest panel time",
    format: "int",
    story: "The worst case — a panel left open by mistake or a conversation that never ended.",
    gaEquivalent: null,
    surface: "agent",
    tab: "questions",
    unit: "seconds",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "max meta.durationSec over chat_close events" },
    definition: "The longest time a widget stayed open in range.",
    status: "available",
    dimensions: ["day"],
  },
  textVsVoice: {
    id: "textVsVoice",
    label: "Voice share",
    format: "percent1",
    story: "Which modality actually wins — the rest of agent sessions typed.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "percent",
    grain: "derived",
    freshness: "live",
    source: {
      kind: "computed",
      how: "sessions with voice_start / sessions with any agent event × 100",
    },
    definition:
      "Share of agent sessions that included a voice call; the remainder asked by text. Text and voice are only comparable as sessions, never as questions against calls.",
    status: "available",
    dimensions: ["day"],
  },
  voiceCalls: {
    id: "voiceCalls",
    label: "Voice calls",
    format: "int",
    story: "How often visitors choose to talk to the agent out loud instead of typing.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "count",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "voice_start events in range, bots excluded" },
    definition: "A call that connected: the visitor joined a voice room with the agent.",
    status: "available",
    dimensions: ["day"],
    note: "Counted from when the embed snippet started sending call events; calls made with an older snippet are not counted.",
  },
  voiceTurns: {
    id: "voiceTurns",
    label: "Voice turns",
    format: "int",
    story: "How deep voice conversations actually get — a call where nobody speaks twice is a support issue.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "count",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "sum of meta.turns over voice_end events" },
    definition: "Visitor utterances in ended calls. Counts only: no transcript is stored (O-3).",
    status: "available",
    dimensions: ["day"],
  },
  voiceAvgDuration: {
    id: "voiceAvgDuration",
    label: "Average call length",
    format: "int",
    story: "Whether voice is a quick question or a real conversation, so the agent's cost and quality are visible.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "seconds",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "average meta.durationSec over voice_end events" },
    definition: "Mean connected time of ended calls. Calls that never ended in the range are excluded.",
    status: "available",
    dimensions: ["day"],
  },
  voiceMaxDuration: {
    id: "voiceMaxDuration",
    label: "Longest call",
    format: "int",
    story: "The worst case — a call that runs away is either a stuck tab or an agent that cannot close.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "seconds",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "max meta.durationSec over voice_end events" },
    definition: "The longest connected time recorded by an ended call in range.",
    status: "available",
    dimensions: ["day"],
  },
  voiceAbandonedCalls: {
    id: "voiceAbandonedCalls",
    label: "Silent calls",
    format: "int",
    story: "Calls where the visitor never said anything point at the microphone, the permission prompt, or a broken first second.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "count",
    grain: "event",
    freshness: "live",
    source: { kind: "computed", how: "voice_end events with meta.abandoned = true" },
    definition: "Ended calls with zero visitor turns: connected, but nobody spoke.",
    status: "available",
    dimensions: ["day"],
  },
  voiceAbandonRate: {
    id: "voiceAbandonRate",
    label: "Silent-call rate",
    format: "percent1",
    story: "The share of voice calls lost before they start — the one number that says whether the voice entry point works.",
    gaEquivalent: null,
    surface: "agent",
    tab: "voice",
    unit: "percent",
    grain: "derived",
    freshness: "live",
    source: { kind: "computed", how: "silent calls / calls that ended in range × 100" },
    definition: "Silent calls as a percentage of calls that ended.",
    status: "available",
    dimensions: ["day"],
  },
  newUsers: {
    id: "newUsers",
    label: "New users",
    format: "int",
    story: "Are you acquiring new people, or serving the same ones.",
    gaEquivalent: "New users",
    surface: "website",
    tab: "audience",
    unit: "count",
    grain: "visitor",
    freshness: "rollup",
    definition: "Visitors never seen before the range.",
    status: "planned",
    note: "Needs a cross-day visitor history lookup, which un-does the daily-salt privacy design (D3).",
  },
  conversions: {
    id: "conversions",
    label: "Conversions",
    format: "int",
    story: "Did anything convert.",
    gaEquivalent: "Conversions",
    surface: "parked",
    tab: "conversions",
    unit: "count",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "conversions" },
    definition: "Recorded conversion events.",
    status: "excluded",
    note: "Served only by the parked Conversions surface; excluded from the report framework.",
  },
  revenue: {
    id: "revenue",
    label: "Revenue",
    format: "money1",
    story: "What it converted into.",
    gaEquivalent: "Revenue",
    surface: "parked",
    tab: "conversions",
    unit: "currency",
    grain: "event",
    freshness: "rollup",
    source: { kind: "column", table: "metrics_daily", column: "revenue" },
    definition: "Sum of conversion values.",
    status: "excluded",
    note: "Served only by the parked Conversions surface; excluded from the report framework.",
  },
};

/* ------------------------------------------------------------------ */
/* The dimensions                                                        */
/* ------------------------------------------------------------------ */

export const DIMENSIONS: Record<DimensionId, DimensionDef> = {
  day: {
    id: "day",
    label: "Day",
    definition: "UTC calendar day.",
    status: "available",
    source: { kind: "column", table: "metrics_daily", column: "day" },
  },
  path: {
    id: "path",
    label: "Page path",
    definition: "Tracked page path.",
    status: "available",
    source: { kind: "column", table: "page_views", column: "path" },
  },
  channel: {
    id: "channel",
    label: "Channel",
    definition: "First-party channel from referrer + UTM (Direct, Organic Social, Campaign, Email, Referral).",
    status: "available",
    source: { kind: "computed", how: "channelCase() over referrer host + UTM, applied to the visit's events" },
  },
  source: {
    id: "source",
    label: "Source",
    definition: "utm_source, else referrer host, else (direct).",
    status: "available",
    source: { kind: "computed", how: "utm_source, else referrer host, else (direct)" },
  },
  medium: {
    id: "medium",
    label: "Medium",
    definition: "utm_medium, else channel default.",
    status: "available",
    source: { kind: "computed", how: "utm_medium, else the channel's default medium" },
  },
  sourceMedium: {
    id: "sourceMedium",
    label: "Source / medium",
    definition: "utm_source / utm_medium as one pair; the referrer host and channel default when untagged.",
    status: "available",
    source: { kind: "computed", how: "utm_source || ' / ' || utm_medium, else referrer host and the channel's default medium" },
  },
  campaign: {
    id: "campaign",
    label: "Campaign",
    definition: "utm_campaign value, else (not set).",
    status: "available",
    source: { kind: "computed", how: "utm_campaign, else (not set)" },
  },
  landingPage: {
    id: "landingPage",
    label: "Landing page",
    definition: "Entry path of each visit: the first pageview of the visit.",
    status: "available",
    source: { kind: "computed", how: "first pageview per visit, ordered by time" },
  },
  device: {
    id: "device",
    label: "Device",
    definition: "Desktop vs Mobile bucketed from viewport width.",
    status: "available",
    source: { kind: "computed", how: "viewport width bucket (< 768px = Mobile)" },
  },
  browser: {
    id: "browser",
    label: "Browser",
    definition: "The visitor's browser, in the product's own six-value taxonomy.",
    status: "available",
    source: { kind: "column", table: "page_views", column: "browser" },
  },
  os: {
    id: "os",
    label: "Operating system",
    definition: "The visitor's operating system, in the product's own six-value taxonomy.",
    status: "available",
    source: { kind: "column", table: "page_views", column: "os" },
  },
  hour: {
    id: "hour",
    label: "Hour of day",
    definition:
      "The hour a visit started, in the visitor's own timezone when the snippet reported one, UTC otherwise.",
    status: "available",
    source: { kind: "computed", how: "visit start hour + the visit's reported UTC offset" },
  },
  referrer: {
    id: "referrer",
    label: "Referrer",
    definition: "Raw document referrer host.",
    status: "available",
    source: { kind: "column", table: "page_views", column: "referrer" },
  },
  title: {
    id: "title",
    label: "Page title",
    definition: "document.title captured on pageview into event meta.",
    status: "available",
    source: { kind: "computed", how: "page_views.meta->>'title'" },
  },
};

/* ------------------------------------------------------------------ */
/* Reports                                                               */
/* ------------------------------------------------------------------ */

export interface ReportGroup {
  /** The metrics this group serves. */
  metrics: string[];
  /** The dimensions the group may break its metrics down by. */
  dimensions: DimensionId[];
}

/**
 * What each report endpoint serves.
 *
 * The API routes validate every request against this, so the set of metrics
 * an endpoint can return is declared once, here, instead of being a list
 * repeated in the route handler.
 */
export const REPORTS = {
  acquisition: {
    traffic: {
      metrics: ["sessions", "pageviews"],
      dimensions: ["day", "channel", "source", "medium", "campaign", "landingPage"],
    },
    uniques: {
      metrics: ["uniques"],
      dimensions: ["day"],
    },
  },
  engagement: {
    activity: {
      metrics: ["sessions", "pageviews", "engagedSessions", "scrolls", "downloads", "clicks"],
      dimensions: ["day", "path", "device"],
    },
    quality: {
      metrics: ["engagementRate", "bounceRate", "pagesPerSession", "avgEngagementTime"],
      dimensions: ["day"],
    },
  },
  content: {
    pages: {
      metrics: ["sessions", "pageviews"],
      dimensions: ["day", "path", "channel", "device"],
    },
    titles: {
      metrics: ["pageviews"],
      dimensions: ["title"],
    },
  },
  audience: {
    profile: {
      metrics: ["sessions", "pageviews"],
      dimensions: ["day", "device", "browser", "os", "hour"],
    },
  },
  agent: {
    overview: {
      metrics: ["agentSessions", "chatOpens", "chatOpenRate", "messages", "questionsPerSession"],
      dimensions: ["day"],
    },
    questions: {
      metrics: ["messages", "questionsPerSession", "avgOpenDuration", "maxOpenDuration"],
      dimensions: ["day"],
    },
    quality: {
      metrics: [
        "groundedAnswerRate",
        "answersWithoutEvidence",
        "answerTimeP50",
        "answerTimeP95",
      ],
      dimensions: ["day"],
    },
    voice: {
      metrics: [
        "textVsVoice",
        "voiceCalls",
        "voiceTurns",
        "voiceAvgDuration",
        "voiceMaxDuration",
        "voiceAbandonedCalls",
        "voiceAbandonRate",
      ],
      dimensions: ["day"],
    },
  },
} as const satisfies Record<string, Record<string, ReportGroup>>;

/* ------------------------------------------------------------------ */
/* Lookups                                                               */
/* ------------------------------------------------------------------ */

/** The metric with this id, or undefined. */
export function metricById(id: string): MetricDef | undefined {
  return METRICS[id];
}

/** The tabs of a surface, by tab id. */
export function surfaceTabs(surface: SurfaceId): Record<string, TabDef> {
  return SURFACES[surface].tabs as Record<string, TabDef>;
}

/** The metrics displayed on a tab of a surface. */
export function tabMetrics(surface: SurfaceId, tab: string): string[] {
  return surfaceTabs(surface)[tab]?.metrics ?? [];
}

/**
 * The plain-language sentence for each caveat code.
 *
 * Unknown codes are dropped rather than shown raw: a flag the product
 * cannot explain is a bug, not something to show a customer.
 */
export function caveatNotes(codes: readonly string[]): string[] {
  const out: string[] = [];
  for (const code of codes) {
    const note = CAVEATS[code as CaveatId];
    if (note) out.push(note);
  }
  return out;
}
