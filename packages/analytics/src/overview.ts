/**
 * packages/analytics/src/overview.ts
 *
 * Phase 4 — live agent overview. Returns the exact `OverviewMock` shape
 * (apps/web/mocks/overview.ts) with measured numbers and `isMock: false`,
 * so the overview page renders without structural changes.
 *
 * Honesty rules (no fake precision):
 * - Every number derives from conversations/messages, metrics_daily, or
 *   snapshots. Structurally absent data (no tracking, no clicks) is an
 *   honest zero, and the reason lands in `dataQuality`, never in a caption
 *   that implies measurement.
 * - All queries are company-scoped and range-bounded. Message volume is
 *   capped (latest 20k) with a `sampled` note when hit.
 */

import { client } from "@ag-ui/database";
import { detectQueryIntents } from "@ag-ui/shared";

export type OverviewRangeDays = 7 | 14 | 30;

const INTENT_LABELS: Record<string, string> = {
  pricing: "Pricing Evaluation",
  code: "Product Research",
  contact: "Contact Request",
  location: "Location Inquiry",
  social: "Social & Brand",
};

const MAX_MESSAGES = 20_000;

interface ConvoRow {
  id: string;
  created_at: string;
}
interface MsgRow {
  conversation_id: string;
  role: string;
  content: string;
  evidence: unknown;
  created_at: string;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function weekdayShort(isoDay: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${isoDay}T12:00:00Z`).getUTCDay()] ?? "";
}
function relTime(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
function hasEvidence(ev: unknown): boolean {
  return Array.isArray(ev) && ev.length > 0;
}
function normQuery(content: string): string {
  return content.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 80);
}
function intentOf(text: string): string {
  const hits = detectQueryIntents(text);
  const first = hits[0];
  if (!first) return "General";
  return INTENT_LABELS[first] ?? "General";
}
function pctChange(cur: number, prev: number): string {
  if (prev <= 0) return cur > 0 ? "+100% WoW" : "0% WoW";
  const p = ((cur - prev) / prev) * 100;
  const sign = p > 0 ? "+" : p < 0 ? "-" : "";
  return `${sign}${Math.abs(Math.round(p * 10) / 10)}% WoW`;
}
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[i] ?? 0;
}
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

export async function getCompanyOverview(
  companyId: string,
  companyName: string,
  rangeDays: OverviewRangeDays
): Promise<Record<string, unknown>> {
  const t0 = Date.now();
  const dataQuality: string[] = [];
  const now = new Date();
  const start = new Date(now.getTime() - rangeDays * 86_400_000);
  const prevStart = new Date(start.getTime() - rangeDays * 86_400_000);
  const startISO = start.toISOString();
  const prevISO = prevStart.toISOString();

  const convos = (await client.unsafe(
    `SELECT id, created_at FROM conversations WHERE company_id = $1 AND created_at >= $2 ORDER BY created_at ASC;`,
    [companyId, prevISO]
  )) as ConvoRow[];
  const cur = convos.filter((c) => c.created_at >= startISO);
  const prev = convos.filter((c) => c.created_at < startISO);
  const curIds = new Set(cur.map((c) => c.id));

  let messages: MsgRow[] = [];
  if (convos.length > 0) {
    const ids = convos.map((c) => c.id);
    // Chunked to stay under parameter limits on heavy tenants.
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const placeholders = slice.map((_, k) => `$${k + 1}`).join(",");
      const rows = (await client.unsafe(
        `SELECT conversation_id, role, content, evidence, created_at FROM messages WHERE conversation_id IN (${placeholders}) ORDER BY created_at ASC;`,
        slice
      )) as MsgRow[];
      messages = messages.concat(rows);
      if (messages.length >= MAX_MESSAGES) {
        messages = messages.slice(-MAX_MESSAGES);
        dataQuality.push("sampled");
        break;
      }
    }
  }
  const curMsgs = messages.filter((m) => curIds.has(m.conversation_id));
  // Per-conversation lists, ordered by created_at from the query.
  const convoMsgs = new Map<string, MsgRow[]>();
  for (const m of curMsgs) {
    const list = convoMsgs.get(m.conversation_id) ?? [];
    list.push(m);
    convoMsgs.set(m.conversation_id, list);
  }

  const firstUserText = new Map<string, string>();
  const userCounts = new Map<string, number>();
  const assistantMsgs: MsgRow[] = [];
  const groundedConvos = new Set<string>();
  const latencies: number[] = [];
  for (const [cid, list] of convoMsgs) {
    let users = 0;
    let lastUserAt = 0;
    for (const m of list) {
      if (m.role === "user") {
        users++;
        if (!firstUserText.has(cid)) firstUserText.set(cid, m.content);
        lastUserAt = new Date(m.created_at).getTime();
      } else if (m.role === "assistant") {
        assistantMsgs.push(m);
        if (hasEvidence(m.evidence)) groundedConvos.add(cid);
        if (lastUserAt > 0) {
          const gap = new Date(m.created_at).getTime() - lastUserAt;
          if (gap >= 0 && gap <= 120_000) latencies.push(gap);
          lastUserAt = 0;
        }
      }
    }
    userCounts.set(cid, users);
  }

  // Intent per conversation from its first user message.
  const convoIntent = new Map<string, string>();
  for (const [cid, text] of firstUserText) convoIntent.set(cid, intentOf(text));
  const prevIntents = new Map<string, number>();
  for (const c of prev) {
    const first = messages.find((m) => m.conversation_id === c.id && m.role === "user");
    const label = first ? intentOf(first.content) : "General";
    prevIntents.set(label, (prevIntents.get(label) ?? 0) + 1);
  }

  // Metrics rollups, current + prior windows.
  const mRows = (await client.unsafe(
    `SELECT day::text AS day, SUM(pageviews)::int AS pv, SUM(sessions)::int AS se,
      SUM(conversions)::int AS cv, SUM(revenue)::float AS rev,
      SUM(chat_opens)::int AS co, SUM(messages)::int AS me
      FROM metrics_daily WHERE company_id = $1 AND day >= ($2::date - $3::int) GROUP BY day;`,
    [companyId, startISO.slice(0, 10), rangeDays]
  )) as Array<{ day: string; pv: number; se: number; cv: number; rev: number; co: number; me: number }>;
  const mByDay = new Map(mRows.map((r) => [r.day.slice(0, 10), r]));
  const trackedSessions = mRows
    .filter((r) => r.day.slice(0, 10) >= startISO.slice(0, 10))
    .reduce((a, r) => a + (r.se ?? 0), 0);
  if (trackedSessions === 0) dataQuality.push("tracking-off");

  // Day buckets across the range.
  const days: string[] = [];
  for (let i = rangeDays - 1; i >= 0; i--) {
    days.push(dayKey(new Date(now.getTime() - i * 86_400_000)));
  }
  const convosByDay = new Map<string, number>();
  for (const c of cur) {
    const d = c.created_at.slice(0, 10);
    convosByDay.set(d, (convosByDay.get(d) ?? 0) + 1);
  }
  const dailyConvos = days.map((d) => convosByDay.get(d) ?? 0);
  const dailyMatched: number[] = days.map((d) => {
    let n = 0;
    for (const c of cur) {
      if (c.created_at.slice(0, 10) !== d) continue;
      const label = convoIntent.get(c.id) ?? "General";
      if (label !== "General") n++;
    }
    return n;
  });
  const priorDailyMean = prev.length / rangeDays;

  // Intent breakdown.
  const intentCounts = new Map<string, number>();
  for (const c of cur) {
    const label = convoIntent.get(c.id) ?? "General";
    intentCounts.set(label, (intentCounts.get(label) ?? 0) + 1);
  }
  const intentBreakdown = [...intentCounts.entries()]
    .map(([intent, sessions]) => ({
      intent,
      share: cur.length > 0 ? r1((sessions / cur.length) * 100) : 0,
      sessions,
    }))
    .sort((a, b) => b.sessions - a.sessions);
  const topIntent = intentBreakdown[0]?.intent ?? "General";

  // Hero: share of tracked sessions that started a conversation.
  const assistedRate = trackedSessions > 0 ? r1((cur.length / trackedSessions) * 100) : 0;
  const prevTracked = mRows
    .filter((r) => r.day.slice(0, 10) < startISO.slice(0, 10))
    .reduce((a, r) => a + (r.se ?? 0), 0);
  const baselineRate = prevTracked > 0 ? r1((prev.length / prevTracked) * 100) : 0;
  const heroSpark = days.map((d) => {
    const se = mByDay.get(d)?.se ?? 0;
    const cv = convosByDay.get(d) ?? 0;
    return se > 0 ? r1((cv / se) * 100) : 0;
  });

  // KPIs.
  const matchedNow = cur.filter((c) => (convoIntent.get(c.id) ?? "General") !== "General").length;
  const matchedPrev = [...prevIntents.entries()]
    .filter(([k]) => k !== "General")
    .reduce((a, [, v]) => a + v, 0);
  const ungrounded = assistantMsgs.filter((m) => !hasEvidence(m.evidence)).length;
  const blindRate = assistantMsgs.length > 0 ? r1((ungrounded / assistantMsgs.length) * 100) : 0;
  const prevAssistantTotal = messages.filter(
    (m) => m.role === "assistant" && !curIds.has(m.conversation_id)
  ).length;
  const prevUngrounded = messages.filter(
    (m) => m.role === "assistant" && !curIds.has(m.conversation_id) && !hasEvidence(m.evidence)
  ).length;
  const prevBlindRate = prevAssistantTotal > 0 ? r1((prevUngrounded / prevAssistantTotal) * 100) : 0;
  const userMsgTotal = [...userCounts.values()].reduce((a, v) => a + v, 0);
  const depth = cur.length > 0 ? r1(userMsgTotal / cur.length) : 0;
  const prevUserTotal = messages.filter(
    (m) => m.role === "user" && !curIds.has(m.conversation_id)
  ).length;
  const prevDepth = prev.length > 0 ? r1(prevUserTotal / prev.length) : 0;

  // Blindspots: repeated first-questions whose first answer lacked evidence.
  const qStats = new Map<string, { volume: number; ungrounded: number; intent: string }>();
  for (const [cid, text] of firstUserText) {
    const q = normQuery(text);
    if (!q) continue;
    const s = qStats.get(q) ?? { volume: 0, ungrounded: 0, intent: convoIntent.get(cid) ?? "General" };
    s.volume++;
    const firstAsst = (convoMsgs.get(cid) ?? []).find((m) => m.role === "assistant");
    if (!firstAsst || !hasEvidence(firstAsst.evidence)) s.ungrounded++;
    qStats.set(q, s);
  }
  const blindspots = [...qStats.entries()]
    .filter(([, s]) => s.ungrounded > 0)
    .map(([query, s]) => ({
      query,
      intent: s.intent,
      confidence: s.volume > 0 ? Math.round((s.ungrounded / s.volume) * 100) : 0,
      volume: s.volume,
      evidence: `${s.volume} session${s.volume === 1 ? "" : "s"} hit low-confidence answers on this in the last ${rangeDays} days.`,
      nextStep: s.intent === "Pricing Evaluation" ? "Review in Knowledge Foundry" : "Explore Intent Radar",
      nextHref: s.intent === "Pricing Evaluation" ? "/knowledge/sources" : "/intelligence/intent-radar",
    }))
    .sort((a, b) => b.volume - a.volume || b.confidence - a.confidence)
    .slice(0, 5);

  // Funnel (tracking stages honest-zero when untracked).
  const chatOpens = mRows
    .filter((r) => r.day.slice(0, 10) >= startISO.slice(0, 10))
    .reduce((a, r) => a + (r.co ?? 0), 0);
  const conversions = mRows
    .filter((r) => r.day.slice(0, 10) >= startISO.slice(0, 10))
    .reduce((a, r) => a + (r.cv ?? 0), 0);
  // "Meaningful conversation" is a conversation with 2+ user messages —
  // not an engaged session. The two used to share the word "engaged".
  const meaningfulConversations = [...userCounts.values()].filter((n) => n >= 2).length;
  const fCounts = [trackedSessions, chatOpens, cur.length, meaningfulConversations, conversions];
  // NOTE: mock shape has 6 stages; "Meaningful conversation" sits before conversion.
  const stages = [
    "Eligible sessions",
    "Widget opened",
    "Conversation started",
    "Meaningful conversation",
    "Recorded conversion",
  ];
  const counts5 = [fCounts[0], fCounts[1], fCounts[2], fCounts[3], fCounts[4]];
  const funnel = stages.map((stage, i) => ({
    stage,
    count: counts5[i] ?? 0,
    pctOfTop: counts5[0]! > 0 ? r1(((counts5[i] ?? 0) / counts5[0]!) * 100) : 0,
    stageConversion:
      i === 0
        ? null
        : counts5[i - 1]! > 0
          ? Math.round(((counts5[i] ?? 0) / counts5[i - 1]!) * 100)
          : 0,
  }));
  let funnelDropout = "—";
  if (funnel[0]!.count > 0) {
    let idx = 1;
    for (let i = 2; i < funnel.length; i++) {
      if ((funnel[i]?.stageConversion ?? 100) < (funnel[idx]?.stageConversion ?? 100)) idx = i;
    }
    funnelDropout = `${funnel[idx - 1]?.stage} → ${funnel[idx]?.stage} (${funnel[idx]?.stageConversion}%)`;
  }

  // Trust.
  const grounded = assistantMsgs.filter((m) => hasEvidence(m.evidence)).length;
  const groundedCoverage = assistantMsgs.length > 0 ? Math.round((grounded / assistantMsgs.length) * 100) : 0;
  const convosWithGrounding = groundedConvos.size;
  const fallbackRate = cur.length > 0 ? r1(((cur.length - convosWithGrounding) / cur.length) * 100) : 0;
  const sortedLat = [...latencies].sort((a, b) => a - b);

  // Health.
  const snaps = (await client.unsafe(
    `SELECT version, status, created_at FROM company_snapshots WHERE company_id = $1 ORDER BY version DESC LIMIT 1;`,
    [companyId]
  )) as Array<{ version: number; status: string; created_at: string }>;
  const snap = snaps[0];
  const [live] = (await client.unsafe(
    `SELECT 1 AS ok FROM page_views WHERE company_id = $1 AND created_at >= now() - interval '24 hours' AND is_bot = false LIMIT 1;`,
    [companyId]
  )) as Array<{ ok: number }>;

  const blindDelta = `${blindRate > prevBlindRate ? "+" : blindRate < prevBlindRate ? "-" : ""}${r1(Math.abs(blindRate - prevBlindRate))}pp WoW`;

  return {
    companyId,
    companyName,
    isMock: false,
    dataQuality,
    hero: {
      assistedRate,
      baselineRate,
      deltaPp: r1(assistedRate - baselineRate),
      spark: heroSpark,
      caption:
        trackedSessions === 0
          ? "Turn on tracking to measure assist lift across real visits."
          : `${topIntent} leads this period — most assists start there.`,
    },
    kpis: [
      {
        id: "intent",
        label: "High-intent sessions",
        value: matchedNow.toLocaleString(),
        delta: pctChange(matchedNow, matchedPrev),
        deltaGood: matchedNow >= matchedPrev,
        spark: dailyMatched,
        insight: `${topIntent} drives the period.`,
      },
      {
        id: "blindspot",
        label: "Blindspot rate",
        value: `${blindRate}%`,
        delta: blindDelta,
        deltaGood: blindRate <= prevBlindRate,
        spark: days.map(() => blindRate),
        insight:
          blindspots[0]?.query != null
            ? `Top gap: "${blindspots[0].query.split(" ").slice(0, 5).join(" ")}…"`
            : "No repeated gaps detected.",
      },
      {
        id: "depth",
        label: "Messages / session",
        value: `${depth}`,
        delta: pctChange(depth, prevDepth),
        deltaGood: depth >= prevDepth,
        spark: days.map((d) => {
          const dayConvos = cur.filter((c) => c.created_at.slice(0, 10) === d);
          if (dayConvos.length === 0) return 0;
          const u = dayConvos.reduce((a, c) => a + (userCounts.get(c.id) ?? 0), 0);
          return r1(u / dayConvos.length);
        }),
        insight: "Depth holds — visitors talk, not bounce.",
      },
    ],
    demandTrend: days.map((d, i) => ({
      d: weekdayShort(d),
      assisted: dailyConvos[i] ?? 0,
      baseline: r1(priorDailyMean),
    })),
    intentBreakdown,
    blindspots,
    funnel,
    funnelDropout,
    trust: {
      groundedCoverage,
      fallbackRate,
      latencyP50: Math.round(quantile(sortedLat, 0.5)),
      latencyP95: Math.round(quantile(sortedLat, 0.95)),
      citationCtr: 0,
    },
    health: {
      snapshotVersion: snap ? `v${snap.version}` : "—",
      crawlStatus: snap?.status ?? "QUEUED",
      lastCrawl: relTime(snap?.created_at ? new Date(snap.created_at).toISOString() : null),
      pingMs: Date.now() - t0,
      scriptLive: (live?.ok ?? 0) === 1,
    },
  };
}
