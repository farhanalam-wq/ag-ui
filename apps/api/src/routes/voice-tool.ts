import { Elysia, t } from "elysia";
import { timingSafeEqual } from "node:crypto";
import {
  db,
  companies,
  companySnapshots,
  retrieveCompanyContext,
  checkEmbedRateLimit,
  eq,
  desc,
} from "@ag-ui/database";
import { logger } from "@ag-ui/shared";

const VOICE_SAFE_MAX_CHARS = 6000;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

async function getLatestSnapshot(companyId: string) {
  const [snap] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, companyId))
    .orderBy(desc(companySnapshots.version))
    .limit(1);
  return snap ?? null;
}

function isAuthorized(request: Request): boolean {
  const secret = process.env.VOICE_TOOL_SECRET || "";
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function stripToSpeechSafe(s: string): string {
  return (
    s
      // drop markdown tables / pipes / heavy formatting, keep words
      .replace(/[|]/g, " ")
      .replace(/[*_#>`]/g, "")
      // collapse whitespace
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function buildVoiceSafeContext(
  company: { name: string; domain: string },
  facts: { predicate: string; value: string }[],
  chunks: { documentTitle: string; content: string }[]
): string {
  let out = `COMPANY: ${company.name} (${company.domain})\n`;
  if (facts.length > 0) {
    out += `FACTS:\n`;
    for (const f of facts.slice(0, 20)) {
      out += `- ${f.predicate}: ${f.value}\n`;
    }
  }
  if (chunks.length > 0) {
    out += `EXCERPTS:\n`;
    chunks.forEach((c, idx) => {
      const clean = stripToSpeechSafe(c.content).slice(0, 1200);
      out += `[${idx + 1}] (${stripToSpeechSafe(c.documentTitle).slice(0, 120)}): ${clean}\n`;
    });
  }
  if (facts.length === 0 && chunks.length === 0) {
    out += `No published content found for this question yet.\n`;
  }
  if (out.length > VOICE_SAFE_MAX_CHARS) {
    out = out.slice(0, VOICE_SAFE_MAX_CHARS);
  }
  return out;
}

/**
 * In-call RAG webhook for the VoiceKit assistant tool `query_company_knowledge`.
 * Called per utterance: STT text -> retrieval -> spoken answer.
 * Body is exactly the LLM-generated args {company_id, query}.
 */
export const voiceToolRoutes = new Elysia({ prefix: "/api/voice/tool" }).post(
  "/query",
  async ({ body, set, request }) => {
    const t0 = performance.now();

    if (!process.env.VOICE_TOOL_SECRET) {
      logger.error("[VOICE-TOOL] Misconfigured: missing VOICE_TOOL_SECRET");
      set.status = 503;
      return { error: "Voice tool not configured" };
    }
    if (!isAuthorized(request)) {
      set.status = 401;
      return { error: "Unauthorized" };
    }

    const { company_id: companyId, query } = body;
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      set.status = 400;
      return { error: "Query must not be empty" };
    }

    // (a) company lookup -> 404
    const [company] = await db
      .select({ id: companies.id, name: companies.name, domain: companies.domain })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    if (!company) {
      set.status = 404;
      return { error: "Company not found" };
    }

    // (b) READY-gate -> 409 (reuse snapshot pattern from voice token route)
    const snapshot = await getLatestSnapshot(company.id);
    if (!snapshot || snapshot.status !== "READY") {
      set.status = 409;
      return {
        error: "Company indexing — try again shortly",
        status: snapshot?.status ?? "QUEUED",
      };
    }

    // (c) rate-limit -> 429
    const ip = getClientIp(request);
    const limit = await checkEmbedRateLimit(company.id, ip, "voice-tool");
    if (!limit.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(limit.retryAfterSec);
      return {
        error: `Slow down — retry in ${limit.retryAfterSec}s`,
        retryAfterSec: limit.retryAfterSec,
      };
    }

    // (d) retrieval (embed + Qdrant top-20 + PG hydration + MMR, Redis qctx hit when warm)
    let retrieved;
    try {
      retrieved = await retrieveCompanyContext(company.id, trimmedQuery, { chunkLimit: 6 });
    } catch (err: any) {
      logger.error(`[VOICE-TOOL] Retrieval failed for ${company.id}: ${err?.message || "unknown"}`);
      set.status = 502;
      return { error: "Knowledge lookup failed — try again" };
    }
    const retrievalMs = Math.round(performance.now() - t0);

    // (e) voice-safe context, 6000 chars max, plain speech
    const result = buildVoiceSafeContext(
      { name: company.name, domain: company.domain },
      retrieved.facts.map((f) => ({ predicate: f.predicate, value: f.value })),
      retrieved.chunks.map((c) => ({ documentTitle: c.documentTitle, content: c.content }))
    );

    logger.debug(
      `[VOICE-TOOL] company=${company.id} snapshot=${snapshot.id} evidence=${retrieved.evidence.length} retrievalMs=${retrievalMs} qlen=${trimmedQuery.length}`
    );
    logger.info(
      `[VOICE-TOOL] Served query for company ${company.id} in ${retrievalMs}ms (${retrieved.evidence.length} evidence)`
    );

    // (f) VoiceKit consumes `result`; keep key name stable and documented
    return {
      result,
      evidence_count: retrieved.evidence.length,
      snapshot_id: snapshot.id,
    };
  },
  {
    body: t.Object({
      company_id: t.String({ format: "uuid" }),
      query: t.String({ minLength: 1, maxLength: 2000 }),
    }),
    detail: {
      summary: "Voice RAG webhook (query_company_knowledge)",
      description:
        "In-call retrieval for the VoiceKit assistant. Validates Bearer VOICE_TOOL_SECRET, READY-gate + rate limits, runs retrieveCompanyContext, and returns voice-safe plain-text result.",
    },
  }
);
