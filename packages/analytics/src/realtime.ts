/**
 * packages/analytics/src/realtime.ts
 *
 * "Visitors now" strip. Reads the last-30-minute raw window through the
 * (company_id, created_at) partition index — bounded and cheap, no extra
 * write-path state required. Thundering-herd protection comes from the
 * 15s endpoint cache, not from this query.
 *
 * ORM-first: Drizzle builder. The window lower bound stays database-side
 * (`now() - interval`) so the clock is the database's, not the API's.
 */

import { db, pageViews, sql, eq, and, gte, desc, count, countDistinct } from "@ag-ui/database";

export async function getRealtimeSnapshot(companyId: string): Promise<{
  companyId: string;
  windowMinutes: number;
  views: number;
  sessions: number;
  topPaths: Array<{ path: string; views: number }>;
}> {
  const [agg] = await db
    .select({
      views: count(),
      sessions: countDistinct(pageViews.sessionHash),
    })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.companyId, companyId),
        gte(pageViews.createdAt, sql`now() - interval '30 minutes'`)
      )
    );
  const paths = await db
    .select({
      path: pageViews.path,
      views: sql<number>`COUNT(*)::int`.as("views"),
    })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.companyId, companyId),
        eq(pageViews.type, "pageview"),
        eq(pageViews.isBot, false),
        gte(pageViews.createdAt, sql`now() - interval '30 minutes'`)
      )
    )
    .groupBy(pageViews.path)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(5);
  return {
    companyId,
    windowMinutes: 30,
    views: agg?.views ?? 0,
    sessions: agg?.sessions ?? 0,
    topPaths: paths.map((p) => ({
      path: p.path.length > 60 ? p.path.slice(0, 60) : p.path,
      views: p.views,
    })),
  };
}
