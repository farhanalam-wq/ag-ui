/**
 * packages/analytics/src/content.ts
 *
 * Phase 2 — content reporting from first-party data only. ORM-first:
 * totals from metricsDaily via the builder; path/channel/device splits
 * from the shared attr CTEs with builder aggregation.
 */

import { db, metricsDaily, sql, eq, and, gte, desc, count, type SQL, type PgColumn } from "@ag-ui/database";

/** What `groupBy`/`orderBy` accept: a column, a SQL fragment, or an aliased fragment. */
type Groupable = SQL | PgColumn | SQL.Aliased;
import { reportFreshness, type BreakdownRow, type ContentReport } from "./registry";
import { deviceFragment, visitAttrCTEs } from "./attribution";
import { sessionIslands } from "./sessions";

export async function getContentReport(companyId: string, rangeDays: number): Promise<ContentReport> {
  const dataQuality: string[] = [];
  const to = new Date();
  // The same calendar days every other report uses: a "29d" range is the
  // last 29 calendar days, not a rolling 29×24 hours that clips the day
  // before. A rolling window started a day early and summed a whole extra
  // day of rollups, so this page showed a larger "Sessions" number than the
  // Website page for the same range.
  const fromDay = new Date(to.getTime() - (rangeDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const from = new Date(`${fromDay}T00:00:00Z`);

  const t = await db
    .select({
      pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`.as("pv"),
      se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`.as("se"),
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, fromDay)));
  const totals = { sessions: Number(t[0]?.se ?? 0), pageviews: Number(t[0]?.pv ?? 0) };
  if (totals.sessions === 0 && totals.pageviews === 0) dataQuality.push("tracking-off");

  // Same window, same island rule as the rollup: a "session" here is a visit.
  const { v1, v2 } = visitAttrCTEs(companyId, from, to);
  const split = async (labelFrag: Groupable, groupFrag: Groupable): Promise<BreakdownRow[]> => {
    const rows = await db
      .with(v1, v2)
      .select({
        label: sql<string>`${labelFrag}`.as("label"),
        pageviews: sql<number>`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("pageviews"),
        sessions: sql<number>`COUNT(DISTINCT ${v2.visitKey}) FILTER (WHERE ${v2.type} = 'pageview')::int`.as("sessions"),
      })
      .from(v2)
      .groupBy(groupFrag)
      .orderBy(desc(sql`COUNT(*) FILTER (WHERE ${v2.type} = 'pageview')`))
      .limit(10);
    return rows
      .filter((r) => (r.label ?? "").length > 0)
      .map((r) => ({ label: r.label, pageviews: Number(r.pageviews), sessions: Number(r.sessions) }));
  };

  const devFrag = deviceFragment(v2.viewport);
  const byPath = await split(v2.path, v2.path);
  const byChannel = await split(v2.channel, v2.channel);
  const byDevice = await split(devFrag, devFrag);

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
    .orderBy(desc(count()))
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
    breakdowns: {
      path: byPath,
      title: byTitle,
      channel: byChannel,
      device: byDevice,
    },
    freshness: await reportFreshness(false, dataQuality),
  };
}
