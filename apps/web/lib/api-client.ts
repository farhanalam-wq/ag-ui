/**
 * Centralised API Client for ag-ui (Company AI)
 * All network calls to the backend Elysia API must route through this client.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Every dashboard request must carry the session cookie. The cookie is
 * SameSite=Lax and scoped to the API origin (:3001 in dev) while the app
 * runs on :3000 — same-site, cross-origin — and `fetch` defaults to
 * `same-origin` credentials, so one wrapper injects `credentials: "include"`
 * for all call sites. The only calls on the cookie-free embed surface pass
 * through here too; the header is a no-op for them.
 */
async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { credentials: "include", ...init });
}

/** Current signed-in user shape (`/api/auth/me` and friends). */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

interface AuthResponse {
  user: AuthUser;
}

import type { WidgetThemeOverride } from "@ag-ui/shared/client";
import type { Range } from "@/lib/analytics";

/**
 * One typed error for analytics reads.
 *
 * The API answers 422 for a bad range, 404 for a company this session does
 * not own, 429 for the read budget and 500 for an upstream failure — all with
 * `{ error }`. The UI needs the status (retry, or fix the input) and, for
 * 429, the wait. A bare `Error` string cannot carry either.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: "not-found" | "invalid" | "rate-limited" | "upstream",
    message: string,
    readonly details?: unknown,
    readonly retryAfterSec?: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface CompanySummary {
  id: string;
  name: string;
  domain: string;
  url: string;
  docCount?: number;
  chunkCount?: number;
  factCount?: number;
  status?: string;
  createdAt: string;
  updatedAt?: string;
  latestSnapshot?: {
    id: string;
    version: number;
    status: string;
    pageCount: number;
  } | null;
  brand?: {
    logoUrl: string | null;
    tokens: any;
  } | null;
}

export interface DiscoveredPageItem {
  url: string;
  category: "pricing" | "product" | "docs" | "blog" | "general" | "about";
  priority: number;
  source: "llms.txt" | "sitemap" | "homepage" | "root" | "manual";
  depth: number;
}

/**
 * The freshness envelope every analytics response carries.
 *
 * `dataQuality` is the machine-readable caveat codes; `notes` is the same
 * caveats in plain language, resolved server-side from the catalogue so
 * every surface says the same thing (F-07).
 */
export interface Freshness {
  computedAt: string;
  rollupLagMinutes: number;
  live: boolean;
  dataQuality: string[];
  notes: string[];
}

export interface WebsiteBreakdownRow {
  label: string;
  pageviews: number;
}

export interface WebsiteAnalytics {
  kind: "website";
  companyId: string;
  rangeDays: number;
  /** `uniques` is absent when the HLL merge failed — never a fake zero. */
  totals: Record<string, number>;
  trend: { d: string; sessions: number; pageviews: number; engagedSessions: number }[];
  breakdowns: {
    path: WebsiteBreakdownRow[];
    referrer: WebsiteBreakdownRow[];
    viewport: WebsiteBreakdownRow[];
  };
  /** Unusual days in the window; empty when the baseline is too thin. */
  anomalies: Anomaly[];
  anomalyThresholds: { minDaily: number; z: number };
  freshness: Freshness;
}

export interface Anomaly {
  metric: "pageviews" | "sessions";
  day: string;
  observed: number;
  expected: number;
  z: number;
  direction: "spike" | "dip";
  baselineWindow: string;
  /** Correlated channel mix for that day — context, not cause. */
  context: Array<{ label: string; pageviews: number; sessions: number }>;
  note: string;
}

export interface AudienceAnalytics {
  kind: "audience";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  breakdowns: {
    device: BreakdownRow[];
    browser: BreakdownRow[];
    os: BreakdownRow[];
    hour: BreakdownRow[];
    /** Pageviews by viewport-width bucket, in bucket order (≤420 → ≥1920, unknown last). */
    viewportWidth: BreakdownRow[];
  };
  /** Share of visits that reported a timezone (0-100). */
  timezoneCoverage: number;
  freshness: Freshness;
}

/** An agent breakdown row, keyed by whatever the report measured. */
export interface AgentBreakdownRow {
  label: string;
  [metric: string]: string | number;
}

export interface AgentOverviewAnalytics {
  kind: "agent-overview";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  trend: { d: string; chatOpens: number; chatQuestions: number }[];
  freshness: Freshness;
}

export interface AgentQuestionsAnalytics {
  kind: "agent-questions";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  breakdowns: { path: AgentBreakdownRow[] };
  freshness: Freshness;
}

export interface AgentQualityAnalytics {
  kind: "agent-quality";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  trend: {
    d: string;
    answers: number;
    groundedAnswers: number;
    groundedAnswerRate: number;
  }[];
  breakdowns: { path: AgentBreakdownRow[] };
  freshness: Freshness;
}

export interface VoiceAnalytics {
  kind: "voice";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  trend: { d: string; voiceCalls: number; voiceTurns: number; voiceAvgDurationSec: number }[];
  freshness: Freshness;
}

/* ------------------------------------------------------------------ */
/* Intelligence — Intent Radar + Signals (spec §8).                     */
/* ------------------------------------------------------------------ */

export interface IntelCluster {
  /** Normalized question text — the grouping key, stable across reports. */
  key: string;
  /** The most recent original wording in the cluster, for display. */
  question: string;
  volume: number;
  conversations: number;
  /** Detected intent labels; empty means unclassified. */
  intents: string[];
  answered: number;
  grounded: number;
  /** Answered but the reply carried no evidence — the blindspot count. */
  blindspot: number;
  /** No assistant reply followed the question. */
  unanswered: number;
  /** Mean retrieval confidence of the paired replies. Null when none reported one. */
  avgSimilarity: number | null;
  firstSeen: string;
  lastSeen: string;
}

export interface IntelCompetitor {
  name: string;
  mentions: number;
  /** Up to three verbatim snippets from the conversations that mentioned it. */
  quotes: string[];
}

export interface IntelRadarAnalytics {
  kind: "intel-radar";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  /** Daily counts — questions, highIntent, blindspot, unanswered. */
  trend: { d: string; questions: number; highIntent: number; blindspot: number; unanswered: number }[];
  clusters: IntelCluster[];
  competitors: IntelCompetitor[];
  /** True when the message scan hit its cap; figures are the most recent slice. */
  scanCapped: boolean;
  freshness: Freshness;
}

export type SignalDraftStatus = "DRAFT" | "APPROVED" | "DISMISSED";

export interface SignalDraftRow {
  id: string;
  companyId: string;
  clusterKey: string;
  question: string;
  status: SignalDraftStatus;
  /** The drafted FAQ; null until generated. */
  faq: { question: string; answer: string; sources: { title: string; url: string }[] } | null;
  /** The public FAQPage JSON-LD, ready for a page's <head> or a CMS field. */
  jsonld: unknown | null;
  /** The model that produced the answer, for provenance. */
  model: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface SignalDraftList {
  drafts: SignalDraftRow[];
}

export interface SignalDraftGenerateResult {
  existing: boolean;
  draft: SignalDraftRow;
}

export interface SignalDraftRefusal {
  error: "no-source" | "insufficient-source";
  message: string;
}

export interface ConversionAnalytics {
  companyId: string;
  rangeDays: number;
  totals: {
    conversions: number;
    revenue: number;
    assistedConversions: number;
    assistedRevenue: number;
    conversionRate: number;
    revenuePerSession: number;
  };
  daily: { d: string; conversions: number; revenue: number }[];
  funnel: { stage: string; count: number; pctOfTop: number }[];
  freshness: Freshness;
}

export interface RealtimeSnapshot {
  companyId: string;
  windowMinutes: number;
  views: number;
  sessions: number;
  topPaths: { path: string; views: number }[];
}

export interface BreakdownRow {
  label: string;
  pageviews: number;
  sessions: number;
}

export interface AcquisitionAnalytics {
  kind: "acquisition";
  companyId: string;
  rangeDays: number;
  compare: "previous-period" | "off";
  totals: Record<string, number>;
  previousTotals?: Record<string, number>;
  /** Previous period's daily totals, same length as `trend`, only when compare is on. */
  previousTrend?: { d: string; pageviews: number; sessions: number }[];
  trend: { d: string; pageviews: number; sessions: number }[];
  breakdowns: {
    channel: BreakdownRow[];
    sourceMedium: BreakdownRow[];
    campaign: BreakdownRow[];
    landingPage: BreakdownRow[];
    /** Sessions per channel per day — one point per day, a key per channel, zero-filled. */
    channelTrend?: { d: string } & Record<string, string | number>[];
  };
  freshness: Freshness;
}


export interface ContentAnalytics {
  kind: "content";
  companyId: string;
  rangeDays: number;
  totals: Record<string, number>;
  breakdowns: {
    path: BreakdownRow[];
    title: BreakdownRow[];
    channel: BreakdownRow[];
    device: BreakdownRow[];
  };
  freshness: Freshness;
}


export interface DiscoveryResponse {  success: boolean;
  domain: string;
  origin: string;
  pages: DiscoveredPageItem[];
  /** Cross-host URLs dropped by manual/sitemap discovery (Task 19). */
  droppedCrossDomain?: number;
  info: {
    domain: string;
    totalUrls: number;
    durationMs: number;
    hasLlmsTxt: boolean;
    hasLlmsFull: boolean;
    robotsSitemaps: number;
    sitemapsFollowed: string[];
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    /** True when the page list was truncated to maxSitemapUrls. */
    truncated?: boolean;
  };
}

export interface IngestStreamCallbacks {
  onPhase?: (phase: string, message?: string) => void;
  onJob?: (data: { jobId: string; companyId: string; snapshotId: string }) => void;
  onProgress?: (data: {
    stage:
      | string
      | "DISCOVERING"
      | "CRAWLING"
      | "PARSING"
      | "EMBEDDING"
      | "EXTRACTING"
      | "EXTRACTING_APPEARANCE"
      | "READY";
    jobId?: string;
    companyId?: string;
    snapshotId?: string;
    crawled?: number;
    totalSelected?: number;
    docs?: number;
    failed?: number;
    skippedThin?: number;
    chunks?: number;
    facts?: number;
    message?: string;
  }) => void;
  onDone?: (result: any) => void;
  onError?: (error: { message: string }) => void;
}

export interface BrandStylesheet {
  id: string;
  companyId?: string | null;
  snapshotId?: string | null;
  status: string;
  dtcg: any;
  tailwind: string | null;
  designMd: string | null;
  wcag: any;
  raw: any;
  screenshotUrl: string | null;
  error: string | null;
  createdAt: string;
}

export interface BrandLatestResponse {
  brand: { logoUrl: string | null; tokens: any } | null;
  stylesheet: BrandStylesheet | null;
}

export interface BrandHistoryResponse {
  items: BrandStylesheet[];
}

export interface CompanyDetailResponse {
  company: CompanySummary;
  latestSnapshot?: {
    id: string;
    version: number;
    status: "QUEUED" | "CRAWLING" | "PARSING" | "INDEXING" | "READY" | "FAILED";
    totalPages: number;
    totalChunks: number;
    totalFacts: number;
    completedAt?: string;
  };
  snapshots: any[];
  brand?: {
    id: string;
    companyId: string;
    logoUrl: string | null;
    tokens: {
      style?: string;
      colors?: {
        primary?: string;
        secondary?: string;
        background?: string;
        foreground?: string;
      };
      radius?: string;
      typography?: Record<string, any>;
    };
  };
  /** Effective theme: published override merged in, via the shared resolver. Same derivation as the widget config. */
  theme?: EmbedConfig["theme"];
  /** Pristine extraction theme (published override NOT applied); studio base / "Reset to brand" reference. */
  baseTheme?: EmbedConfig["theme"];
  /** Effective theme version; `stylesheetId:hash8` when an override is published, else bare `stylesheetId`. */
  themeVersion?: string | null;
}

export interface ChatStreamPayload {
  message: string;
  conversationId?: string;
  /** Host page path (embed only), so the conversation knows where it started. */
  path?: string;
  /**
   * Cookieless visit identity (embed only, threaded from the loader query
   * params): random per-tab session id and persisting visitor id. The server
   * stores them on the conversation row so the studio can resolve visit
   * context — nothing fingerprintable travels.
   */
  session_hash?: string;
  visitor_hash?: string;
}

export interface ChatStreamEvent {
  event: "status" | "brand" | "evidence" | "delta" | "done" | "error";
  data: any;
}

export interface ChatStreamCallbacks {
  onStatus?: (data: { stage: "retrieving" | "synthesizing"; message: string }) => void;
  onBrand?: (brand: any) => void;
  onEvidence?: (evidence: any[]) => void;
  onDelta?: (delta: { text: string }) => void;
  onDone?: (summary: { conversationId?: string; messageId?: string }) => void;
  onError?: (error: { message: string }) => void;
}

export interface EmbedConfig {
  name: string;
  domain: string;
  url: string;
  status: string;
  ready: boolean;
  version: number;
  counts: { docs: number; chunks: number; facts: number };
  brand: { logoUrl: string | null; tokens: any } | null;
  /** Server-sanitized theme (mirrors WidgetTheme); prefer over mapping locally. */
  theme?: {
    primary: string;
    secondary: string;
    radius: string;
    surface: string;
    text: string;
    logoUrl: string | null;
    fullSurface: boolean;
    /** Text-on-surface >= 4.5: shell (bg + body copy) may use surface/text. */
    bodySurface?: boolean;
    /** Primary-on-surface >= 3: accents may sit on the surface. */
    accentOnSurface?: boolean;
    surfaceSource?: "wcag-best" | "tokens" | "default" | "embed-query";
  } | null;
  /** Latest READY stylesheet id; clients skip re-apply when unchanged. */
  themeVersion?: string | null;
}

export interface IssueWidgetKeyResponse {
  widgetKey: string | null;
  reused: boolean;
  id: string;
  keyPrefix: string;
  companyId: string;
  label: string;
}

export interface WidgetKeyListItem {
  id: string;
  keyPrefix: string;
  label: string;
  revoked: boolean;
  createdAt: string;
}

export interface WidgetKeyDomain {
  id: string;
  keyId: string;
  origin: string;
  includePaths: string[];
  excludePaths: string[];
  createdAt: string;
}

export interface SourceDocument {
  id: string;
  url: string;
  title: string;
  category: string;
  contentLength: number;
  preview: string;
  sourceKind: "crawl" | "upload" | "manual" | string;
  originName: string | null;
  wordCount: number;
  batchId: string | null;
  createdAt: string;
}

export interface DocumentsResponse {
  companyId: string;
  snapshotId: string;
  snapshotStatus: string;
  documents: SourceDocument[];
}

export interface UploadManifestEntry {
  filename: string;
  mime?: string;
  size: number;
  title?: string;
  wordCount?: number;
  preview?: string;
  urls?: string[];
  dropped?: number;
  error?: string;
}

export interface UploadDraft {
  batchId: string;
  status: string;
  fileCount: number;
  manifest: UploadManifestEntry[];
}

export interface EnrichmentBatch {
  id: string;
  companyId: string;
  snapshotId: string;
  minor: number;
  status: "DRAFT" | "PROCESSING" | "READY" | "FAILED" | "CANCELLED" | string;
  fileCount: number;
  docs: number;
  failed: number;
  manifest: UploadManifestEntry[];
  summary: {
    kind: string;
    added?: string[];
    pendingUrls?: string[];
    counts?: { docs: number; chunks: number; facts: number; failed: number };
  } | null;
  errorSample?: { message?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CrawlDiffEntry {
  url: string;
  title: string;
}

export interface MajorVersion {
  id: string;
  companyId: string;
  version: number;
  status: string;
  pageCount: number;
  summary: {
    kind: string;
    initial?: boolean;
    added?: CrawlDiffEntry[];
    removed?: CrawlDiffEntry[];
    changed?: CrawlDiffEntry[];
    counts?: { added: number; removed: number; changed: number; total: number };
  } | null;
  createdAt: string;
  batches: EnrichmentBatch[];
  theme: { id: string; status: string } | null;
}

export type ErrorSource =
  | "api"
  | "crawler"
  | "worker"
  | "embed"
  | "retrieval"
  | "chat"
  | "voice";

export type ErrorLevel = "error" | "warn";

export interface ErrorEventRow {
  id: string;
  level: ErrorLevel;
  source: ErrorSource;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  companyId: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

export interface ErrorListResult {
  events: ErrorEventRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface VisitorConversationRow {
  id: string;
  title: string;
  path: string | null;
  /** How the conversation was produced: "text" chat or "voice" call transcript. */
  channel?: string | null;
  createdAt: string;
  messageCount: number;
  lastMessageAt: string | null;
  ratingUp: number;
  ratingDown: number;
  device: string | null;
  browser: string | null;
  os: string | null;
}

export interface VisitorConversationFilters {
  companyId: string;
  /** ISO date/datetime. */
  since?: string;
  until?: string;
  path?: string;
  search?: string;
  rating?: 1 | -1;
  limit?: number;
  offset?: number;
}

export interface VisitorConversationListResult {
  total: number;
  conversations: VisitorConversationRow[];
}

export interface VisitorTranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  evidence: Array<{
    sourceId?: string;
    url?: string;
    pageTitle?: string;
    snippet?: string;
    type?: string;
    score?: number | null;
  }> | null;
  meta: Record<string, unknown> | null;
  rating: number | null;
}

export interface VisitorTranscriptBundle {
  company: { id: string; name: string };
  conversation: {
    id: string;
    title: string;
    path: string | null;
    /** "text" | "voice" — voice transcripts render without evidence chips. */
    channel: "text" | "voice";
    createdAt: string;
    sessionHash: string | null;
    visitorHash: string | null;
  };
  session: {
    startedAt: string | null;
    endedAt: string | null;
    pageviewCount: number | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    tzOffset: number | null;
    converted: boolean | null;
    revenue: string | null;
  } | null;
  messages: VisitorTranscriptMessage[];
}

/** One docket row (spec §9.2). Confidence 0..1 from the extractor. */
export interface VisitorLeadRow {
  id: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  /** BANT cues: {budget, authority, need, timeline} — verbatim quotes, nullable per key. */
  bant: Record<string, string | null>;
  techStack: string[];
  extraTags: string[];
  status: "NEW" | "QUALIFIED" | "CONTACTED" | "DISMISSED";
  confidence: number | null;
  firstMessage: string | null;
  conversationId: string | null;
  /** Title of the originating conversation (join in the list query). */
  conversationTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorLeadFilters {
  companyId: string;
  status?: VisitorLeadRow["status"];
  /** ILIKE over contact name/email/phone/first message. */
  search?: string;
  /** Matches a value in tech_stack or extra_tags. */
  tag?: string;
  /** ISO date/datetime. */
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

export interface VisitorLeadListResult {
  total: number;
  leads: VisitorLeadRow[];
}

export interface VisitorLeadDetail extends VisitorLeadRow {
  conversation: { id: string; title: string; path: string | null } | null;
}

export interface VisitorLeadDetailResult {
  company: { id: string; name: string };
  lead: VisitorLeadDetail;
}

export interface ErrorFilters {
  companyId: string;
  source?: ErrorSource;
  level?: ErrorLevel;
  /** ISO date/datetime. */
  since?: string;
  /** Message or route substring. */
  q?: string;
  /** Matches `context.jobId`. */
  jobId?: string;
  limit?: number;
  offset?: number;
}

export type ActivityKind = "crawl_job" | "snapshot";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  companyId: string;
  companyName: string;
  status: string;
  /** ISO timestamp of the state transition. */
  at: string;
  detail: Record<string, unknown>;
}

export interface ActivityListResult {
  events: ActivityEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface ActivityFilters {
  companyId: string;
  status?: string;
  kind?: ActivityKind;
  /** ISO date/datetime. */
  since?: string;
  /** Company-name substring. */
  q?: string;
  limit?: number;
  offset?: number;
}

/** Build a query string, omitting empty values so the API sees no filter. */
function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  return search.toString();
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Analytics read: the one place an analytics failure becomes an ApiError.
   *
   * Every analytics method goes through here, so status, server message and
   * the rate-limit hint reach the caller the same way — and a new endpoint
   * cannot invent its own error string.
   */
  private async analyticsRequest<T>(path: string): Promise<T> {
    const res = await authedFetch(`${this.baseUrl}${path}`);
    if (res.ok) return (await res.json()) as T;
    let body: { error?: string; details?: unknown } | null = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    const message =
      body?.error ??
      (res.status === 404 ? "Company not found" : `Analytics request failed: HTTP ${res.status}`);
    throw new ApiError(
      res.status,
      res.status === 404
        ? "not-found"
        : res.status === 422
          ? "invalid"
          : res.status === 429
            ? "rate-limited"
            : "upstream",
      message,
      body?.details,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    );
  }

  /** Single fetch primitive for newer endpoints. Throws on non-2xx. */
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await authedFetch(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      let detail = "";
      try {
        detail = (await res.text()).slice(0, 200);
      } catch {
        /* ignore */
      }
      throw new Error(
        `Request failed: HTTP ${res.status}${detail ? ` - ${detail}` : ""}`
      );
    }
    return (await res.json()) as T;
  }

  /**
   * Intelligence read/write: same error surface as analyticsRequest, plus a
   * method/body, plus refusal bodies (`no-source`, `insufficient-source`)
   * carried as the ApiError message — a refusal is an answer the UI shows,
   * not a stack trace.
   */
  private async intelligenceRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await authedFetch(`${this.baseUrl}${path}`, init);
    if (res.ok) return (await res.json()) as T;
    let body: { error?: string; message?: string; details?: unknown } | null = null;
    try {
      body = await res.json();
    } catch {
      /* not JSON */
    }
    const retryAfter = Number(res.headers.get("retry-after"));
    throw new ApiError(
      res.status,
      res.status === 422
        ? "invalid"
        : res.status === 404
          ? "not-found"
          : res.status === 429
            ? "rate-limited"
            : "upstream",
      body?.message ?? body?.error ?? `Intelligence request failed: HTTP ${res.status}`,
      body?.details,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
    );
  }

  /**
   * Auth endpoints. The API sets/clears the `ag_session` cookie itself, so the
   * client only serializes the body; credentials are included by `authedFetch`.
   * Errors surface with the API's `{ error }` message whenever present —
   * including the intentionally generic 401 for wrong credentials.
   */
  authRegister = async (input: {
    email: string;
    password: string;
    name?: string;
  }): Promise<AuthResponse> => {
    const res = await authedFetch(`${this.baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.error || `Registration failed: HTTP ${res.status}`
      );
    }
    return data as AuthResponse;
  };

  authLogin = async (input: { email: string; password: string }): Promise<AuthResponse> => {
    const res = await authedFetch(`${this.baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error || `Login failed: HTTP ${res.status}`);
    }
    return data as AuthResponse;
  };

  authLogout = async (): Promise<void> => {
    const res = await authedFetch(`${this.baseUrl}/api/auth/logout`, {
      method: "POST",
    });
    if (!res.ok) {
      throw new Error(`Logout failed: HTTP ${res.status}`);
    }
  };

  /** Resolves the session user, or `null` for 401 (logged out / expired). */
  authMe = async (): Promise<AuthUser | null> => {
    const res = await authedFetch(`${this.baseUrl}/api/auth/me`);
    if (res.status === 401) return null;
    if (!res.ok) {
      throw new Error(`Session check failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as AuthResponse;
    return data.user;
  };

  /** Google OAuth begins on the API (it owns the state cookie + redirect). */
  get googleStartUrl(): string {
    return `${this.baseUrl}/api/auth/google/start`;
  }

  /**
   * Health check endpoint
   */
  async health(): Promise<{ status: string; service: string }> {
    const res = await authedFetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Health check failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Companies endpoints
   */
  companies = {
    list: async (): Promise<CompanySummary[]> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies`);
      if (!res.ok) {
        throw new Error(`Failed to list companies: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.companies || [];
    },

    get: async (id: string): Promise<CompanyDetailResponse> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to get company ${id}: HTTP ${res.status}`);
      }
      return res.json();
    },

    create: async (
      url: string
    ): Promise<{
      success?: boolean;
      companyId: string;
      version: number;
      domain?: string;
      status?: string;
      snapshotId?: string;
    }> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to create company: HTTP ${res.status} - ${errText}`);
      }
      return res.json();
    },

    getFacts: async (id: string): Promise<any[]> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/facts`);
      if (!res.ok) {
        throw new Error(`Failed to get company facts: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.facts || [];
    },

    getChunks: async (id: string): Promise<any[]> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/chunks`);
      if (!res.ok) {
        throw new Error(`Failed to get company chunks: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.chunks || [];
    },

    getDocuments: async (id: string): Promise<DocumentsResponse> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/documents`);
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        throw new Error(`Failed to get company documents: HTTP ${res.status}`);
      }
      return res.json();
    },

    getVersions: async (id: string): Promise<{ companyId: string; versions: MajorVersion[] }> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/versions`);
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        throw new Error(`Failed to get version timeline: HTTP ${res.status}`);
      }
      return res.json();
    },

    /** Published (studio) widget theme override for a company, if any. */
    getWidgetTheme: async (
      id: string
    ): Promise<{ override: WidgetThemeOverride | null; updatedAt: string | null }> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/widget-theme`);
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        throw new Error(`Failed to get widget theme: HTTP ${res.status}`);
      }
      return res.json();
    },

    /** Publish (upsert) a company's widget theme override. */
    publishWidgetTheme: async (
      id: string,
      override: WidgetThemeOverride
    ): Promise<{ override: WidgetThemeOverride; updatedAt: string; themeVersion: string | null }> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/widget-theme`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override }),
      });
      if (res.status === 404) throw new Error("Company not found");
      if (res.status === 422) throw new Error("Invalid theme override");
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to publish theme: HTTP ${res.status} - ${errText}`);
      }
      return res.json();
    },

    /** Discard a company's published widget theme override (revert to brand). */
    discardWidgetTheme: async (id: string): Promise<{ deleted: boolean }> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${id}/widget-theme`, {
        method: "DELETE",
      });
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        throw new Error(`Failed to discard theme: HTTP ${res.status}`);
      }
      return res.json();
    },
  };

  /**
   * Analytics endpoints (live measured metrics; same shapes as web mocks)
   */
  analytics = {
    overview: (
      companyId: string,
      range: Range = "14d"
    ): Promise<import("@/mocks/overview").OverviewMock> =>
      this.analyticsRequest(
        `/api/analytics/overview?companyId=${encodeURIComponent(companyId)}&range=${range}`
      ),

    website: (companyId: string, range = "30d"): Promise<WebsiteAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/website?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    conversions: (companyId: string, range = "30d"): Promise<ConversionAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/conversions?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    realtime: (companyId: string): Promise<RealtimeSnapshot> =>
      this.analyticsRequest(`/api/analytics/realtime?companyId=${encodeURIComponent(companyId)}`),

    acquisition: (
      companyId: string,
      range = "30d",
      opts?: { compare?: boolean; channels?: string[] }
    ): Promise<AcquisitionAnalytics> => {
      const q = new URLSearchParams({ companyId, range });
      if (opts?.compare) q.set("compare", "previous");
      if (opts?.channels?.length) q.set("channels", opts.channels.join(","));
      return this.analyticsRequest(`/api/analytics/acquisition?${q.toString()}`);
    },

    agentOverview: (
      companyId: string,
      range = "14d"
    ): Promise<AgentOverviewAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/agent/overview?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    agentQuestions: (
      companyId: string,
      range = "14d"
    ): Promise<AgentQuestionsAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/agent/questions?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    agentQuality: (
      companyId: string,
      range = "14d"
    ): Promise<AgentQualityAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/agent/quality?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    agentVoice: (companyId: string, range = "14d"): Promise<VoiceAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/agent/voice?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    content: (companyId: string, range = "30d"): Promise<ContentAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/content?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    audience: (companyId: string, range = "30d"): Promise<AudienceAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/audience?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),
  };

  /**
   * Intelligence endpoints (spec §8): the Intent Radar read + the Signals
   * draft lifecycle. Draft generation is an on-demand, human-triggered LLM
   * call; refusals (no-source / insufficient-source) arrive as ApiErrors
   * whose message is display-ready.
   */
  intelligence = {
    radar: (companyId: string, range = "14d"): Promise<IntelRadarAnalytics> =>
      this.analyticsRequest(
        `/api/analytics/intel/radar?companyId=${encodeURIComponent(companyId)}&range=${encodeURIComponent(range)}`
      ),

    drafts: (companyId: string): Promise<SignalDraftList> =>
      this.analyticsRequest(`/api/analytics/intel/drafts?companyId=${encodeURIComponent(companyId)}`),

    generateDraft: async (
      companyId: string,
      clusterKey: string,
      question: string
    ): Promise<SignalDraftGenerateResult> =>
      this.intelligenceRequest(`/api/analytics/intel/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, clusterKey, question }),
      }),

    setDraftStatus: async (
      companyId: string,
      draftId: string,
      status: SignalDraftStatus
    ): Promise<{ draft: SignalDraftRow }> =>
      this.intelligenceRequest(
        `/api/analytics/intel/drafts/${encodeURIComponent(draftId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, status }),
        }
      ),
  };

  /**
   * Visitors reads: conversation index + transcript bundles (spec §9.1),
   * lead docket + status pipeline (spec §9.2). Illegal status moves are a
   * 422 from the API — surfaced as a thrown, display-ready error.
   */
  visitors = {
    conversations: async (filters: VisitorConversationFilters): Promise<VisitorConversationListResult> => {
      const qs = toQuery({ ...filters });
      return this.request(`/api/visitors/conversations${qs ? `?${qs}` : ""}`);
    },

    conversation: async (conversationId: string): Promise<VisitorTranscriptBundle> => {
      return this.request(`/api/visitors/conversations/${encodeURIComponent(conversationId)}`);
    },

    leads: async (filters: VisitorLeadFilters): Promise<VisitorLeadListResult> => {
      const qs = toQuery({ ...filters });
      return this.request(`/api/visitors/leads${qs ? `?${qs}` : ""}`);
    },

    lead: async (leadId: string): Promise<VisitorLeadDetailResult> => {
      return this.request(`/api/visitors/leads/${encodeURIComponent(leadId)}`);
    },

    updateLead: async (
      leadId: string,
      status: VisitorLeadRow["status"]
    ): Promise<{ lead: VisitorLeadRow }> => {
      return this.request(`/api/visitors/leads/${encodeURIComponent(leadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
  };

  /**
   * Operations reads: captured errors + the derived activity trail.
   */
  operations = {
    errors: async (filters: ErrorFilters): Promise<ErrorListResult> => {
      const qs = toQuery({ ...filters });
      return this.request(`/api/operations/errors${qs ? `?${qs}` : ""}`);
    },

    activity: async (filters: ActivityFilters): Promise<ActivityListResult> => {
      const qs = toQuery({ ...filters });
      return this.request(`/api/operations/activity${qs ? `?${qs}` : ""}`);
    },
  };

  /**
   * Enrichment upload endpoints (Knowledge -> Sources)
   */
  uploads = {
    list: async (companyId: string): Promise<EnrichmentBatch[]> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/companies/${encodeURIComponent(companyId)}/uploads`
      );
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        throw new Error(`Failed to list upload batches: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.batches || [];
    },

    create: async (companyId: string, files: File[]): Promise<UploadDraft> => {
      const form = new FormData();
      for (const file of files) form.append("files", file);
      const res = await authedFetch(
        `${this.baseUrl}/api/companies/${encodeURIComponent(companyId)}/uploads`,
        { method: "POST", body: form }
      );
      if (res.status === 404) throw new Error("Company not found");
      if (res.status === 409) throw new Error("Company indexing — try again shortly");
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new Error(
          retryAfter ? `Slow down — retry in ${retryAfter}s` : "Slow down — too many requests"
        );
      }
      if (res.status === 413) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Files exceed size limits");
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Upload failed (${res.status}): ${errText}`);
      }
      return res.json();
    },

    confirm: async (companyId: string, batchId: string): Promise<{ batchId: string; status: string }> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/companies/${encodeURIComponent(companyId)}/uploads/${encodeURIComponent(batchId)}/confirm`,
        { method: "POST" }
      );
      if (res.status === 404) throw new Error("Batch not found");
      if (res.status === 409) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Batch is no longer processable");
      }
      if (!res.ok) {
        throw new Error(`Failed to confirm batch: HTTP ${res.status}`);
      }
      return res.json();
    },

    cancel: async (companyId: string, batchId: string): Promise<{ batchId: string; status: string }> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/companies/${encodeURIComponent(companyId)}/uploads/${encodeURIComponent(batchId)}`,
        { method: "DELETE" }
      );
      if (res.status === 404) throw new Error("Batch not found");
      if (!res.ok) {
        throw new Error(`Failed to cancel batch: HTTP ${res.status}`);
      }
      return res.json();
    },

    deleteDocuments: async (
      companyId: string,
      documentIds: string[]
    ): Promise<{ batchId: string; status: string; minor: number; removed: number }> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/companies/${encodeURIComponent(companyId)}/uploads/documents/delete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentIds }),
        }
      );
      if (res.status === 404) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "No matching live documents");
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Delete failed (${res.status}): ${errText}`);
      }
      return res.json();
    },

    rollback: async (
      companyId: string,
      targetMajor: number,
      targetMinor?: number
    ): Promise<{ batchId: string; status: string; minor: number; restored: number; tombstoned: number }> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/companies/${encodeURIComponent(companyId)}/uploads/rollback`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetMajor, targetMinor }),
        }
      );
      if (res.status === 404) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Target version not found");
      }
      if (res.status === 409) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Nothing to change");
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Rollback failed (${res.status}): ${errText}`);
      }
      return res.json();
    },
  };

  /**
   * Streaming Chat SSE endpoint
   */
  chat = {
    stream: async (
      companyId: string,
      payload: ChatStreamPayload,
      callbacks: ChatStreamCallbacks,
      signal?: AbortSignal
    ): Promise<void> => {
      const res = await authedFetch(`${this.baseUrl}/api/companies/${companyId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Chat API failed (${res.status}): ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not a readable stream");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          let eventType = "message";
          let eventDataString = "";

          const lines = trimmed.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventDataString = line.replace("data:", "").trim();
            }
          }

          if (!eventDataString) continue;

          try {
            const parsed = JSON.parse(eventDataString);
            let actualEvent = eventType;
            let actualData = parsed;

            // Support Elysia generator envelope: { event: "...", data: ... }
            if (parsed && typeof parsed === "object" && "event" in parsed && "data" in parsed) {
              actualEvent = parsed.event;
              actualData = parsed.data;
            }

            if (actualEvent === "status") {
              callbacks.onStatus?.(actualData);
            } else if (actualEvent === "brand") {
              callbacks.onBrand?.(actualData);
            } else if (actualEvent === "evidence") {
              callbacks.onEvidence?.(Array.isArray(actualData) ? actualData : []);
            } else if (actualEvent === "delta") {
              callbacks.onDelta?.(actualData);
            } else if (actualEvent === "done") {
              callbacks.onDone?.(actualData);
            } else if (actualEvent === "error") {
              callbacks.onError?.(actualData);
            }
          } catch {
            // Ignore malformed partial chunks
          }
        }
      }
    },
  };

  /**
   * Embed endpoints (opaque widget-key surface — never company ids)
   */
  embed = {
    baseFor: (customBase?: string): string => {
      if (customBase && customBase.trim()) return customBase.trim().replace(/\/$/, "");
      return this.baseUrl;
    },

    getConfig: async (widgetKey: string, customBase?: string): Promise<EmbedConfig> => {
      const base = this.embed.baseFor(customBase);
      const res = await authedFetch(`${base}/api/embed/${encodeURIComponent(widgetKey)}/config`);
      if (res.status === 404) throw new Error("Assistant offline - widget key not found");
      if (res.status === 410) throw new Error("This assistant was disabled");
      if (!res.ok) {
        let serverMessage: string | null = null;
        try {
          const body = await res.json();
          if (body && typeof body.error === "string" && body.error.trim()) {
            serverMessage = body.error;
          }
        } catch {
          // non-JSON body, fall through to status copy below
        }
        if (serverMessage) throw new Error(serverMessage);
        if (res.status === 503) throw new Error("Assistant unavailable - try again shortly");
        throw new Error(`Failed to load assistant: HTTP ${res.status}`);
      }
      return res.json();
    },

    issueKey: async (companyId: string, label = "default"): Promise<IssueWidgetKeyResponse> => {
      const res = await authedFetch(`${this.baseUrl}/api/embed/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, label }),
      });
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to issue widget key: HTTP ${res.status} - ${errText}`);
      }
      return res.json();
    },

    listKeys: async (companyId: string): Promise<WidgetKeyListItem[]> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/embed/keys?companyId=${encodeURIComponent(companyId)}`
      );
      if (res.status === 404) throw new Error("Company not found");
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to list widget keys: HTTP ${res.status} - ${errText}`);
      }
      const data = await res.json();
      return data.keys || [];
    },

    revokeKey: async (keyId: string): Promise<{ deleted: boolean }> => {
      const res = await authedFetch(`${this.baseUrl}/api/embed/keys/${encodeURIComponent(keyId)}/revoke`, {
        method: "POST",
      });
      if (res.status === 404) throw new Error("Widget key not found");
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to revoke widget key: HTTP ${res.status} - ${errText}`);
      }
      return res.json();
    },

    listDomains: async (keyId: string): Promise<WidgetKeyDomain[]> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/embed/keys/${encodeURIComponent(keyId)}/domains`
      );
      if (res.status === 404) throw new Error("Widget key not found");
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to list domains: HTTP ${res.status} - ${errText}`);
      }
      const data = await res.json();
      return data.domains || [];
    },

    addDomain: async (
      keyId: string,
      payload: { origin: string; includePaths?: string[]; excludePaths?: string[] }
    ): Promise<WidgetKeyDomain> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/embed/keys/${encodeURIComponent(keyId)}/domains`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (res.status === 404) throw new Error("Widget key not found");
      if (res.status === 409) throw new Error("This origin is already allowlisted for this key");
      if (res.status === 422) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Origin limit reached for this key");
      }
      if (res.status === 400) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Invalid origin");
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to add domain: HTTP ${res.status} - ${errText}`);
      }
      const data = await res.json();
      return data.domain;
    },

    removeDomain: async (id: string): Promise<{ removed: boolean }> => {
      const res = await authedFetch(`${this.baseUrl}/api/embed/domains/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (res.status === 404) throw new Error("Allowed origin not found");
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to remove domain: HTTP ${res.status} - ${errText}`);
      }
      return res.json();
    },

    streamChat: async (
      widgetKey: string,
      payload: ChatStreamPayload,
      callbacks: ChatStreamCallbacks,
      signal?: AbortSignal,
      customBase?: string
    ): Promise<void> => {
      const base = this.embed.baseFor(customBase);
      const res = await authedFetch(`${base}/api/embed/${encodeURIComponent(widgetKey)}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });

      if (res.status === 404) throw new Error("Assistant offline — widget key not found");
      if (res.status === 410) throw new Error("This assistant was disabled");
      if (res.status === 409) throw new Error("Company indexing — try again shortly");
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        throw new Error(
          retryAfter ? `Slow down — retry in ${retryAfter}s` : "Slow down — too many requests"
        );
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Embed chat failed (${res.status}): ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Response body is not a readable stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          let eventType = "message";
          let eventDataString = "";

          const lines = trimmed.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventDataString = line.replace("data:", "").trim();
            }
          }

          if (!eventDataString) continue;

          try {
            const parsed = JSON.parse(eventDataString);
            let actualEvent = eventType;
            let actualData = parsed;

            // Support Elysia generator envelope: { event: "...", data: ... }
            if (parsed && typeof parsed === "object" && "event" in parsed && "data" in parsed) {
              actualEvent = parsed.event;
              actualData = parsed.data;
            }

            if (actualEvent === "status") {
              callbacks.onStatus?.(actualData);
            } else if (actualEvent === "brand") {
              callbacks.onBrand?.(actualData);
            } else if (actualEvent === "evidence") {
              callbacks.onEvidence?.(Array.isArray(actualData) ? actualData : []);
            } else if (actualEvent === "delta") {
              callbacks.onDelta?.(actualData);
            } else if (actualEvent === "done") {
              callbacks.onDone?.(actualData);
            } else if (actualEvent === "error") {
              callbacks.onError?.(actualData);
            }
          } catch {
            // Ignore malformed partial chunks
          }
        }
      }
    },

    /**
     * Thumbs rating intake (POST /api/embed/:key/rate). Key-scoped: the
     * server resolves the company from the key row, so the visitor surface
     * needs no credentials. No credentials here either — the payload rides
     * on the opaque key in the URL.
     */
    rateMessage: async (
      widgetKey: string,
      payload: { conversation_id: string; message_id: string; rating: 1 | -1 },
      customBase?: string
    ): Promise<void> => {
      const base = this.embed.baseFor(customBase);
      const res = await authedFetch(`${base}/api/embed/${encodeURIComponent(widgetKey)}/rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`Rate request failed (HTTP ${res.status})`);
      }
    },
  };

  /**
   * Brand / Appearance endpoints (Phase 1 track C, frontend only)
   */
  brand = {
    getLatest: async (companyId: string): Promise<BrandLatestResponse> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/brand/${encodeURIComponent(companyId)}/latest`
      );
      if (res.status === 404) return { brand: null, stylesheet: null };
      if (!res.ok) {
        throw new Error(`Failed to get brand latest: HTTP ${res.status}`);
      }
      return res.json();
    },

    getHistory: async (companyId: string): Promise<BrandHistoryResponse> => {
      const res = await authedFetch(
        `${this.baseUrl}/api/brand/${encodeURIComponent(companyId)}/history`
      );
      if (res.status === 404) return { items: [] };
      if (!res.ok) {
        throw new Error(`Failed to get brand history: HTTP ${res.status}`);
      }
      return res.json();
    },

    retry: async (
      companyId: string,
      snapshotId?: string,
      origin?: string
    ): Promise<{ queued: boolean }> => {
      const res = await authedFetch(`${this.baseUrl}/api/brand/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, snapshotId, origin }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Brand retry failed (${res.status}): ${errText}`);
      }
      return res.json();
    },
  };

  /**
   * Crawler endpoints (Discovery & SSE Streaming Ingestion)
   */
  crawler = {
    discover: async (
      url: string,
      options?: { maxSitemaps?: number; maxSitemapUrls?: number }
    ): Promise<DiscoveryResponse> => {
      const res = await authedFetch(`${this.baseUrl}/api/crawler/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...options }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.details || `Discovery failed: HTTP ${res.status}`);
      }
      return res.json();
    },

    discoverSitemap: async (form: FormData): Promise<DiscoveryResponse> => {
      const res = await authedFetch(`${this.baseUrl}/api/crawler/discover-sitemap`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.details || `Discovery failed: HTTP ${res.status}`);
      }
      return res.json();
    },

    getJobStatus: async (
      jobId: string
    ): Promise<{
      job: {
        id: string;
        companyId: string;
        snapshotId: string;
        status: string;
        selected: number;
        crawled: number;
        docs: number;
        failed: number;
        errorSample?: any[];
      };
      snapshot?: {
        id: string;
        version: number;
        status: string;
        pageCount: number;
      } | null;
    }> => {
      const res = await authedFetch(`${this.baseUrl}/api/crawler/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error(`Failed to get crawl job ${jobId}: HTTP ${res.status}`);
      }
      return res.json();
    },

    getLatestStatus: async (
      domain: string
    ): Promise<{
      company: CompanySummary;
      job?: {
        id: string;
        companyId: string;
        snapshotId: string;
        status: string;
        selected: number;
        crawled: number;
        docs: number;
        failed: number;
        errorSample?: any[];
      } | null;
      snapshot?: {
        id: string;
        version: number;
        status: string;
        pageCount: number;
      } | null;
      brand?: {
        logoUrl: string | null;
        tokens: any;
      } | null;
    }> => {
      const res = await authedFetch(`${this.baseUrl}/api/crawler/status/${encodeURIComponent(domain)}`);
      if (!res.ok) {
        throw new Error(`Failed to get status for domain ${domain}: HTTP ${res.status}`);
      }
      return res.json();
    },
    ingestStream: async (
      payload: {
        url: string;
        selectedUrls?: string[];
        select?: string;
        fetchConcurrency?: number;
        parseConcurrency?: number;
        embedConcurrency?: number;
        hostGapMs?: number;
      },
      callbacks: IngestStreamCallbacks,
      signal?: AbortSignal
    ): Promise<void> => {
      const res = await authedFetch(`${this.baseUrl}/api/crawler/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Ingestion request failed: HTTP ${res.status} - ${errorText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable response stream received");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;

          const lines = part.split("\n");
          let eventType = "message";
          let eventDataString = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventDataString = line.replace("data:", "").trim();
            }
          }

          if (!eventDataString) continue;

          try {
            const parsed = JSON.parse(eventDataString);
            let actualEvent = eventType;
            let actualData = parsed;

            if (parsed && typeof parsed === "object" && "event" in parsed && "data" in parsed) {
              actualEvent = parsed.event;
              actualData = parsed.data;
            }

            if (actualEvent === "ping") {
              // Heartbeat keep-alive ping - connection is healthy
            } else if (actualEvent === "phase") {
              callbacks.onPhase?.(actualData.phase, actualData.message);
            } else if (actualEvent === "job") {
              callbacks.onJob?.(actualData);
            } else if (actualEvent === "progress") {
              callbacks.onProgress?.(actualData);
            } else if (actualEvent === "done") {
              callbacks.onDone?.(actualData);
            } else if (actualEvent === "error") {
              callbacks.onError?.(actualData);
            }
          } catch {
            // Ignore malformed chunks
          }
        }
      }
    },
  };
}

export const apiClient = new ApiClient();
