/**
 * packages/analytics/src/content.ts
 *
 * Phase 2 — content reporting from first-party data only. ORM-first:
 * totals from metricsDaily via the builder; path/channel/device splits
 * from the shared attr CTEs with builder aggregation.
 */

import { db, pageViews, metricsDaily, sql, eq, and, desc, gte, lt } from "@ag-ui/database";
import { freshnessStub, type BreakdownRow, type ContentReport } from "./registry";
import { attrCTEs, deviceFragment } from "./attribution";

export async function getContentReport(companyId: string, rangeDays: number): Promise<ContentReport> {
  const dataQuality: string[] = [];
  const to = new Date();
  const from = new Date(to.getTime() - rangeDays * 86_400_000);
  const fromDay = from.toISOString().slice(0, 10);

  const t = await db
    .select({
      pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`.as("pv"),
      se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`.as("se"),
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), sql`${metricsDaily.day} >= ${fromDay}::date`));
  const totals = { sessions: Number(t[0]?.se ?? 0), pageviews: Number(t[0]?.pv ?? 0) };
  if (totals.sessions === 0 && totals.pageviews === 0) dataQuality.push("tracking-off");

  const { a1, a2 } = attrCTEs(companyId, from, to);
  const split = async (labelFrag: ReturnType<typeof sql<string>>, groupFrag: ReturnType<typeof sql>): Promise<BreakdownRow[]> => {
    const rows = await db
      .with(a1, a2)
      .select({
        label: sql<string>`${labelFrag}`.as("label"),
        pageviews: sql<number>`COUNT(*) FILTER (WHERE ${a2.type} = 'pageview')::int`.as("pageviews"),
        sessions: sql<number>`COUNT(DISTINCT ${a2.sessionHash})::int`.as("sessions"),
      })
      .from(a2)
      .groupBy(sql`${groupFrag}`)
      .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${a2.type} = 'pageview')`))
      .limit(10);
    return rows
      .filter((r) => (r.label ?? "").length > 0)
      .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) }));
  };

  const devFrag = deviceFragment(a2.viewport);
  const byPath = await split(sql<string>`${a2.path}`, sql`${a2.path}`);
  const byChannel = await split(sql<string>`${a2.channel}`, sql`${a2.channel}`);
  const byDevice = await split(sql<string>`${devFrag}`, sql`${devFrag}`);

  // Page titles from pageview meta (tag-captured document.title).
  const titleFrag = sql<string>`(${pageViews.meta}->>'title')`;
  const titleRows = await db
    .select({
      label: sql<string>`${titleFrag}`.as("label"),
      pageviews: sql<number>`COUNT(*)::int`.as("pageviews"),
      sessions: sql<number>`COUNT(DISTINCT ${pageViews.sessionHash})::int`.as("sessions"),
    })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.companyId, companyId),
        gte(pageViews.createdAt, from),
        lt(pageViews.createdAt, to),
        eq(pageViews.type, "pageview"),
        eq(pageViews.isBot, false),
        sql`${titleFrag} IS NOT NULL AND ${titleFrag} <> ''`
      )
    )
    .groupBy(sql`${titleFrag}`)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10);
  const byTitle: BreakdownRow[] = titleRows.map((r) => ({
    label: r.label,
    pageviews: Number(r.pageviews),
    sessions: Number(r.sessions),
  }));

  return {
    kind: "content",
    companyId,
    rangeDays,
    totals,
    byPath,
    byTitle,
    byChannel,
    byDevice,
    freshness: freshnessStub(false, dataQuality),
  };
}
