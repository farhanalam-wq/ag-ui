/**
 * packages/shared/src/signals-draft.ts
 *
 * Intelligence → Signals. An FAQ + JSON-LD patch drafted from an Intent Radar
 * blindspot cluster, grounded in what the company's knowledge base retrieved
 * for the cluster's question.
 *
 * The honesty contract, encoded here:
 *
 *   - The draft answers **only** from the supplied retrieval context. The
 *     prompt says so, the parser enforces the shape, and a model that
 *     reports the sources do not answer the question yields `answerable:
 *     false` — the route refuses, it does not store a plausible guess.
 *   - `sources` are the retrieved documents the answer leans on; they are
 *     the reviewer's first check, not decoration.
 *   - The JSON-LD is the public artifact: FAQPage schema for answer engines,
 *     carrying nothing internal — no retrieval scores, no cluster keys.
 *
 * The LLM call itself is `streamChatCompletion` (the chat path's wrapper);
 * everything testable — the JSON shape, the JSON-LD builder — is pure.
 */

import { streamChatCompletion, type ChatMessage } from "./llm";

export interface FaqSource {
  title: string;
  url: string;
}

export interface FaqDraftContent {
  question: string;
  answer: string;
  sources: FaqSource[];
}

export interface DraftContext {
  companyName: string;
  domain: string;
  question: string;
  /** Retrieved chunks: { documentTitle, documentUrl, content } — plain data. */
  chunks: Array<{ documentTitle?: unknown; documentUrl?: unknown; content?: unknown }>;
  /** Deterministic entity facts, already matched to the query. */
  facts?: Array<{ predicate?: unknown; value?: unknown }>;
}

const DRAFT_MODEL = "gpt-4o-mini";

/* ------------------------------------------------------------------ */
/* Pure builders — the tested surface.                                  */
/* ------------------------------------------------------------------ */

/** Parse the model's reply. Null when the shape is not the agreed contract. */
export function parseDraftJson(
  text: string
): { question: string; answer: string; answerable: boolean } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const question = typeof obj["question"] === "string" ? obj["question"].trim() : "";
    const answer = typeof obj["answer"] === "string" ? obj["answer"].trim() : "";
    const answerable = obj["answerable"] === true;
    if (answerable && (!question || !answer)) return null;
    if (!answerable && !question) return null;
    return { question, answer, answerable };
  } catch {
    return null;
  }
}

/**
 * The public artifact: schema.org FAQPage for answer engines. Built from the
 * FAQ text only — no sources, no scores, no cluster key — because structured
 * data is what search engines read, not an internal draft record.
 */
export function buildFaqJsonLd(question: string, answer: string): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: question,
        acceptedAnswer: { "@type": "Answer", text: answer },
      },
    ],
  };
}

/* ------------------------------------------------------------------ */
/* The generation call.                                                 */
/* ------------------------------------------------------------------ */

export interface GenerateFaqResult {
  draft: FaqDraftContent;
  model: string;
  /** True when the sources could not answer the question — caller refuses. */
  answerable: boolean;
}

export async function generateFaqDraft(opts: DraftContext & { apiKey?: string }): Promise<GenerateFaqResult> {
  const sourceBlock = opts.chunks
    .slice(0, 6)
    .map(
      (c, i) =>
        `[${i + 1}] ${String(c.documentTitle ?? "Untitled")} (${String(c.documentUrl ?? "no url")})\n${String(c.content ?? "").slice(0, 1200)}`
    )
    .join("\n\n");
  const factBlock = (opts.facts ?? [])
    .map((f) => `- ${String(f.predicate ?? "fact")}: ${String(f.value ?? "")}`)
    .join("\n");

  const system: ChatMessage = {
    role: "system",
    content: [
      `You draft FAQ content for the website of ${opts.companyName} (${opts.domain}).`,
      `Visitors keep asking: "${opts.question}" — the site's own material should answer it directly.`,
      "Rules:",
      "1. Use ONLY the supplied source material. Never invent a fact, price, date or promise.",
      "2. If the sources do not contain enough to answer, set answerable=false and explain nothing further.",
      "3. Answer in the second person, as the company speaking to the visitor. Two to four sentences.",
      "4. Reply with ONLY a JSON object: {\"question\": string, \"answer\": string, \"answerable\": boolean}.",
    ].join("\n"),
  };
  const user: ChatMessage = {
    role: "user",
    content: `Sources:\n\n${sourceBlock || "(no source material retrieved)"}${factBlock ? `\n\nCompany facts:\n${factBlock}` : ""}`,
  };

  const { fullText } = await streamChatCompletion([system, user], { model: DRAFT_MODEL });
  const parsed = parseDraftJson(fullText);
  if (!parsed) throw new Error("draft model returned an unparseable reply");

  const sources: FaqSource[] = opts.chunks
    .filter(
      (c) =>
        typeof c.documentUrl === "string" &&
        c.documentUrl &&
        typeof c.documentTitle === "string"
    )
    .slice(0, 4)
    .map((c) => ({
      title: String(c.documentTitle),
      url: String(c.documentUrl),
    }));

  return {
    draft: { question: parsed.question || opts.question, answer: parsed.answer, sources },
    model: DRAFT_MODEL,
    answerable: parsed.answerable,
  };
}
