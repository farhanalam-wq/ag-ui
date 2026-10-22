/**
 * packages/analytics/src/content.ts
 *
 * Phase 2 — content reporting from first-party data only. ORM-first:
 * totals from metricsDaily via the builder; path/channel/device splits
 * from the shared attr CTEs with builder aggregation.
 */

import { db, metricsDaily, sql, eq, and, desc } from "@ag-ui/database";
import { freshnessStub, type BreakdownRow, type ContentReport } from "./registry";
import { deviceFragment, visitAttrCTEs } from "./attribution";
import { sessionIslands } from "./sessions";

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

  // Same window, same island rule as the rollup: a "session" here is a visit.
  const { v1, v2 } = visitAttrCTEs(companyId, from, to);
  const split = async (labelFrag: ReturnType<typeof sql<string>>, groupFrag: ReturnType<typeof sql>): Promise<BreakdownRow[]> => {
    const rows = await db
      .with(v1, v2)
      .select({
        label: sql<string>`${labelFrag}`.as("label"),
        pageviews: sql<number>`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("pageviews"),
        sessions: sql<number>`COUNT(DISTINCT ${v2.visitKey}) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("sessions"),
      })
      .from(v2)
      .groupBy(sql`${groupFrag}`)
      .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')`))
      .limit(10);
    return rows
      .filter((r) => (r.label ?? "").length > 0)
      .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) }));
  };

  const devFrag = deviceFragment(v2.viewport);
  const byPath = await split(sql<string>`${v2.path}`, sql`${v2.path}`);
  const byChannel = await split(sql<string>`${v2.channel}`, sql`${v2.channel}`);
  const byDevice = await split(sql<string>`${devFrag}`, sql`${devFrag}`);

  // Page titles from pageview meta (tag-captured document.title).
  const isl = sessionIslands(companyId, from, to);
  const titleFrag = sql<string>`(${isl.meta}->>'title')`;
  const titleRows = await db
    .select({
      label: sql<string>`${titleFrag}`.as("label"),
      pageviews: sql<number>`COUNT(*)::int`.as("pageviews"),
      sessions: sql<number>`COUNT(DISTINCT ${isl.visitKey})::int`.as("sessions"),
    })
    .from(isl)
    .where(and(eq(isl.type, "pageview"), sql`${titleFrag} IS NOT NULL AND ${titleFrag} <> ''`))
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
