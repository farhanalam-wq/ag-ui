/**
 * packages/analytics/src/voice.ts
 *
 * The voice surface: how often visitors talk to the agent out loud, for how
 * long, and how often the call dies before anyone says anything.
 *
 * **Counts only.** O-3 is a privacy decision, not an implementation detail:
 * a voice call records its session count, duration, turn count and
 * abandonment, and never a word the visitor said. The event validator
 * rebuilds the meta from two numbers (`events.ts` → `voiceEventMeta`), so a
 * transcript cannot be stored even if a client sends one. Two consequences,
 * both honest:
 *
 *   - voice questions cannot be classified, searched, or joined with the
 *     text conversations — the Voice tab shows volume and depth only;
 *   - the text-vs-voice split needs the text side to be measured too, and
 *     chat events are not instrumented yet. The split arrives with the chat
 *     instrumentation, not here, because a split against a number that is
 *     always zero is worse than no split.
 *
 * Why the raw event stream and not a rollup column: a voice call is one
 * event per call (a few per day even for a busy site), so this report is a
 * bounded scan of a tiny slice. Adding two columns to every daily row to
 * save that scan would cost more than it saves.
 */

import { db, pageViews, metricsDaily, sql, eq, and, gte, lt, inArray } from "@ag-ui/database";
import { reportFreshness, type TrendPoint, type VoiceReport } from "./registry";
import { VOICE_EVENT_TYPES } from "./events";

export async function getVoiceReport(
  companyId: string,
  rangeDays: number
): Promise<VoiceReport> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromDay = new Date(now.getTime() - (rangeDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const windowStart = new Date(`${fromDay}T00:00:00Z`);

  // The UTC day a call started on — the same calendar-day rule every other
  // report uses, so the trend lines up with the Website page's.
  const day = sql<string>`to_char(${pageViews.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

  // jsonb counts are written by voiceEventMeta as integers, so the cast is
  // safe; NULLIF still guards a row written before this existed.
  const durationSecSql = sql`(NULLIF(${pageViews.meta}->>'durationSec', ''))::int`;
  const turnsSql = sql`COALESCE((NULLIF(${pageViews.meta}->>'turns', ''))::int, 0)`;

  const rows = await db
    .select({
      day: day.as("day"),
      starts: sql<number>`COUNT(*) FILTER (WHERE ${pageViews.type} = 'voice_start')::int`.as("starts"),
      ends: sql<number>`COUNT(*) FILTER (WHERE ${pageViews.type} = 'voice_end')::int`.as("ends"),
      abandoned: sql<number>`COUNT(*) FILTER (WHERE ${pageViews.type} = 'voice_end' AND (${pageViews.meta}->>'abandoned')::boolean)::int`.as(
        "abandoned"
      ),
      turns: sql<number>`COALESCE(SUM(${turnsSql}) FILTER (WHERE ${pageViews.type} = 'voice_end'), 0)::int`.as(
        "turns"
      ),
      durationSec: sql<number>`COALESCE(SUM(${durationSecSql}) FILTER (WHERE ${pageViews.type} = 'voice_end'), 0)::int`.as(
        "duration_sec"
      ),
      maxDurationSec: sql<number>`COALESCE(MAX(${durationSecSql}) FILTER (WHERE ${pageViews.type} = 'voice_end'), 0)::int`.as(
        "max_duration_sec"
      ),
    })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.companyId, companyId),
        gte(pageViews.createdAt, windowStart),
        lt(pageViews.createdAt, now),
        eq(pageViews.isBot, false),
        inArray(pageViews.type, [...VOICE_EVENT_TYPES])
      )
    )
    .groupBy(day)
    .orderBy(day);

  let calls = 0;
  let ended = 0;
  let abandoned = 0;
  let turnsTotal = 0;
  let durationSec = 0;
  let maxDurationSec = 0;
  const trend: TrendPoint[] = [];

  for (const row of rows) {
    const starts = Number(row.starts ?? 0);
    const ends = Number(row.ends ?? 0);
    const aband = Number(row.abandoned ?? 0);
    const t = Number(row.turns ?? 0);
    const sec = Number(row.durationSec ?? 0);
    const maxSec = Number(row.maxDurationSec ?? 0);

    calls += starts;
    ended += ends;
    abandoned += aband;
    turnsTotal += t;
    durationSec += sec;
    maxDurationSec = Math.max(maxDurationSec, maxSec);

    trend.push({
      d: String(row.day),
      voiceCalls: starts,
      voiceTurns: t,
      // Per-day average is over the calls that ended on that day.
      voiceAvgDurationSec: ends > 0 ? Math.round(sec / ends) : 0,
    });
  }

  if (calls === 0) {
    // Zero calls is a real number when there is traffic; "no calls" is only
    // "no tracking" when the site had no traffic at all. Read the rollup,
    // not the event stream, so the check costs one small row scan.
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

  const totals = {
    voiceCalls: calls,
    // A call that started and never ended in the window is still a call;
    // "ended" is what the duration numbers are computed over.
    voiceCallsEnded: ended,
    voiceTurns: turnsTotal,
    voiceAvgDurationSec: ended > 0 ? Math.round(durationSec / ended) : 0,
    voiceMaxDurationSec: maxDurationSec,
    voiceAbandonedCalls: abandoned,
    voiceAbandonRate: ended > 0 ? Math.round((abandoned / ended) * 1000) / 10 : 0,
  };

  return {
    kind: "voice",
    companyId,
    rangeDays,
    totals,
    trend,
    freshness: await reportFreshness(false, dataQuality),
  };
}
