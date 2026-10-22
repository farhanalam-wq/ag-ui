/**
 * packages/analytics/src/events.ts
 *
 * Phase 1 — event validation for the tracking collector (Phase 2).
 * Pure functions, zero dependencies. Caps keep every column within its
 * storage budget so a malicious or buggy client cannot blow up a row.
 */

import { BROWSER_VALUES, OS_VALUES, type BrowserValue, type OsValue } from "./catalogue";

export type TrackEventType =
  | "pageview"
  | "chat_open"
  | "chat_message"
  | "conversion"
  | "scroll"
  | "download"
  | "click"
  | "heartbeat"
  | "voice_start"
  | "voice_end"
  | "chat_close";

export const TRACK_EVENT_TYPES: readonly TrackEventType[] = [
  "pageview",
  "chat_open",
  "chat_message",
  "conversion",
  "scroll",
  "download",
  "click",
  "heartbeat",
  "voice_start",
  "voice_end",
  "chat_close",
] as const;

/** Events that describe a voice call. They carry counts, never content. */
export const VOICE_EVENT_TYPES: readonly TrackEventType[] = ["voice_start", "voice_end"] as const;

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
  /** Derived at the collector from the request's user agent. */
  browser?: unknown;
  /** Derived at the collector from the request's user agent. */
  os?: unknown;
  /** Derived at the collector from the visitor's reported timezone. */
  tz_offset?: unknown;
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
  browser: BrowserValue | null;
  os: OsValue | null;
  tz_offset: number | null;
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

/** UTC-14 to UTC+14, in minutes. Nothing outside that is a real timezone. */
const MAX_TZ_OFFSET_MINUTES = 14 * 60;

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length === 0 || t.length > max) return null;
  return t;
}

/**
 * A derived dimension is only kept if it is one of the product's own values.
 *
 * The collector computes these, but the validator is the last gate before
 * the row is written, and a value outside the taxonomy would be a
 * breakdown nobody can act on.
 */
function enumValue<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  return (allowed as readonly string[]).includes(t) ? (t as T) : null;
}

/** A timezone offset in minutes, or null when it is missing or impossible. */
function tzOffsetValue(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < -MAX_TZ_OFFSET_MINUTES || rounded > MAX_TZ_OFFSET_MINUTES) return null;
  return rounded;
}

function optStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, max);
}

/** A session longer than this is a stuck tab, not a conversation. */
const MAX_EVENT_DURATION_SEC = 4 * 60 * 60;
/** One turn is one visitor utterance or question; more is not a real session. */
const MAX_EVENT_TURNS = 500;

/** A duration in seconds, clamped to something a real session could last. */
function durationValue(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(MAX_EVENT_DURATION_SEC, Math.max(0, Math.round(n))) : 0;
}

/** A turn count, clamped. Never a string: these fields are counts only. */
function turnsValue(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.min(MAX_EVENT_TURNS, Math.max(0, Math.round(n))) : 0;
}

/**
 * The counts a voice call may report.
 *
 * O-3 is a counts-only decision: voice is measurable, but not one word the
 * visitor said is stored. That is enforced here rather than trusted to the
 * client — the meta object is **rebuilt** from two numbers, so a snippet that
 * posts a transcript in `meta` has it dropped before the row exists. A future
 * change that wants transcripts has to change this function, which is exactly
 * the conversation the decision deserves.
 */
export function voiceEventMeta(
  type: TrackEventType,
  rawMeta: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (type === "voice_start") return {}; // a call started; nothing else to say
  if (type !== "voice_end") return rawMeta;

  const m = rawMeta ?? {};
  const safeTurns = turnsValue(m.turns);
  return {
    durationSec: durationValue(m.durationSec),
    turns: safeTurns,
    // Derived, not reported: a call where the visitor never spoke is a
    // silent call. One definition, at the gate, so the report and the
    // product cannot disagree about what abandonment means.
    abandoned: safeTurns === 0,
  };
}

/**
 * The counts a text chat may report.
 *
 * Same rule as voice: the parent measures the panel (it owns open/close
 * timing and the turn counter) and the collector rebuilds the meta from
 * numbers. A question's text, a page title, a conversation id pasted into
 * `meta` — none of it survives, because none of it is read.
 */
export function chatEventMeta(
  type: TrackEventType,
  rawMeta: Record<string, unknown> | null
): Record<string, unknown> | null {
  const m = rawMeta ?? {};
  if (type === "chat_open") return { turns: 0 };
  if (type === "chat_message") return { turns: turnsValue(m.turns) };
  if (type !== "chat_close") return rawMeta;
  return { durationSec: durationValue(m.durationSec), turns: turnsValue(m.turns) };
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
 * A page path a client sent, or null. Same rule the collector applies, minus
 * the fallback: the chat panel asks for the *host* path, and a conversation
 * must never claim a path it was not given. Query and hash are dropped, so a
 * path is a page and not a query log.
 */
export function normalizePagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed.split(/[?#]/)[0]!.slice(0, MAX_PATH_LEN) || "/";
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

  // Agent events keep their counts and nothing else — see the meta builders.
  if (type === "voice_start" || type === "voice_end") meta = voiceEventMeta(type, meta);
  if (type === "chat_open" || type === "chat_message" || type === "chat_close") {
    meta = chatEventMeta(type, meta);
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
      browser: enumValue(raw.browser, BROWSER_VALUES),
      os: enumValue(raw.os, OS_VALUES),
      tz_offset: tzOffsetValue(raw.tz_offset),
      session_hash,
      visitor_hash,
      value,
      meta,
      created_at,
    },
  };
}
