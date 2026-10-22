/**
 * packages/analytics/src/conversions.ts
 *
 * B2C conversion analytics: totals + revenue + chat-assisted attribution +
 * daily series + funnel. Rollup-first (metrics_daily); the assisted join is
 * a bounded visit scan over the range window only.
 *
 * Assisted = a conversion in a visit that also produced a chat_open or
 * chat_message event. The join is on the visit, not the page load, so a
 * conversion is never credited to a chat that happened in a different visit
 * of the same tab.
 */

import { db, metricsDaily, conversations, sql, eq, and, gte } from "@ag-ui/database";
import { sessionIslands } from "./sessions";
import { reportFreshness, type Freshness } from "./registry";

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
  freshness: Freshness;
}> {
  const dataQuality = ["assisted-approximate"];
  const now = new Date();
  const fromDay = new Date(now.getTime() - rangeDays * 86_400_000).toISOString().slice(0, 10);
  const fromISO = new Date(now.getTime() - rangeDays * 86_400_000).toISOString();

  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10));
  }

  const tRows = await db
    .select({
      day: sql<string>`${metricsDaily.day}::text`.as("day"),
      pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`.as("pv"),
      se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`.as("se"),
      cv: sql<number>`COALESCE(SUM(${metricsDaily.conversions}), 0)::int`.as("cv"),
      rev: sql<number>`COALESCE(SUM(${metricsDaily.revenue}), 0)::float`.as("rev"),
      co: sql<number>`COALESCE(SUM(${metricsDaily.chatOpens}), 0)::int`.as("co"),
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, fromDay)))
    .groupBy(metricsDaily.day)
    .orderBy(metricsDaily.day);
  const byDay = new Map(tRows.map((r) => [r.day.slice(0, 10), r]));
  const sessions = tRows.reduce((a, r) => a + (r.se ?? 0), 0);
  const chatOpens = tRows.reduce((a, r) => a + (r.co ?? 0), 0);
  const conversions = tRows.reduce((a, r) => a + (r.cv ?? 0), 0);
  const revenue = tRows.reduce((a, r) => a + (r.rev ?? 0), 0);
  if (sessions === 0 && conversions === 0) dataQuality.push("tracking-off");

  // Assisted attribution over the raw window (company-scoped, indexed),
  // on the visit grain so a conversion and the chat that assisted it are
  // the same visit.
  const isl = sessionIslands(companyId, new Date(fromISO), now);
  const perVisit = db
    .select({
      vk: isl.visitKey,
      convs: sql<number>`COUNT(*) FILTER (WHERE ${isl.type} = 'conversion')::int`.as("convs"),
      rev: sql<number>`COALESCE(SUM(${isl.value}) FILTER (WHERE ${isl.type} = 'conversion'), 0)::float`.as("rev"),
      chatted: sql<boolean>`BOOL_OR(${isl.type} IN ('chat_open', 'chat_message'))`.as("chatted"),
    })
    .from(isl)
    .groupBy(isl.visitKey)
    .as("v");
  const assist = await db
    .select({
      convs: sql<number>`COALESCE(SUM(${perVisit.convs}), 0)::int`.as("convs"),
      rev: sql<number>`COALESCE(SUM(${perVisit.rev}), 0)::float`.as("rev"),
      assisted: sql<number>`COUNT(*) FILTER (WHERE ${perVisit.convs} > 0 AND ${perVisit.chatted})::int`.as("assisted"),
      assistedRev: sql<number>`COALESCE(SUM(${perVisit.rev}) FILTER (WHERE ${perVisit.convs} > 0 AND ${perVisit.chatted}), 0)::float`.as("assisted_rev"),
    })
    .from(perVisit);
  const a = assist[0] ?? { convs: 0, rev: 0, assisted: 0, assistedRev: 0 };

  const [convRow] = await db
    .select({ c: sql<number>`COUNT(*)::int`.as("c") })
    .from(conversations)
    .where(and(eq(conversations.companyId, companyId), gte(conversations.createdAt, new Date(fromISO))));
  const started = Number(convRow?.c ?? 0);

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
      assistedRevenue: r1(a.assistedRev),
      conversionRate: sessions > 0 ? r1((a.convs / sessions) * 100) : 0,
      revenuePerSession: sessions > 0 ? r1(a.rev / sessions) : 0,
    },
    daily: days.map((d) => ({
      d,
      conversions: byDay.get(d)?.cv ?? 0,
      revenue: r1(byDay.get(d)?.rev ?? 0),
    })),
    funnel,
    freshness: await reportFreshness(false, dataQuality),
  };
}
