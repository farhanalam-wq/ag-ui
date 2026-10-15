/**
 * packages/analytics/src/events.ts
 *
 * Phase 1 — event validation for the tracking collector (Phase 2).
 * Pure functions, zero dependencies. Caps keep every column within its
 * storage budget so a malicious or buggy client cannot blow up a row.
 */

export type TrackEventType = "pageview" | "chat_open" | "chat_message" | "conversion";

export const TRACK_EVENT_TYPES: readonly TrackEventType[] = [
  "pageview",
  "chat_open",
  "chat_message",
  "conversion",
] as const;

/** Raw payload as submitted by the snippet / collector. */
export interface RawTrackEvent {
  event_id?: unknown;
  type?: unknown;
  company_id?: unknown;
  widget_key_id?: unknown;
  url?: unknown;
  path?: unknown;
  referrer?: unknown;
  viewport?: unknown;
  user_agent?: unknown;
  session_hash?: unknown;
  visitor_hash?: unknown;
  /** Conversion revenue (B2C). Only honored on type === "conversion". */
  value?: unknown;
  meta?: unknown;
  created_at?: unknown;
}

/** Validated, storage-ready event. */
export interface ValidatedTrackEvent {
  event_id: string;
  type: TrackEventType;
  company_id: string;
  widget_key_id: string | null;
  url: string;
  path: string;
  referrer: string;
  viewport: string;
  user_agent: string;
  session_hash: string;
  visitor_hash: string;
  value: number | null;
  meta: Record<string, unknown> | null;
  created_at: string; // ISO timestamp (UTC)
}

const MAX_ID_LEN = 128;
const MAX_URL_LEN = 2048;
const MAX_PATH_LEN = 1024;
const MAX_REF_LEN = 2048;
const MAX_VP_LEN = 32;
const MAX_UA_LEN = 300;
const MAX_VALUE = 1_000_000_000;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

function optStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

function derivePath(url: string, explicit: unknown): string {
  if (typeof explicit === "string" && explicit.trim().length > 0) {
    return explicit.trim().slice(0, MAX_PATH_LEN);
  }
  try {
    return new URL(url).pathname.slice(0, MAX_PATH_LEN) || "/";
  } catch {
    return "/";
  }
}

/**
 * Validates one raw event. Returns the normalized event or a short reason.
 * Never throws on hostile input.
 */
export function validateTrackEvent(
  raw: RawTrackEvent
): { ok: true; event: ValidatedTrackEvent } | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not-an-object" };

  const event_id = str(raw.event_id, MAX_ID_LEN);
  if (!event_id) return { ok: false, reason: "bad-event_id" };

  if (!TRACK_EVENT_TYPES.includes(raw.type as TrackEventType)) {
    return { ok: false, reason: "bad-type" };
  }
  const type = raw.type as TrackEventType;

  const company_id = str(raw.company_id, MAX_ID_LEN);
  if (!company_id) return { ok: false, reason: "bad-company_id" };

  const session_hash = str(raw.session_hash, MAX_ID_LEN);
  if (!session_hash) return { ok: false, reason: "bad-session_hash" };

  const visitor_hash = str(raw.visitor_hash, MAX_ID_LEN);
  if (!visitor_hash) return { ok: false, reason: "bad-visitor_hash" };

  const url = str(raw.url, MAX_URL_LEN);
  if (!url) return { ok: false, reason: "bad-url" };

  let value: number | null = null;
  if (type === "conversion" && raw.value !== undefined && raw.value !== null) {
    const n = typeof raw.value === "string" ? Number(raw.value) : raw.value;
    if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > MAX_VALUE) {
      return { ok: false, reason: "bad-value" };
    }
    value = n;
  }

  let created_at: string;
  if (raw.created_at === undefined || raw.created_at === null) {
    created_at = new Date().toISOString();
  } else {
    const d = new Date(raw.created_at as string);
    if (isNaN(d.getTime())) return { ok: false, reason: "bad-created_at" };
    // Reject absurd clock skew (client clocks lie): allow ±1 day.
    const skew = Math.abs(Date.now() - d.getTime());
    created_at = skew > 86_400_000 ? new Date().toISOString() : d.toISOString();
  }

  let meta: Record<string, unknown> | null = null;
  if (raw.meta !== undefined && raw.meta !== null) {
    if (typeof raw.meta !== "object" || Array.isArray(raw.meta)) {
      return { ok: false, reason: "bad-meta" };
    }
    // Cap serialized size so one event cannot smuggle a document.
    try {
      const s = JSON.stringify(raw.meta);
      if (s.length > 2048) return { ok: false, reason: "meta-too-large" };
      meta = raw.meta as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "bad-meta" };
    }
  }

  return {
    ok: true,
    event: {
      event_id,
      type,
      company_id,
      widget_key_id:
        typeof raw.widget_key_id === "string" && raw.widget_key_id.length > 0
          ? raw.widget_key_id.slice(0, MAX_ID_LEN)
          : null,
      url,
      path: derivePath(url, raw.path),
      referrer: optStr(raw.referrer, MAX_REF_LEN),
      viewport: optStr(raw.viewport, MAX_VP_LEN),
      user_agent: optStr(raw.user_agent, MAX_UA_LEN),
      session_hash,
      visitor_hash,
      value,
      meta,
      created_at,
    },
  };
}
