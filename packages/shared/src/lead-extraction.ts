/**
 * Zero-form lead extraction from a conversation transcript (spec §9.2).
 *
 * One LLM structured-output call per conversation turn. The schema lives in
 * code (platform-layer concern, spec §3 layer 1) and has no admin controls in
 * v1. Every artifact is an observation the visitor volunteered in chat — we
 * never scrape or infer PII beyond what they typed.
 */

import type { ChatMessage } from "./llm";
import { DEFAULT_CHAT_MODEL, type CompetitorMention } from "./conversation-signals";
import { logger } from "./logger";

export interface LeadBant {
  budget: string | null;
  authority: string | null;
  need: string | null;
  timeline: string | null;
}

export interface LeadExtraction {
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  bant: LeadBant;
  tech_stack: string[];
  competitors: CompetitorMention[];
  /** Extractor self-reported confidence, 0..1. */
  confidence: number;
}

const SYSTEM_PROMPT = `You extract lead signals from a conversation between a website visitor and a company's AI assistant.

Return ONLY a JSON object (no markdown, no prose). Extract strictly from what the visitor typed; never invent or guess contact details. If something was not said, use null (or an empty list).

Schema:
{
  "contact_name": string | null,      // visitor's name only if they stated it
  "email": string | null,             // only a literal email they typed
  "phone": string | null,             // only a literal phone they typed
  "company": string | null,           // visitor's employer if stated
  "bant": { "budget": string | null, "authority": string | null, "need": string | null, "timeline": string | null },
  "tech_stack": string[],             // technologies they mentioned using, max 10
  "competitors": [{ "name": string, "quote": string }],  // competitor/alternative products mentioned by the visitor, max 10; quote = short verbatim snippet
  "confidence": number                 // 0..1, your confidence that real lead signals exist
}

BANT cues:
- budget: money/pricing expectations stated by the visitor
- authority: signals they decide or sign (e.g. "I'm the CTO")
- need: what they are trying to solve
- timeline: urgency or dates ("this quarter", "next week")

Contact details: extract an email/phone ONLY when the visitor offers it for the
purpose of being contacted ("contact me at…", "you can reach me on…", "my
number is …" in answer to how they may be reached). A contact string that is
merely quoted, belongs to someone else, or is explicitly off-limits ("don't
email that address") is NOT a lead — set null. If no contact details were
offered for contact purposes, set email/phone null even if strings appear
verbatim.

An empty extraction (all nulls, empty lists) is a valid and common result.`;

function cap(s: unknown, max: number): string | null {
  if (typeof s !== "number" && typeof s !== "string") return null;
  const v = String(s).trim();
  return v.length > 0 ? v.slice(0, Math.min(v.length, max)) : null;
}

function clamp01(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(0, Math.min(1, v));
}

/**
 * Phone hygiene: a lead phone number must plausibly dial. Keep the raw
 * formatting the visitor used (parentheses, dashes, country codes), but
 * require at least 7 digits underneath it. Punctuation-only strings and
 * irrelevant numbers (order ids, dates) never become phone leads.
 */
export function sanitizePhone(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (v.length === 0 || v.length > 40) return null;
  const digits = v.replace(/\D/g, "");
  return digits.length >= 7 ? v : null;
}

function sanitize(raw: unknown): LeadExtraction {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bantRaw = (obj.bant && typeof obj.bant === "object" ? obj.bant : {}) as Record<string, unknown>;
  const stack = Array.isArray(obj.tech_stack)
    ? obj.tech_stack.map((t) => cap(t, 80) ?? "").filter(Boolean).slice(0, 10)
    : [];
  const competitors = (Array.isArray(obj.competitors) ? obj.competitors : [])
    .slice(0, 10)
    .map((c) => {
      const item = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
      const name = cap(item.name, 80);
      const quote = cap(item.quote, 280);
      return name ? { name, quote: quote ?? "" } : null;
    })
    .filter((c): c is CompetitorMention => c !== null);
  return {
    contact_name: cap(obj.contact_name, 120),
    email:
      typeof obj.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(obj.email.trim())
        ? obj.email.trim().slice(0, 200)
        : null,
    phone: sanitizePhone(obj.phone),
    company: cap(obj.company, 160),
    bant: {
      budget: cap(bantRaw.budget, 240),
      authority: cap(bantRaw.authority, 240),
      need: cap(bantRaw.need, 240),
      timeline: cap(bantRaw.timeline, 240),
    },
    tech_stack: stack,
    competitors,
    confidence: clamp01(obj.confidence),
  };
}

function parseLooseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // Tolerate models that wrap JSON in fences despite instructions.
    const m = text.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fallthrough */
      }
    }
    return null;
  }
}

/**
 * Extract lead signals from a transcript. Returns null only when the LLM is
 * unconfigured or the call/parse failed (callers skip enrichment, they never
 * infer). A valid response is always sanitised to a well-shaped object —
 * including the all-null "no signals" case, which is normal.
 */
export async function extractLeadFromConversation(
  transcript: ChatMessage[],
  opts?: { model?: string; apiKey?: string }
): Promise<LeadExtraction | null> {
  const apiKey = opts?.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    logger.warn("[LEAD EXTRACTION] OPENAI_API_KEY not configured — skipping");
    return null;
  }
  const model = opts?.model || DEFAULT_CHAT_MODEL;

  const body = {
    model,
    temperature: 0,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({ transcript: transcript.map((m) => ({ role: m.role, content: m.content })) }),
      },
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return sanitize(parseLooseJson(content));
  } catch (err) {
    logger.warn(`[LEAD EXTRACTION] Failed: ${(err as Error).message}`);
    return null;
  }
}
