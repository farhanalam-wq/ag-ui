/**
 * packages/analytics/src/realtime.ts
 *
 * "Visitors now" strip. Reads the last-30-minute raw window through the
 * (company_id, created_at) partition index — bounded and cheap, no extra
 * write-path state required. Thundering-herd protection comes from the
 * 15s endpoint cache, not from this query.
 */

import { client } from "@ag-ui/database";

export async function getRealtimeSnapshot(companyId: string): Promise<{
  companyId: string;
  windowMinutes: number;
  views: number;
  sessions: number;
  topPaths: Array<{ path: string; views: number }>;
}> {
  const [agg] = (await client.unsafe(
    `SELECT COUNT(*)::int AS views, COUNT(DISTINCT session_hash)::int AS sessions
     FROM page_views WHERE company_id = $1 AND created_at >= now() - interval '30 minutes';`,
    [companyId]
  )) as Array<{ views: number; sessions: number }>;
  const paths = (await client.unsafe(
    `SELECT path, COUNT(*)::int AS views FROM page_views
     WHERE company_id = $1 AND type = 'pageview' AND is_bot = false
     AND created_at >= now() - interval '30 minutes'
     GROUP BY path ORDER BY views DESC LIMIT 5;`,
    [companyId]
  )) as Array<{ path: string; views: number }>;
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
