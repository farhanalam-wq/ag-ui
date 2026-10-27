/**
 * packages/analytics/src/intel.ts
 *
 * Intelligence → Intent Radar. The agent reports are counts and deliberately
 * refuse to read question text; this is the surface where the questions come
 * back, because acting on demand requires seeing its wording.
 *
 *   - **Deterministic clustering.** Questions group by normalized wording —
 *     the same rule Overview's blindspot card uses. The schema's
 *     `intent_clusters` tables describe an embedding pipeline that nothing
 *     runs yet, so the copy says "grouped by identical question wording",
 *     never "semantically clustered".
 *   - **The pairing rule.** A question is answered when the *next* row in its
 *     conversation is an assistant reply; the reply's evidence list decides
 *     grounded vs blindspot, and its `meta.top_similarity` is the retrieval
 *     confidence. A question followed by nothing is unanswered, not a
 *     blindspot — nobody failed to answer it, nothing answered at all.
 *   - **Bounded scans stay bounded.** Clusters and competitor mentions are
 *     the top slices of a capped message scan, so they carry no
 *     share-of-total claim; only the totals and the intent mix speak in
 *     shares, and the intent mix is computed over every scanned question.
 *   - **Competitor mentions** are the enrich worker's tags on user messages
 *     (`meta.competitors`, verbatim quotes). No worker runs in the report —
 *     it reads what the chat path already wrote.
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
  desc,
} from "@ag-ui/database";
import { detectQueryIntents, INTENT_LABELS } from "@ag-ui/shared";
import {
  reportFreshness,
  type IntelCluster,
  type IntelCompetitor,
  type IntelRadarReport,
  type TrendPoint,
} from "./registry";

/** Same cap as the Overview report; the `sampled` caveat states the slice. */
const MAX_MESSAGES = 20_000;

/** Clusters returned per report — the top of the volume ranking. */
const MAX_CLUSTERS = 50;

/** Competitor names returned per report. */
const MAX_COMPETITORS = 20;

export interface TurnRow {
  id: string;
  cid: string;
  role: string;
  content: string;
  createdAt: Date;
  evidence: unknown;
  meta: unknown;
}

export interface PairedQuestion {
  cid: string;
  /** Raw question text, trimmed. */
  question: string;
  /** Normalized grouping key. */
  key: string;
  /** Detected intent labels; empty when the question is unclassified. */
  intents: string[];
  /** null = no assistant reply followed (unanswered). */
  grounded: boolean | null;
  /** The paired reply's `meta.top_similarity`, when it reported one. */
  similarity: number | null;
  /** UTC day the question was asked. */
  day: string;
  voice: boolean;
}

/* ------------------------------------------------------------------ */
/* Pure helpers — the tested surface.                                   */
/* ------------------------------------------------------------------ */

/** Same normalization Overview's blindspot list uses, exported for parity. */
export function normalizeClusterKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 80);
}

function hasEvidence(ev: unknown): boolean {
  return Array.isArray(ev) && ev.length > 0;
}

/** Read `top_similarity` out of an unknown jsonb column without trusting it. */
export function readTopSimilarity(meta: unknown): number | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = (meta as Record<string, unknown>)["top_similarity"];
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

/** Read `competitors` out of an unknown jsonb column without trusting it. */
export function readCompetitors(meta: unknown): Array<{ name: string; quote: string }> {
  if (!meta || typeof meta !== "object") return [];
  const raw = (meta as Record<string, unknown>)["competitors"];
  if (!Array.isArray(raw)) return [];
  const out: Array<{ name: string; quote: string }> = [];
  for (const item of raw) {
    if (item && typeof item === "object") {
      const name = (item as Record<string, unknown>)["name"];
      if (typeof name === "string" && name.trim()) {
        const quote = (item as Record<string, unknown>)["quote"];
        out.push({
          name: name.trim().slice(0, 64),
          quote: typeof quote === "string" ? quote.slice(0, 200) : "",
        });
      }
    }
  }
  return out;
}

/**
 * Pair every user turn with the assistant reply that immediately follows it.
 * Rows must already be in conversation order (created_at, then id for a
 * same-millisecond tie). A user turn followed by another user turn is
 * unanswered — attributing a later reply to it would invent causality.
 */
export function pairConversation(
  turns: TurnRow[],
  voice: boolean
): PairedQuestion[] {
  const out: PairedQuestion[] = [];
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i]!;
    if (t.role !== "user") continue;
    const next = turns[i + 1];
    const answered = next !== undefined && next.role === "assistant";
    const content = t.content.trim();
    if (!content) continue;
    const hits = detectQueryIntents(content);
    out.push({
      cid: t.cid,
      question: content,
      key: normalizeClusterKey(content),
      intents: hits.map((h) => INTENT_LABELS[h] ?? h),
      grounded: answered ? hasEvidence(next!.evidence) : null,
      similarity: answered ? readTopSimilarity(next!.meta) : null,
      day: t.createdAt.toISOString().slice(0, 10),
      voice,
    });
  }
  return out;
}

/** The headline arithmetic. Pure, zero-cases pinned by tests. */
export function radarTotals(
  questions: number,
  answered: number,
  grounded: number,
  highIntent: number,
  voiceQuestions: number
): Record<string, number> {
  const blindspot = Math.max(0, answered - grounded);
  return {
    questions,
    answered,
    groundedAnswers: grounded,
    blindspotQuestions: blindspot,
    unansweredQuestions: Math.max(0, questions - answered),
    highIntentQuestions: highIntent,
    voiceQuestions,
    /** Share of answered questions whose reply had no evidence (0-100). */
    blindspotRate: answered > 0 ? Math.round((blindspot / answered) * 1000) / 10 : 0,
    /** Share of questions that carried a detected buying intent (0-100). */
    highIntentRate: questions > 0 ? Math.round((highIntent / questions) * 1000) / 10 : 0,
  };
}

/** Group paired questions into clusters, ranked by volume. */
export function buildClusters(paired: PairedQuestion[]): IntelCluster[] {
  const map = new Map<
    string,
    IntelCluster & { similaritySum: number; similarityN: number; recent: string }
  >();
  for (const q of paired) {
    let c = map.get(q.key);
    if (!c) {
      c = {
        key: q.key,
        question: q.question,
        volume: 0,
        conversations: 0,
        intents: [],
        answered: 0,
        grounded: 0,
        blindspot: 0,
        unanswered: 0,
        avgSimilarity: null,
        firstSeen: q.day,
        lastSeen: q.day,
        similaritySum: 0,
        similarityN: 0,
        recent: q.day,
      };
      map.set(q.key, c);
    }
    c.volume++;
    if (q.day >= c.recent) {
      c.recent = q.day;
      c.question = q.question;
    }
    if (q.day < c.firstSeen) c.firstSeen = q.day;
    if (q.day > c.lastSeen) c.lastSeen = q.day;
    if (q.grounded === null) {
      c.unanswered++;
    } else {
      c.answered++;
      if (q.grounded) c.grounded++;
      else c.blindspot++;
    }
    if (q.similarity !== null) {
      c.similaritySum += q.similarity;
      c.similarityN++;
    }
    for (const intent of q.intents) {
      if (!c.intents.includes(intent)) c.intents.push(intent);
    }
  }
  const convoCounts = new Map<string, Set<string>>();
  for (const q of paired) {
    let set = convoCounts.get(q.key);
    if (!set) {
      set = new Set();
      convoCounts.set(q.key, set);
    }
    set.add(q.cid);
  }
  return [...map.values()]
    .map(({ similaritySum, similarityN, recent, ...c }) => ({
      ...c,
      conversations: convoCounts.get(c.key)?.size ?? 0,
      avgSimilarity: similarityN > 0 ? Math.round((similaritySum / similarityN) * 1000) / 1000 : null,
    }))
    .sort((a, b) => b.volume - a.volume || b.blindspot - a.blindspot)
    .slice(0, MAX_CLUSTERS);
}

/** Rank competitor mentions by count; quotes are verbatim worker tags. */
export function buildCompetitors(paired: PairedQuestion[], rows: TurnRow[]): IntelCompetitor[] {
  const quotesByCid = new Map(rows.map((r) => [r.cid, r]));
  const map = new Map<string, { name: string; mentions: number; quotes: string[] }>();
  for (const q of paired) {
    const row = quotesByCid.get(q.cid);
    if (!row) continue;
    for (const c of readCompetitors(row.meta)) {
      const nameKey = c.name.toLowerCase();
      let e = map.get(nameKey);
      if (!e) {
        e = { name: c.name, mentions: 0, quotes: [] };
        map.set(nameKey, e);
      }
      e.mentions++;
      if (c.quote && !e.quotes.includes(c.quote) && e.quotes.length < 3) e.quotes.push(c.quote);
    }
  }
  return [...map.values()]
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, MAX_COMPETITORS);
}

/* ------------------------------------------------------------------ */
/* The report.                                                          */
/* ------------------------------------------------------------------ */

export async function getIntelRadar(
  companyId: string,
  rangeDays: number
): Promise<IntelRadarReport> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromDay = new Date(now.getTime() - (rangeDays - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const windowStart = new Date(`${fromDay}T00:00:00Z`);

  // Conversations in range carry the channel marker; voice lines are
  // reconstructions, not verbatim, so the report keeps them countable and
  // labelled rather than silently mixed into the text questions.
  const convoRows = (await db
    .select({ id: conversations.id, channel: conversations.channel })
    .from(conversations)
    .where(
      and(
        eq(conversations.companyId, companyId),
        gte(conversations.createdAt, windowStart),
        lt(conversations.createdAt, now)
      )
    )) as Array<{ id: string; channel: string }>;

  const voiceConvs = new Set(
    convoRows.filter((c) => c.channel === "voice").map((c) => c.id)
  );

  // The message scan, most recent slice first when it would exceed the cap.
  const scoped = and(
    eq(conversations.companyId, companyId),
    gte(messages.createdAt, windowStart),
    lt(messages.createdAt, now)
  );
  const rawRows = await db
    .select({
      id: messages.id,
      cid: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      evidence: messages.evidence,
      meta: messages.meta,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(scoped)
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(MAX_MESSAGES + 1);

  const scanCapped = rawRows.length > MAX_MESSAGES;
  if (scanCapped) dataQuality.push("sampled");
  const rows = (scanCapped ? rawRows.slice(0, MAX_MESSAGES) : rawRows) as TurnRow[];
  rows.reverse(); // chronological

  const byConvo = new Map<string, TurnRow[]>();
  for (const r of rows) {
    const list = byConvo.get(r.cid);
    if (list) list.push(r);
    else byConvo.set(r.cid, [r]);
  }

  const paired: PairedQuestion[] = [];
  for (const [cid, turns] of byConvo) {
    paired.push(...pairConversation(turns, voiceConvs.has(cid)));
  }

  const questions = paired.length;
  const answered = paired.filter((q) => q.grounded !== null).length;
  const grounded = paired.filter((q) => q.grounded === true).length;
  const highIntent = paired.filter((q) => q.intents.length > 0).length;
  const voiceQuestions = paired.filter((q) => q.voice).length;

  // The daily shape: counts only. A day with no questions is absent from the
  // series — a missing day is no demand, not a hole in a rate.
  const trendMap = new Map<string, TrendPoint>();
  for (const q of paired) {
    const t = trendMap.get(q.day) ?? { d: q.day, questions: 0, highIntent: 0, blindspot: 0, unanswered: 0 };
    t.questions = Number(t.questions) + 1;
    if (q.intents.length > 0) t.highIntent = Number(t.highIntent) + 1;
    if (q.grounded === false) t.blindspot = Number(t.blindspot) + 1;
    if (q.grounded === null) t.unanswered = Number(t.unanswered) + 1;
    trendMap.set(q.day, t);
  }
  const trend = [...trendMap.values()].sort((a, b) => a.d.localeCompare(b.d));

  const clusters = buildClusters(paired);
  const competitors = buildCompetitors(paired, rows);

  if (questions === 0 && convoRows.length === 0) {
    // No conversations is a real zero when the site had traffic and nobody
    // opened the agent; it is a tracking gap when the site was dark. Same
    // rule the quality report uses, read from the rollup.
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
    kind: "intel-radar",
    companyId,
    rangeDays,
    totals: radarTotals(questions, answered, grounded, highIntent, voiceQuestions),
    trend,
    clusters,
    competitors,
    scanCapped,
    freshness: await reportFreshness(false, dataQuality),
  };
}
