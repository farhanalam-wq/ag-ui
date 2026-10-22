import { Elysia, t } from "elysia";
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
  getWebsiteReport,
  getConversionAnalytics,
  getRealtimeSnapshot,
  getAcquisitionReport,
  getContentReport,
  getAudienceReport,
  getVoiceReport,
  getAgentReport,
  getAgentOverview,
  getAgentQuestions,
  getAgentQualityReport,
  validateReportQuery,
  REPORTS,
  withAnalyticsCache,
  cacheCounters,
  type Channel,
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
 * for deliberate 4xx. Keeps every
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
    const { data, cache } = await withAnalyticsCache(redis, cacheKey, fresh, swr, () => compute(redis));
    // Prove the cache in the response: a hit, a miss, or a stale read that is
    // refreshing in the background. Nothing else in the payload says which.
    set.headers["x-analytics-cache"] = cache.toUpperCase();
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
        cacheKey: `ana:v3:overview:${company.id}:${days}d`,
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
      const v1 = validateReportQuery({
        metrics: REPORTS.website.overview.metrics,
        dimensions: REPORTS.website.overview.dimensions,
        rangeDays: days,
      });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid website query", details: v1.errors };
      }
      return report(set, company, {
        label: "Website",
        errorMessage: "Website analytics unavailable - try again shortly",
        cacheKey: `ana:v3:website:${company.id}:${days}d`,
        compute: (redis) => getWebsiteReport(redis, company.id, days),
      });
    },
    {
      query: t.Object({
        companyId: t.String(),
        range: t.Optional(t.String()),
      }),
      detail: {
        summary: "Website traffic analytics",
        description:
          "Sessions, uniques, pageviews, engagement totals and trend from the rollup; top paths, referrers and viewports from bounded raw scans.",
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
        cacheKey: `ana:v3:conversions:${company.id}:${days}d`,
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
        cacheKey: `ana:v3:realtime:${company.id}`,
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
        cacheKey: `ana:v3:acquisition:${company.id}:${days}d:${compare ? "prev" : "off"}:${[...channels].sort().join("+") || "all"}`,
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
        cacheKey: `ana:v3:audience:${company.id}:${days}d`,
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
    "/agent",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({ metrics: REPORTS.agent.overview.metrics, dimensions: REPORTS.agent.overview.dimensions, rangeDays: days });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid agent query", details: v1.errors };
      }
      return report(set, company, {
        label: "Agent",
        errorMessage: "Agent analytics unavailable - try again shortly",
        cacheKey: `ana:v3:agent:${company.id}:${days}d`,
        compute: () => getAgentReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Agent analytics",
        description:
          "Agent sessions, widget opens and open rate, questions per session, panel duration, and the text-vs-voice share. Counts only; question text is never stored.",
      },
    }
  )
  .get(
    "/agent/overview",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({
        metrics: REPORTS.agent.overview.metrics,
        dimensions: REPORTS.agent.overview.dimensions,
        rangeDays: days,
      });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid agent overview query", details: v1.errors };
      }
      return report(set, company, {
        label: "Agent overview",
        errorMessage: "Agent analytics unavailable - try again shortly",
        cacheKey: `ana:v3:agent-overview:${company.id}:${days}d`,
        compute: () => getAgentOverview(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Agent overview",
        description:
          "Agent sessions, widget opens and open rate, questions and questions per session. Counts only; question text is never stored.",
      },
    }
  )
  .get(
    "/agent/questions",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({
        metrics: REPORTS.agent.questions.metrics,
        dimensions: REPORTS.agent.questions.dimensions,
        rangeDays: days,
      });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid agent questions query", details: v1.errors };
      }
      return report(set, company, {
        label: "Agent questions",
        errorMessage: "Agent analytics unavailable - try again shortly",
        cacheKey: `ana:v3:agent-questions:${company.id}:${days}d`,
        compute: () => getAgentQuestions(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Agent questions",
        description:
          "Questions asked, questions per session, average and longest panel time, and questions by page. Counts only.",
      },
    }
  )
  .get(
    "/agent/quality",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({
        metrics: REPORTS.agent.quality.metrics,
        dimensions: REPORTS.agent.quality.dimensions,
        rangeDays: days,
      });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid agent quality query", details: v1.errors };
      }
      return report(set, company, {
        label: "Agent quality",
        errorMessage: "Agent quality unavailable - try again shortly",
        cacheKey: `ana:v3:agent-quality:${company.id}:${days}d`,
        compute: () => getAgentQualityReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Agent quality",
        description:
          "Grounded answer rate, answers without a retrieved source, answer-time percentiles, and grounding by page. Counts only: no question text or snippets.",
      },
    }
  )
  .get(
    "/agent/voice",
    async ({ query, set }) => {
      const company = await tenant(query.companyId, set);
      if (!company) return { error: "Company not found" };
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 422;
        return { error: RANGE_ERROR };
      }
      const v1 = validateReportQuery({
        metrics: REPORTS.agent.voice.metrics,
        dimensions: REPORTS.agent.voice.dimensions,
        rangeDays: days,
      });
      if (!v1.ok) {
        set.status = 422;
        return { error: "Invalid voice query", details: v1.errors };
      }
      return report(set, company, {
        label: "Voice",
        errorMessage: "Voice analytics unavailable - try again shortly",
        cacheKey: `ana:v3:voice:${company.id}:${days}d`,
        compute: () => getVoiceReport(company.id, days),
      });
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Agent voice",
        description:
          "Voice calls, turns, duration, silent-call rate, and the text-vs-voice share. Counts only: no transcript or speech content is stored.",
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
        cacheKey: `ana:v3:content:${company.id}:${days}d`,
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
        cacheKey: `ana:v3:voice:${company.id}:${days}d`,
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
