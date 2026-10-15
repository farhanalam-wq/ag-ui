import { Elysia, t } from "elysia";
import { db, companies, eq, getRedisClient } from "@ag-ui/database";
import {
  getCompanyOverview,
  getWebsiteAnalytics,
  getConversionAnalytics,
  getRealtimeSnapshot,
  withAnalyticsCache,
  cacheCounters,
  type OverviewRangeDays,
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

export const analyticsRoutes = new Elysia({ prefix: "/api/analytics" })
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
  // Ops: cache hit/miss counters (proves the cache actually absorbs load).
  .get("/cache-stats", async () => {
    const redis = await getRedisClient();
    return cacheCounters(redis as any);
  });
