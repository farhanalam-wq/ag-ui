/**
 * Per-message derived signals, written at persist time by the chat routes into
 * `messages.meta`. One writer (the chat path), many readers (Overview quality
 * stats, Intelligence blindspot metrics, Leads idempotency). Never read by the
 * render path — additive metadata only.
 */

export interface CompetitorMention {
  /** Recognised competitor name, e.g. "Intercom". */
  name: string;
  /** Short verbatim quote from the conversation. */
  quote: string;
}

export interface MessageMeta {
  /** Highest candidate similarity (0..1) returned by retrieval. Null when no evidence. */
  top_similarity: number | null;
  /** True when the assistant answer cited at least one grounded source. */
  grounded: boolean;
  /** LLM model that produced the answer. */
  model: string;
  /** Full-turn wall time (retrieve + synthesise) in milliseconds. */
  latency_ms: number;
  /** Interaction surface that produced the message. */
  engine: "text" | "voice";
  /** Set once the chat-enrich worker has processed this turn (extraction idempotency). */
  extraction_ran?: boolean;
  /** Competitor mentions tagged by the enrich worker on user messages. */
  competitors?: CompetitorMention[];
}

export const DEFAULT_CHAT_MODEL = "gpt-4o-mini";

interface ScoredEvidence {
  score?: unknown;
}

/**
 * Build the persist-time meta for an assistant message. `evidence` is the raw
 * evidence list as returned by retrieval (items carry a numeric `score`).
 */
export function buildMessageMeta(opts: {
  evidence: unknown;
  model?: string;
  latencyMs: number;
  engine?: "text" | "voice";
}): MessageMeta {
  const list = Array.isArray(opts.evidence) ? (opts.evidence as ScoredEvidence[]) : [];
  let top: number | null = null;
  for (const item of list) {
    const score = typeof item?.score === "number" && Number.isFinite(item.score) ? item.score : null;
    if (score !== null && (top === null || score > top)) top = score;
  }
  return {
    top_similarity: top,
    grounded: list.length > 0,
    model: opts.model || DEFAULT_CHAT_MODEL,
    latency_ms: Math.max(0, Math.round(opts.latencyMs)),
    engine: opts.engine ?? "text",
  };
}

/** Merge `patch` into a stored meta column value (read-modify-write helper). */
export function mergeMessageMeta(existing: unknown, patch: Partial<MessageMeta>): MessageMeta {
  const base = (existing && typeof existing === "object" ? existing : {}) as MessageMeta;
  return { ...base, ...patch };
}
