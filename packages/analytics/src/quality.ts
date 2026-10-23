/**
 * packages/analytics/src/quality.ts
 *
 * The agent's trust surface: is an answer backed by something the customer
 * actually wrote down, how long does an answer take, and which pages is the
 * agent good at?
 *
 * Two rules shape every number here.
 *
 *   - **No visitor content.** The report reads `messages.evidence` (how many
 *     sources backed an answer), `messages.created_at`, and the conversation's
 *     page. It never reads `messages.content`, never returns a question, and
 *     never persists a snippet in an event. The row-level data is product data;
 *     the *report* is counts.
 *   - **No invented fallback.** The chat pipeline has no deterministic fallback
 *     branch: an answer with no retrieved evidence is ungrounded, and that is
 *     exactly what `groundedAnswerRate` counts. A second "fallback rate" would
 *     be the same number inverted under a more confident name, so it does not
 *     exist.
 *
 * Answer time is derived from the message rows instead of a new column: the
 * pipeline writes the user row immediately before the model call and the
 * assistant row after the stream ends, so the gap is **generation + streaming**
 * — retrieval is excluded. It is the honest thing the existing data can say;
 * time-to-first-token would need a new write-path measurement.
 *
 * The percentile query is raw SQL: `percentile_cont` over a windowed lag is
 * outside what the query builder can express. Everything else stays ORM-first.
 */

import {
  db,
  conversations,
  messages,
  metricsDaily,
  sql,
  eq,
  and,
  gte,
  lt,
  isNotNull,
  desc,
} from "@ag-ui/database";
import {
  reportFreshness,
  type AgentQualityReport,
  type BreakdownRow,
  type TrendPoint,
} from "./registry";

/**
 * The headline numbers from raw counts. Pure, so the arithmetic and its zero
 * cases are tested without a database.
 */
export function qualityTotals(
  answers: number,
  grounded: number,
  p50Sec: number,
  p95Sec: number
): Record<string, number> {
  return {
    answers,
    groundedAnswers: grounded,
    /** Share of answers backed by at least one retrieved source (0-100). */
    groundedAnswerRate: answers > 0 ? Math.round((grounded / answers) * 1000) / 10 : 0,
    answersWithoutEvidence: Math.max(0, answers - grounded),
    /** Median generation + streaming time, one decimal. */
    answerTimeP50Sec: p50Sec,
    answerTimeP95Sec: p95Sec,
  };
}

export async function getAgentQualityReport(
  companyId: string,
  rangeDays: number
): Promise<AgentQualityReport> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromDay = new Date(now.getTime() - (rangeDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const windowStart = new Date(`${fromDay}T00:00:00Z`);

  const day = sql<string>`to_char(${messages.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
  const answersSql = sql<number>`COUNT(*) FILTER (WHERE ${messages.role} = 'assistant')::int`;
  // A grounded answer carries at least one retrieved source. The jsonb is
  // always an array when present; the type check keeps a malformed row from
  // making the whole query fail.
  const groundedSql = sql<number>`COUNT(*) FILTER (
    WHERE ${messages.role} = 'assistant'
      AND ${messages.evidence} IS NOT NULL
      AND jsonb_typeof(${messages.evidence}) = 'array'
      AND jsonb_array_length(${messages.evidence}) > 0
  )::int`;

  const scoped = and(
    eq(conversations.companyId, companyId),
    gte(messages.createdAt, windowStart),
    lt(messages.createdAt, now)
  );

  const [totalsRow] = await db
    .select({ answers: answersSql.as("answers"), grounded: groundedSql.as("grounded") })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(scoped);

  const answers = Number(totalsRow?.answers ?? 0);
  const grounded = Number(totalsRow?.grounded ?? 0);

  // Answer time: each assistant row minus the user row that preceded it in the
  // same conversation. `LAG` is per conversation, ordered by time then id so a
  // same-millisecond pair is still deterministic.
  const latencyResult = await db.execute(sql`
    WITH pairs AS (
      SELECT
        m.created_at,
        LAG(m.role) OVER w AS prev_role,
        LAG(m.created_at) OVER w AS prev_at
      FROM ${messages} m
      JOIN ${conversations} c ON c.id = m.conversation_id
      WHERE c.company_id = ${companyId}
        AND m.created_at >= ${windowStart.toISOString()}::timestamptz
        AND m.created_at < ${now.toISOString()}::timestamptz
      WINDOW w AS (PARTITION BY m.conversation_id ORDER BY m.created_at, m.id)
    )
    SELECT
      COALESCE(
        ROUND(
          percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - prev_at)))::numeric,
          1
        ),
        0
      )::float8 AS p50,
      COALESCE(
        ROUND(
          percentile_cont(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (created_at - prev_at)))::numeric,
          1
        ),
        0
      )::float8 AS p95
    FROM pairs
    WHERE prev_role = 'user' AND created_at > prev_at
  `);
  // postgres-js returns the row list itself; node-postgres wraps it in
  // `{ rows }`. Accept both so the report does not silently read zero.
  const latencyRows = (Array.isArray(latencyResult)
    ? latencyResult
    : ((latencyResult as unknown as { rows?: unknown[] }).rows ?? [])) as Array<{
    p50: number | string | null;
    p95: number | string | null;
  }>;
  const p50Sec = Number(latencyRows[0]?.p50 ?? 0);
  const p95Sec = Number(latencyRows[0]?.p95 ?? 0);

  // The daily shape. Rates are per day, so a week with no answers shows a gap
  // rather than a zero rate dragging the line down.
  const trendRows = await db
    .select({ d: day.as("d"), answers: answersSql, grounded: groundedSql })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(scoped)
    .groupBy(day)
    .orderBy(day);

  const trend: TrendPoint[] = trendRows.map((row) => {
    const a = Number(row.answers ?? 0);
    const g = Number(row.grounded ?? 0);
    return {
      d: String(row.d),
      answers: a,
      groundedAnswers: g,
      groundedAnswerRate: a > 0 ? Math.round((g / a) * 1000) / 10 : 0,
    };
  });

  // Which pages can the agent answer from? Only conversations with a known
  // path; an unknown path is not "/" and must not be counted as one.
  const pathRows = await db
    .select({ label: conversations.path, answers: answersSql, grounded: groundedSql })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(scoped, isNotNull(conversations.path)))
    .groupBy(conversations.path)
    .orderBy(desc(answersSql))
    .limit(20);

  const byPath: BreakdownRow[] = pathRows.flatMap((row) => {
    if (!row.label) return [];
    const a = Number(row.answers ?? 0);
    const g = Number(row.grounded ?? 0);
    return [
      {
        label: row.label,
        answers: a,
        groundedAnswers: g,
        groundedAnswerRate: a > 0 ? Math.round((g / a) * 1000) / 10 : 0,
      },
    ];
  });

  if (answers === 0) {
    // Zero answers is a real number when the site has traffic and nobody asked;
    // it is a tracking gap when the site had no traffic at all. Same rule the
    // voice report uses, read from the rollup so it is one small row scan.
    const [traffic] = await db
      .select({
        se: sql<number>`COALESCE(SUM(${metricsDaily.sessions}), 0)::int`,
        pv: sql<number>`COALESCE(SUM(${metricsDaily.pageviews}), 0)::int`,
      })
      .from(metricsDaily)
      .where(and(eq(metricsDaily.companyId, companyId), gte(metricsDaily.day, fromDay)));
    if (Number(traffic?.se ?? 0) === 0 && Number(traffic?.pv ?? 0) === 0) {
      dataQuality.push("tracking-off");
    }
  }

  return {
    kind: "agent-quality",
    companyId,
    rangeDays,
    totals: qualityTotals(answers, grounded, p50Sec, p95Sec),
    trend,
    breakdowns: { path: byPath },
    freshness: await reportFreshness(false, dataQuality),
  };
}
