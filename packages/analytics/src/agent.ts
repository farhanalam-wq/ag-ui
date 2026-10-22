/**
 * packages/analytics/src/agent.ts
 *
 * The agent's own numbers: how many visits use it, how often the widget is
 * opened, how much is asked, how long the panel stays open, and — now that
 * both sides are measured — which modality wins.
 *
 * Every number here comes from events the **parent page** emitted. The chat
 * panel is a cross-origin iframe: it cannot see the host path, and it is not
 * allowed to emit analytics itself. So the parent owns the panel's clock and
 * turn counter (`chat_open` → `chat_message` per question → `chat_close`) and
 * the collector rebuilds the meta from counts only — question text never
 * reaches the database (see `events.ts` → `chatEventMeta`).
 *
 * Units, stated once because two surfaces read these numbers:
 *   - `agentSessions` is counted by **browser session id**, not by the
 *     rollup's visit islands. A pause longer than 30 minutes inside one tab
 *     counts once here where the Website page would count two visits. The
 *     alternative is a window-function island pass over raw events on every
 *     request; the difference is a handful of unusually long tabs.
 *   - `chatOpenRate` divides by the rollup's visits, because "did anyone open
 *     the widget" is a question about all traffic, not about agent traffic.
 *   - the text-vs-voice share lives in the voice report, which already scans
 *     the voice slice — a call is not a question, so the only unit both sides
 *     share is a session, and that is what the split divides.
 *
 * The surface reads three narrow views (`getAgentOverview`,
 * `getAgentQuestions`, and the voice report) rather than slicing one combined
 * payload in the browser. `getAgentReport` stays as the combined shape the
 * previous endpoint served.
 */

import { db, pageViews, metricsDaily, sql, eq, and, gte, lt, inArray, desc } from "@ag-ui/database";
import {
  reportFreshness,
  type AgentOverviewReport,
  type AgentQuestionsReport,
  type AgentReport,
  type BreakdownRow,
  type TrendPoint,
} from "./registry";

/** The events the agent surface reads. */
const AGENT_EVENT_TYPES = ["chat_open", "chat_message", "chat_close", "voice_start"] as const;

/** Counts behind the headline numbers, before any division. */
export interface AgentCounts {
  opens: number;
  openVisits: number;
  questions: number;
  textVisits: number;
  voiceCalls: number;
  agentVisits: number;
  closes: number;
  durationSec: number;
  maxDurationSec: number;
}

/**
 * The headline numbers from counts. Pure, with `visits` passed in from the
 * rollup — so the arithmetic (and its zero cases) is tested without a
 * database, and a report can never divide by zero into NaN.
 */
export function agentTotals(
  c: AgentCounts,
  visits: number
): Record<string, number> {
  return {
    /** Visits that actually used the agent (asked something or called). */
    agentSessions: c.agentVisits,
    chatOpens: c.opens,
    /** Share of all visits that opened the widget (0-100). */
    chatOpenRate: visits > 0 ? Math.round((c.openVisits / visits) * 1000) / 10 : 0,
    messages: c.questions,
    /** Questions per visit that asked one, one decimal. */
    questionsPerSession: c.textVisits > 0 ? Math.round((c.questions / c.textVisits) * 10) / 10 : 0,
    avgOpenDurationSec: c.closes > 0 ? Math.round(c.durationSec / c.closes) : 0,
    maxOpenDurationSec: c.maxDurationSec,
    voiceCalls: c.voiceCalls,
  };
}

export async function getAgentReport(
  companyId: string,
  rangeDays: number
): Promise<AgentReport> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromDay = new Date(now.getTime() - (rangeDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const windowStart = new Date(`${fromDay}T00:00:00Z`);

  // The UTC calendar day, the same rule every other report uses.
  const day = sql<string>`to_char(${pageViews.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const durationSecSql = sql`(NULLIF(${pageViews.meta}->>'durationSec', ''))::int`;

  const isType = (t: string) => sql`${pageViews.type} = ${t}`;
  const opensSql = sql<number>`COUNT(*) FILTER (WHERE ${isType("chat_open")})::int`;
  const questionsSql = sql<number>`COUNT(*) FILTER (WHERE ${isType("chat_message")})::int`;

  const inWindow = and(
    eq(pageViews.companyId, companyId),
    gte(pageViews.createdAt, windowStart),
    lt(pageViews.createdAt, now),
    eq(pageViews.isBot, false),
    inArray(pageViews.type, [...AGENT_EVENT_TYPES])
  );

  // Totals and the distinct counts, in one pass. Distinct counts cannot be
  // summed across days (a tab open past midnight would count twice), so the
  // trend below is computed separately and only the additive numbers agree.
  const [totalsRow] = await db
    .select({
      opens: opensSql.as("opens"),
      openVisits: sql<number>`COUNT(DISTINCT ${pageViews.sessionHash}) FILTER (WHERE ${isType("chat_open")})::int`.as("open_visits"),
      questions: questionsSql.as("questions"),
      textVisits: sql<number>`COUNT(DISTINCT ${pageViews.sessionHash}) FILTER (WHERE ${isType("chat_message")})::int`.as("text_visits"),
      voiceCalls: sql<number>`COUNT(*) FILTER (WHERE ${isType("voice_start")})::int`.as("voice_calls"),
      agentVisits: sql<number>`COUNT(DISTINCT ${pageViews.sessionHash})::int`.as("agent_visits"),
      closes: sql<number>`COUNT(*) FILTER (WHERE ${isType("chat_close")})::int`.as("closes"),
      durationSec: sql<number>`COALESCE(SUM(${durationSecSql}) FILTER (WHERE ${isType("chat_close")}), 0)::int`.as("duration_sec"),
      maxDurationSec: sql<number>`COALESCE(MAX(${durationSecSql}) FILTER (WHERE ${isType("chat_close")}), 0)::int`.as("max_duration_sec"),
    })
    .from(pageViews)
    .where(inWindow);

  const counts: AgentCounts = {
    opens: Number(totalsRow?.opens ?? 0),
    openVisits: Number(totalsRow?.openVisits ?? 0),
    questions: Number(totalsRow?.questions ?? 0),
    textVisits: Number(totalsRow?.textVisits ?? 0),
    voiceCalls: Number(totalsRow?.voiceCalls ?? 0),
    agentVisits: Number(totalsRow?.agentVisits ?? 0),
    closes: Number(totalsRow?.closes ?? 0),
    durationSec: Number(totalsRow?.durationSec ?? 0),
    maxDurationSec: Number(totalsRow?.maxDurationSec ?? 0),
  };

  // The daily trend: additive counts only, so a day can be summed.
  const trendRows = await db
    .select({
      day: day.as("day"),
      chatOpens: opensSql.as("chat_opens"),
      chatQuestions: questionsSql.as("chat_questions"),
      voiceCalls: sql<number>`COUNT(*) FILTER (WHERE ${isType("voice_start")})::int`.as("voice_calls"),
    })
    .from(pageViews)
    .where(inWindow)
    .groupBy(day)
    .orderBy(day);

  const trend: TrendPoint[] = trendRows.map((r) => ({
    d: String(r.day),
    chatOpens: Number(r.chatOpens ?? 0),
    chatQuestions: Number(r.chatQuestions ?? 0),
    voiceCalls: Number(r.voiceCalls ?? 0),
  }));

  // Which pages trigger the agent: questions and opens by host path.
  const byPathRows = await db
    .select({
      label: pageViews.path,
      chatQuestions: questionsSql.as("chat_questions"),
      chatOpens: opensSql.as("chat_opens"),
    })
    .from(pageViews)
    .where(inWindow)
    .groupBy(pageViews.path)
    .orderBy(desc(questionsSql))
    .limit(10);

  const byPath: BreakdownRow[] = byPathRows
    .map((r) => ({
      label: String(r.label),
      chatQuestions: Number(r.chatQuestions ?? 0),
      chatOpens: Number(r.chatOpens ?? 0),
    }))
    .filter((r) => r.chatQuestions > 0 || r.chatOpens > 0);

  // The denominator for open rate: every visit, from the rollup.
  const [traffic] = await db
    .select({
      se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`,
      pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`,
    })
    .from(metricsDaily)
    .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, fromDay)));
  const visits = Number(traffic?.se ?? 0);

  if (visits === 0 && Number(traffic?.pv ?? 0) === 0) dataQuality.push("tracking-off");

  return {
    kind: "agent",
    companyId,
    rangeDays,
    totals: agentTotals(counts, visits),
    trend,
    breakdowns: { path: byPath },
    freshness: await reportFreshness(false, dataQuality),
  };
}

/** Agent → Overview: the headline row, and the daily opens/questions trend. */
export async function getAgentOverview(
  companyId: string,
  rangeDays: number
): Promise<AgentOverviewReport> {
  const full = await getAgentReport(companyId, rangeDays);
  const t = full.totals;
  return {
    kind: "agent-overview",
    companyId,
    rangeDays,
    totals: {
      agentSessions: t.agentSessions ?? 0,
      chatOpens: t.chatOpens ?? 0,
      chatOpenRate: t.chatOpenRate ?? 0,
      messages: t.messages ?? 0,
      questionsPerSession: t.questionsPerSession ?? 0,
    },
    trend: full.trend.map((row) => ({
      d: String(row.d),
      chatOpens: Number(row.chatOpens ?? 0),
      chatQuestions: Number(row.chatQuestions ?? 0),
    })),
    freshness: full.freshness,
  };
}

/** Agent → Questions: depth and panel time, broken down by the page asked on. */
export async function getAgentQuestions(
  companyId: string,
  rangeDays: number
): Promise<AgentQuestionsReport> {
  const full = await getAgentReport(companyId, rangeDays);
  const t = full.totals;
  return {
    kind: "agent-questions",
    companyId,
    rangeDays,
    totals: {
      messages: t.messages ?? 0,
      questionsPerSession: t.questionsPerSession ?? 0,
      avgOpenDurationSec: t.avgOpenDurationSec ?? 0,
      maxOpenDurationSec: t.maxOpenDurationSec ?? 0,
    },
    breakdowns: { path: full.breakdowns.path },
    freshness: full.freshness,
  };
}
