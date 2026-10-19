/**
 * packages/analytics/src/conversions.ts
 *
 * B2C conversion analytics: totals + revenue + chat-assisted attribution +
 * daily series + funnel. Rollup-first (metrics_daily); the assisted join is
 * a bounded raw scan over the range window only.
 *
 * Assisted = conversion whose (session_hash, day) also produced a
 * chat_open/chat_message event. Approximation, documented in the payload.
 */

import { client } from "@ag-ui/database";

export interface ConversionDayPoint {
  d: string;
  conversions: number;
  revenue: number;
}
export interface ConversionFunnelStage {
  stage: string;
  count: number;
  pctOfTop: number;
}

function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function getConversionAnalytics(
  companyId: string,
  rangeDays: number
): Promise<{
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
  daily: ConversionDayPoint[];
  funnel: ConversionFunnelStage[];
  dataQuality: string[];
}> {
  const dataQuality = ["assisted-approximate"];
  const now = new Date();
  const fromDay = new Date(now.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
  const fromISO = new Date(now.getTime() - rangeDays * 86_400_000).toISOString();

  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }

  const tRows = (await client.unsafe(
    `SELECT day::text AS day, SUM(pageviews)::int AS pv, SUM(sessions)::int AS se,
      SUM(conversions)::int AS cv, SUM(revenue)::float AS rev, SUM(chat_opens)::int AS co
      FROM metrics_daily WHERE company_id = $1 AND day >= $2::date GROUP BY day ORDER BY day;`,
    [companyId, fromDay]
  )) as Array<{ day: string; pv: number; se: number; cv: number; rev: number; co: number }>;
  const byDay = new Map(tRows.map((r) => [r.day.slice(0, 10), r]));
  const sessions = tRows.reduce((a, r) => a + (r.se ?? 0), 0);
  const chatOpens = tRows.reduce((a, r) => a + (r.co ?? 0), 0);
  const conversions = tRows.reduce((a, r) => a + (r.cv ?? 0), 0);
  const revenue = tRows.reduce((a, r) => a + (r.rev ?? 0), 0);
  if (sessions === 0 && conversions === 0) dataQuality.push("tracking-off");

  // Assisted attribution over the raw window (company-scoped, indexed).
  const assist = (await client.unsafe(
    `
    WITH conv AS (
      SELECT session_hash, value FROM page_views
      WHERE company_id = $1 AND type = 'conversion' AND created_at >= $2
    ),
    chat_sess AS (
      SELECT DISTINCT session_hash FROM page_views
      WHERE company_id = $1 AND type IN ('chat_open', 'chat_message') AND created_at >= $2
    )
    SELECT COUNT(*)::int AS convs,
      COALESCE(SUM(conv.value), 0)::float AS rev,
      COUNT(chat_sess.session_hash)::int AS assisted,
      COALESCE(SUM(conv.value) FILTER (WHERE chat_sess.session_hash IS NOT NULL), 0)::float AS assisted_rev
    FROM conv LEFT JOIN chat_sess USING (session_hash);`,
    [companyId, fromISO]
  )) as Array<{ convs: number; rev: number; assisted: number; assisted_rev: number }>;
  const a = assist[0] ?? { convs: 0, rev: 0, assisted: 0, assisted_rev: 0 };

  const convos = (await client.unsafe(
    `SELECT COUNT(*)::int AS c FROM conversations WHERE company_id = $1 AND created_at >= $2;`,
    [companyId, fromISO]
  )) as Array<{ c: number }>;
  const started = convos[0]?.c ?? 0;

  const fCounts = [sessions, chatOpens, started, conversions];
  const stages = ["Eligible sessions", "Widget opened", "Conversation started", "Recorded conversion"];
  const funnel: ConversionFunnelStage[] = stages.map((stage, i) => ({
    stage,
    count: fCounts[i] ?? 0,
    pctOfTop: fCounts[0]! > 0 ? r1(((fCounts[i] ?? 0) / fCounts[0]!) * 100) : 0,
  }));

  return {
    companyId,
    rangeDays,
    totals: {
      conversions: a.convs,
      revenue: r1(a.rev),
      assistedConversions: a.assisted,
      assistedRevenue: r1(a.assisted_rev),
      conversionRate: sessions > 0 ? r1((a.convs / sessions) * 100) : 0,
      revenuePerSession: sessions > 0 ? r1(a.rev / sessions) : 0,
    },
    daily: days.map((d) => ({
      d,
      conversions: byDay.get(d)?.cv ?? 0,
      revenue: r1(byDay.get(d)?.rev ?? 0),
    })),
    funnel,
    dataQuality,
  };
}
