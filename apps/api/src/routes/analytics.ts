import { Elysia, t } from "elysia";
import { createHash } from "node:crypto";
import {
  db,
  companies,
  eq,
  getRedisClient,
  checkAnalyticsReadLimit,
  type RedisClient,
} from "@ag-ui/database";
import { getClientIp } from "./embed";
import {
  getCompanyOverview,
  getWebsiteAnalytics,
  getConversionAnalytics,
  getRealtimeSnapshot,
  getAcquisitionReport,
  getEngagementReport,
  getContentReport,
  getAudienceReport,
  getVoiceReport,
  validateReportQuery,
  REPORTS,
  withAnalyticsCache,
  cacheCounters,
  type Channel,
  buildWidgetSpec,
  getInsightsReport,
  answerQuestion,
  isCopilotFailure,
} from "@ag-ui/analytics";
import { logger } from "@ag-ui/shared";

/** Website/conversions ranges: Nd, 1..90. Anything else is a 422. */
function parseWindowDays(raw: string | undefined): number | null {
  const m = /^(1?\d?\d)d$/.exec((raw ?? "14d").trim());
  if (!m) return null;
  const n = parseInt(m[1] ?? "", 10);
  if (!Number.isFinite(n) || n < 1 || n > 90) return null;
  return n;
}

async function requireCompany(companyId: string) {
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return company ?? null;
}

type Company = NonNullable<Awaited<ReturnType<typeof requireCompany>>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RANGE_ERROR = "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)";

/**
 * The slice of Elysia's `set` we touch. Elysia allows a numeric code or a named
 * status string, so the helper signatures accept both instead of narrowing to
 * `number` (which rejects the real context type).
 */
type StatusSetter = { status?: number | string };

/**
 * Tenant resolution for every analytics route. Returns null and sets 404 when
 * the id resolves to nothing — a missing id and a foreign id look identical, so
 * tenancy never leaks existence. This is the single seam the auth/tenancy guard
 * (`packages/database/src/tenancy.ts`, see docs/auth-tenancy.md) will repoint to
 * `requireCompany`-with-ownership; route bodies stay untouched.
 */
async function tenant(companyId: string, set: StatusSetter): Promise<Company | null> {
  const company = await requireCompany(companyId);
  if (!company) set.status = 404;
  return company;
}

/**
 * Shared read path for report endpoints: cache (60s fresh / 240s SWR unless
 * overridden) around a compute fn, with one fail-500 logger and a re-throw path
 * for deliberate 4xx (e.g. widget-spec's invalid-config 400). Keeps every
 * handler a handful of lines instead of ~20 of copy-paste.
 */
async function report<T>(
  set: StatusSetter,
  company: Company,
  spec: {
    label: string;
    errorMessage: string;
    cacheKey: string;
    compute: (redis: RedisClient | null) => Promise<T>;
    fresh?: number;
    swr?: number;
  }
): Promise<T | { error: string; details?: unknown }> {
  const { label, errorMessage, cacheKey, compute, fresh = 60, swr = 240 } = spec;
  try {
    const redis = await getRedisClient();
    const { data } = await withAnalyticsCache(redis, cacheKey, fresh, swr, () => compute(redis));
    return data;
  } catch (err: any) {
    // Deliberate client errors (thrown with a 4xx status) pass through.
    if (typeof err?.status === "number" && err.status >= 400 && err.status < 500) {
      set.status = err.status;
      return { error: err.message, details: err.details };
    }
    logger.error(`[ANALYTICS] ${label} failed for ${company.id}: ${err?.message ?? err}`);
    set.status = 500;
    return { error: errorMessage };
  }
}

/**
 * Elysia's global (untyped) hook scope. Narrowed locally instead of casting the
 * whole context to `any`, so `query.companyId` and `set.headers` stay checked.
 */
interface GuardContext {
  query: Record<string, string | undefined>;
  set: { status?: number | string; headers: Record<string, string> };
  request: Request;
}

export const analyticsRoutes = new Elysia({ prefix: "/api/analytics" })
  // Instance-wide guard: malformed tenant ids fail fast (422, never a
  // uuid-syntax 500 from Postgres), then a generous read budget
  // (429 + Retry-After, fail-open when Redis is down).
  //
  // Status contract: every analytics route answers a bad request with
  // **422** and `{ error }` — the same shape and status the rest of the API
  // uses (see apps/api/src/routes/operations.ts). 400 is not used here
  // (F-04, F-05).
  .onBeforeHandle(async (ctx) => {
    const { query, set, request } = ctx as unknown as GuardContext;
    const companyId = query?.companyId;
    if (typeof companyId === "string" && !UUID_RE.test(companyId)) {
      set.status = 422;
      return { error: "companyId must be a UUID" };
    }
    // Per-tenant budget first, then the per-IP backstop (F-09).
    const limit = await checkAnalyticsReadLimit(getClientIp(request), companyId);
    if (!limit.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(limit.retryAfterSec);
      return { error: "Analytics rate limit exceeded", retryAfterSec: limit.retryAfterSec };
    }
  })
  .get(
    "/overview",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      // Same range contract as every sibling endpoint: Nd, 1..90. An
      // unrecognised range used to be silently clamped to 14 days, so
      // "range=90d" quietly answered a different question (F-04).
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      return report(set, company, {
        label: "Overview",
        errorMessage: "Overview unavailable - try again shortly",
        cacheKey: `ana:v1:overview:${company.id}:${days}d`,
        compute: () => getCompanyOverview(company.id, company.name, days),
      });
    },
    {
      query: t.Object({
        companyId: t.String(),
        range: t.Optional(t.String()),
      }),
      detail: {
        summary: "Live agent overview",
        description: "Measured demand, intent, blindspot, funnel, trust, and health metrics for a company. Same shape as the overview mock.",
      },
    }
  )
  .get(
    "/website",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      return report(set, company, {
        label: "Website",
        errorMessage: "Website analytics unavailable - try again shortly",
        cacheKey: `ana:v1:website:${company.id}:${days}d`,
        compute: (redis) => getWebsiteAnalytics(redis, company.id, days),
      });
    },
    {
      query: t.Object({
        companyId: t.String(),
        range: t.Optional(t.String()),
      }),
      detail: {
        summary: "Website traffic analytics",
        description: "Sessions, uniques, pageviews, trend, top pages, referrers, viewports from rollups + bounded raw scans.",
      },
    }
  )
  .get(
    "/conversions",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      return report(set, company, {
        label: "Conversions",
        errorMessage: "Conversion analytics unavailable - try again shortly",
        cacheKey: `ana:v1:conversions:${company.id}:${days}d`,
        compute: () => getConversionAnalytics(company.id, days),
      });
    },
    {
      query: t.Object({
        companyId: t.String(),
        range: t.Optional(t.String()),
      }),
      detail: {
        summary: "Conversion analytics",
        description: "Conversions, revenue, chat-assisted attribution, daily series, funnel.",
      },
    }
  )
  .get(
    "/realtime",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      // Short cache: thundering-herd protection for owners watching live.
      return report(set, company, {
        label: "Realtime",
        errorMessage: "Realtime snapshot unavailable - try again shortly",
        cacheKey: `ana:v1:realtime:${company.id}`,
        fresh: 15,
        swr: 15,
        compute: () => getRealtimeSnapshot(company.id),
      });
    },
    {
      query: t.Object({ companyId: t.String() }),
      detail: {
        summary: "Realtime 30-minute snapshot",
        description: "Views, sessions, and top paths in the trailing 30 minutes.",
      },
    }
  )
  .get(
    "/insights",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      return report(set, company, {
        label: "Insights",
        errorMessage: "Insights unavailable - try again shortly",
        cacheKey: `ana:v1:insights:${company.id}:${days}d`,
        compute: () => getInsightsReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Differentiating analytics",
        description: "Quality matrix, opportunity map, journey explorer, anomaly investigation. First-party only; correlations, not causes.",
      },
    }
  )
  .get(
    "/copilot",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      if (!query.question || !query.question.trim()) {
        set.status = 422;
        return { error: "question is required" };
      }
      // The cache key and the executed question are the same string. The key
      // used to be the first 200 characters while the query ran on the first
      // 500, so two questions sharing a 200-character prefix were answered
      // with each other's numbers (F-03).
      const question = query.question.trim().slice(0, 500);
      const questionHash = createHash("sha256").update(question).digest("hex").slice(0, 32);
      return report(set, company, {
        label: "Copilot",
        errorMessage: "Copilot unavailable - try again shortly",
        cacheKey: `ana:v1:copilot:${company.id}:${questionHash}`,
        compute: async (redis) => {
          const out = await answerQuestion(redis, company.id, question);
          // A rejection is an expected outcome — the question cannot be
          // answered — so it travels as a 200 envelope and the UI renders the
          // limitation. Only a genuine failure throws, and the wrapper turns
          // that into a 500. The distinction is a typed guard, not a string
          // comparison (F-18).
          if (isCopilotFailure(out)) throw new Error(out.error);
          return out;
        },
      });
    },
    {
      query: t.Object({ companyId: t.String(), question: t.String() }),
      detail: {
        summary: "Deterministic analytics copilot",
        description: "Rule-based NL questions answered from measured data only. No LLM, no invented numbers.",
      },
    }
  )
  .get(
    "/widget-spec",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const channels = (query.channels ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      const config = {
        kind: query.kind,
        report: query.report || undefined,
        table: query.table || undefined,
        rangeDays: days,
        variant: query.variant || "line",
        trendMetric: query.trendMetric || "pageviews",
        channels,
        compare: query.compare === "previous",
      };
      return report(set, company, {
        label: "Widget-spec",
        errorMessage: "Widget spec unavailable - try again shortly",
        cacheKey: `ana:v1:widget:${company.id}:${JSON.stringify(config)}`,
        compute: async (redis) => {
          const built = await buildWidgetSpec(redis, company.id, config);
          if (!built.ok) {
            const err = new Error("Invalid widget config") as Error & { status?: number; details?: unknown };
            err.status = 400;
            err.details = built.errors;
            throw err;
          }
          return built.spec;
        },
      });
    },
    {
      query: t.Object({
        companyId: t.String(),
        kind: t.String(),
        report: t.Optional(t.String()),
        table: t.Optional(t.String()),
        range: t.Optional(t.String()),
        variant: t.Optional(t.String()),
        trendMetric: t.Optional(t.String()),
        channels: t.Optional(t.String()),
        compare: t.Optional(t.String()),
      }),
      detail: {
        summary: "Validated analytics widget spec",
        description: "Renderer-ready {component, props} for Widget Studio; props conform to the genui zod schemas. First-party only.",
      },
    }
  )
  // Ops: cache hit/miss counters (proves the cache actually absorbs load).
  .get("/cache-stats", async () => {
    const redis = await getRedisClient();
    return cacheCounters(redis);
  })
  .get(
    "/acquisition",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const channels = (query.channels ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      // uniques is totals-only (HLL keys are per company-day); validate it
      // against [day] separately so its constraint doesn't veto breakdowns.
      const base = { rangeDays: days, compare: query.compare === "previous" ? "previous-period" : "off", channelFilter: channels } as const;
      const v1 = validateReportQuery({ metrics: REPORTS.acquisition.traffic.metrics, dimensions: REPORTS.acquisition.traffic.dimensions, ...base });
      const v2 = validateReportQuery({ metrics: REPORTS.acquisition.uniques.metrics, dimensions: REPORTS.acquisition.uniques.dimensions, rangeDays: days });
      const errors = [...(!v1.ok ? v1.errors : []), ...(!v2.ok ? v2.errors : [])];
      if (errors.length > 0) {
        set.status = 422;
        return { error: "Invalid acquisition query", details: errors };
      }
      const compare = query.compare === "previous";
      return report(set, company, {
        label: "Acquisition",
        errorMessage: "Acquisition analytics unavailable - try again shortly",
        cacheKey: `ana:v1:acquisition:${company.id}:${days}d:${compare ? "prev" : "off"}:${[...channels].sort().join("+") || "all"}`,
        compute: (redis) => getAcquisitionReport(redis, company.id, days, compare, channels as Channel[]),
      });
    },
    {
      query: t.Object({
        companyId: t.String(),
        range: t.Optional(t.String()),
        compare: t.Optional(t.String()),
        channels: t.Optional(t.String()),
      }),
      detail: {
        summary: "Acquisition analytics",
        description: "Sessions/users/views with previous-period comparison, channel/source/medium/campaign/landing splits. First-party only.",
      },
    }
  )
  .get(
    "/engagement",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({ metrics: REPORTS.engagement.activity.metrics, dimensions: REPORTS.engagement.activity.dimensions, rangeDays: days });
      const v2 = validateReportQuery({ metrics: REPORTS.engagement.quality.metrics, dimensions: REPORTS.engagement.quality.dimensions, rangeDays: days });
      const errors = [...(!v1.ok ? v1.errors : []), ...(!v2.ok ? v2.errors : [])];
      if (errors.length > 0) {
        set.status = 422;
        return { error: "Invalid engagement query", details: errors };
      }
      return report(set, company, {
        label: "Engagement",
        errorMessage: "Engagement analytics unavailable - try again shortly",
        cacheKey: `ana:v1:engagement:${company.id}:${days}d`,
        compute: () => getEngagementReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Engagement analytics",
        description: "Views, sessions, engaged sessions, engagement rate, bounce rate, pages per session, paths, devices. First-party only.",
      },
    }
  )
  .get(
    "/audience",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({ metrics: REPORTS.audience.profile.metrics, dimensions: REPORTS.audience.profile.dimensions, rangeDays: days });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid audience query", details: v1.errors };
      }
      return report(set, company, {
        label: "Audience",
        errorMessage: "Audience analytics unavailable - try again shortly",
        cacheKey: `ana:v1:audience:${company.id}:${days}d`,
        compute: () => getAudienceReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Audience analytics",
        description:
          "Sessions and views by device, browser, operating system and hour of day. First-party only; no country (no GeoIP source agreed).",
      },
    }
  )
  .get(
    "/content",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({ metrics: REPORTS.content.pages.metrics, dimensions: REPORTS.content.pages.dimensions, rangeDays: days });
      const v2 = validateReportQuery({ metrics: REPORTS.content.titles.metrics, dimensions: REPORTS.content.titles.dimensions, rangeDays: days });
      const errors = [...(!v1.ok ? v1.errors : []), ...(!v2.ok ? v2.errors : [])];
      if (errors.length > 0) {
        set.status = 422;
        return { error: "Invalid content query", details: errors };
      }
      return report(set, company, {
        label: "Content",
        errorMessage: "Content analytics unavailable - try again shortly",
        cacheKey: `ana:v1:content:${company.id}:${days}d`,
        compute: () => getContentReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Content analytics",
        description: "Views/sessions by page path, channel, and device. First-party only.",
      },
    }
  )
  .get(
    "/voice",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({ metrics: REPORTS.agent.voice.metrics, dimensions: REPORTS.agent.voice.dimensions, rangeDays: days });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid voice query", details: v1.errors };
      }
      return report(set, company, {
        label: "Voice",
        errorMessage: "Voice analytics unavailable - try again shortly",
        cacheKey: `ana:v1:voice:${company.id}:${days}d`,
        compute: () => getVoiceReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Voice analytics",
        description:
          "Voice calls, turns, duration and silent-call rate. Counts only: no transcript or speech content is stored.",
      },
    }
  );
