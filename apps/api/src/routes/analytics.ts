import { Elysia, t } from "elysia";
import { db, companies, eq, getRedisClient, checkAnalyticsReadLimit } from "@ag-ui/database";
import { getClientIp } from "./embed";
import {
  getCompanyOverview,
  getWebsiteAnalytics,
  getConversionAnalytics,
  getRealtimeSnapshot,
  getAcquisitionReport,
  getEngagementReport,
  getContentReport,
  validateReportQuery,
  withAnalyticsCache,
  cacheCounters,
  type OverviewRangeDays,
  type Channel,
  buildWidgetSpec,
  getInsightsReport,
  answerQuestion,
} from "@ag-ui/analytics";
import { logger } from "@ag-ui/shared";

function parseRange(raw: string | undefined): OverviewRangeDays {
  if (raw === "7d") return 7;
  if (raw === "30d") return 30;
  return 14;
}

/** Website/conversions ranges: Nd, 1..90. Anything else is a 400. */
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const analyticsRoutes = new Elysia({ prefix: "/api/analytics" })
  // Instance-wide guard: malformed tenant ids fail fast (400, never a
  // uuid-syntax 500 from Postgres), then a generous per-IP read budget
  // (429 + Retry-After, fail-open when Redis is down).
  .onBeforeHandle(async ({ query, set, request }: any) => {
    const companyId = query?.companyId;
    if (typeof companyId === "string" && !UUID_RE.test(companyId)) {
      set.status = 400;
      return { error: "companyId must be a UUID" };
    }
    const limit = await checkAnalyticsReadLimit(getClientIp(request));
    if (!limit.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(limit.retryAfterSec);
      return { error: "Analytics rate limit exceeded", retryAfterSec: limit.retryAfterSec };
    }
  })
  .get(
    "/overview",
    async ({ query, set }) => {
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:overview:${company.id}:${query.range ?? "14d"}`,
          60,
          240,
          () => getCompanyOverview(company.id, company.name, parseRange(query.range))
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Overview failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Overview unavailable - try again shortly" };
      }
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
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
      }
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:website:${company.id}:${days}d`,
          60,
          240,
          () => getWebsiteAnalytics(redis as any, company.id, days)
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Website failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Website analytics unavailable - try again shortly" };
      }
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
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
      }
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:conversions:${company.id}:${days}d`,
          60,
          240,
          () => getConversionAnalytics(company.id, days)
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Conversions failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Conversion analytics unavailable - try again shortly" };
      }
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
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      try {
        // Short cache: thundering-herd protection for owners watching live.
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:realtime:${company.id}`,
          15,
          15,
          () => getRealtimeSnapshot(company.id)
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Realtime failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Realtime snapshot unavailable - try again shortly" };
      }
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
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
      }
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:insights:${company.id}:${days}d`,
          60,
          240,
          () => getInsightsReport(company.id, days)
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Insights failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Insights unavailable - try again shortly" };
      }
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
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      if (!query.question || !query.question.trim()) {
        set.status = 400;
        return { error: "question is required" };
      }
      try {
        const redis = await getRedisClient();
        const cacheKey = `ana:v1:copilot:${company.id}:${query.question.trim().slice(0, 200)}`;
        const { data } = await withAnalyticsCache(redis as any, cacheKey, 60, 240, async () => {
          const out = await answerQuestion(redis as any, company.id, query.question.trim().slice(0, 500));
          // Rejections are expected outcomes (unsupported question), not
          // failures: 200 envelope so the UI renders limitations, not errors.
          if (!out.ok && "error" in out) throw new Error(out.error);
          return out;
        });
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Copilot failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Copilot unavailable - try again shortly" };
      }
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
    "/widget-spec",    async ({ query, set }) => {
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
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
      try {
        const redis = await getRedisClient();
        const cacheKey = `ana:v1:widget:${company.id}:${JSON.stringify(config)}`;
        const { data } = await withAnalyticsCache(redis as any, cacheKey, 60, 240, async () => {
          const built = await buildWidgetSpec(redis as any, company.id, config);
          if (!built.ok) {
            const err = new Error("Invalid widget config") as Error & { status?: number; details?: unknown };
            err.status = 400;
            err.details = built.errors;
            throw err;
          }
          return built.spec;
        });
        return data;
      } catch (err: any) {
        if (err?.status === 400) {
          set.status = 400;
          return { error: err.message, details: err.details };
        }
        logger.error(`[ANALYTICS] Widget-spec failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Widget spec unavailable - try again shortly" };
      }
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
    return cacheCounters(redis as any);
  })
  .get(
    "/acquisition",
    async ({ query, set }) => {
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
      }
      const channels = (query.channels ?? "").split(",").map((c) => c.trim()).filter(Boolean);
      // uniques is totals-only (HLL keys are per company-day); validate it
      // against [day] separately so its constraint doesn't veto breakdowns.
      const base = { rangeDays: days, compare: query.compare === "previous" ? "previous-period" : "off", channelFilter: channels } as const;
      const v1 = validateReportQuery({
        metrics: ["sessions", "pageviews"],
        dimensions: ["day", "channel", "source", "medium", "campaign", "landingPage"],
        ...base,
      });
      const v2 = validateReportQuery({ metrics: ["uniques"], dimensions: ["day"], rangeDays: days });
      const errors = [...(!v1.ok ? v1.errors : []), ...(!v2.ok ? v2.errors : [])];
      if (errors.length > 0) {
        set.status = 400;
        return { error: "Invalid acquisition query", details: errors };
      }
      const compare = query.compare === "previous";
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:acquisition:${company.id}:${days}d:${compare ? "prev" : "off"}:${[...channels].sort().join("+") || "all"}`,
          60,
          240,
          () => getAcquisitionReport(redis as any, company.id, days, compare, channels as Channel[])
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Acquisition failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Acquisition analytics unavailable - try again shortly" };
      }
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
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
      }
      const v1 = validateReportQuery({
        metrics: ["sessions", "pageviews", "engagedSessions", "scrolls", "downloads", "clicks"],
        dimensions: ["day", "path", "device"],
        rangeDays: days,
      });
      const v2 = validateReportQuery({ metrics: ["engagementRate", "avgEngagementTime"], dimensions: ["day"], rangeDays: days });
      const errors = [...(!v1.ok ? v1.errors : []), ...(!v2.ok ? v2.errors : [])];
      if (errors.length > 0) {
        set.status = 400;
        return { error: "Invalid engagement query", details: errors };
      }
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:engagement:${company.id}:${days}d`,
          60,
          240,
          () => getEngagementReport(company.id, days)
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Engagement failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Engagement analytics unavailable - try again shortly" };
      }
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Engagement analytics",
        description: "Views, sessions, engaged sessions, engagement rate, paths, devices. First-party only.",
      },
    }
  )
  .get(
    "/content",
    async ({ query, set }) => {
      const company = await requireCompany(query.companyId);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const days = parseWindowDays(query.range);
      if (days === null) {
        set.status = 400;
        return { error: "range must be Nd with 1 <= N <= 90 (e.g. 7d, 30d, 90d)" };
      }
      const v1 = validateReportQuery({
        metrics: ["sessions", "pageviews"],
        dimensions: ["day", "path", "channel", "device"],
        rangeDays: days,
      });
      const v2 = validateReportQuery({ metrics: ["pageviews"], dimensions: ["title"], rangeDays: days });
      const errors = [...(!v1.ok ? v1.errors : []), ...(!v2.ok ? v2.errors : [])];
      if (errors.length > 0) {
        set.status = 400;
        return { error: "Invalid content query", details: errors };
      }
      try {
        const redis = await getRedisClient();
        const { data } = await withAnalyticsCache(
          redis as any,
          `ana:v1:content:${company.id}:${days}d`,
          60,
          240,
          () => getContentReport(company.id, days)
        );
        return data;
      } catch (err: any) {
        logger.error(`[ANALYTICS] Content failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Content analytics unavailable - try again shortly" };
      }
    },
    {
      query: t.Object({ companyId: t.String(), range: t.Optional(t.String()) }),
      detail: {
        summary: "Content analytics",
        description: "Views/sessions by page path, channel, and device. First-party only.",
      },
    }
  );
