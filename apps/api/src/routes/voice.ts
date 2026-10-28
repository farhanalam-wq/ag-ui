import { Elysia, t } from "elysia";
import {
  db,
  companies,
  companySnapshots,
  conversations,
  messages,
  resolveWidgetKeyByHash,
  checkEmbedRateLimit,
  getRedisClient,
  assertOriginAllowed,
  safeRefererForLog,
  eq,
  desc,
  sql,
  recordError,
} from "@ag-ui/database";
import { hashWidgetKey, logger } from "@ag-ui/shared";
import { normalizePagePath } from "@ag-ui/analytics";
import { requireCompany } from "../auth/plugin";

const VOICEKIT_TOKEN_PATH = "/api/web-call/get-token";
const VOICEKIT_FETCH_TIMEOUT_MS = 15000;
const PROVIDER_DETAIL_MAX_CHARS = 300;
const VOICE_ROOM_TTL_SECONDS = 3600;

// In-memory room -> company fallback (Redis is durable path below).
const roomCompanyMap = new Map<string, string>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

async function resolveActiveKey(rawKey: string) {
  let keyHash: string;
  try {
    keyHash = hashWidgetKey(rawKey);
  } catch {
    return { error: "not_found" as const };
  }
  const row = await resolveWidgetKeyByHash(keyHash);
  if (!row) return { error: "not_found" as const };
  if (row.revoked) return { error: "revoked" as const };
  return { row, keyHash };
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

interface VoiceKitMint {
  token: string;
  roomName?: string;
  agentDispatch?: unknown;
}

/**
 * Mint a short-lived LiveKit web-call token from the VoiceKit provider.
 * The provider API key never leaves the server — the browser only
 * receives the LiveKit token, room name, and public LiveKit URL.
 * `company.id` is always injected server-side so the assistant prompt
 * can render {{company.id}} and the tool can enforce per-call isolation.
 */
async function mintVoiceKitToken(metadata: {
  customer?: { name?: string };
  company: { id: string };
}): Promise<VoiceKitMint> {
  const baseUrl = (process.env.VOICEKIT_API_URL || "").replace(/\/$/, "");
  const apiKey = process.env.VOICEKIT_API_KEY || "";
  const assistantId = process.env.VOICEKIT_ASSISTANT_ID || "";

  if (!baseUrl || !apiKey || !assistantId) {
    throw Object.assign(new Error("Voice not configured"), { status: 503 });
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${VOICEKIT_TOKEN_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ assistant_id: assistantId, metadata }),
      signal: AbortSignal.timeout(VOICEKIT_FETCH_TIMEOUT_MS),
    });
  } catch (err: any) {
    throw Object.assign(
      new Error(`Voice provider unreachable: ${err?.message || "fetch failed"}`.slice(0, PROVIDER_DETAIL_MAX_CHARS)),
      { status: 502 }
    );
  }

  // Read as text first: a failing upstream proxy can answer with HTML,
  // and res.json() would then throw a SyntaxError over the real failure.
  const body = await res.text().catch(() => "");
  if (!res.ok) {
    throw Object.assign(
      new Error(`Voice provider unavailable: ${(body || res.statusText).slice(0, PROVIDER_DETAIL_MAX_CHARS)}`),
      { status: 502 }
    );
  }

  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Voice provider returned an invalid response"), { status: 502 });
  }

  const token = json?.data?.token;
  if (typeof token !== "string" || !token) {
    throw Object.assign(new Error("Voice provider returned no token"), { status: 502 });
  }

  return { token, roomName: json.data.room_name, agentDispatch: json.data.agent_dispatch };
}

export const voiceRoutes = new Elysia({ prefix: "/api/voice" }).post(
  "/token",
  async (ctx) => {
    const { body, set, request } = ctx;
    const { companyId, widgetKey, metadata } = body;

    if ((companyId && widgetKey) || (!companyId && !widgetKey)) {
      // The auth plugin enforces the same rule before the handler. Keep this
      // branch for direct handler tests and for a consistent 422 contract.
      set.status = 422;
      return { error: "Provide exactly one of companyId or widgetKey" };
    }

    // 1. Resolve identity (company row for both paths).
    let company: { id: string; name: string; domain: string } | undefined;
    let rateLimitScopeId: string;

    if (widgetKey) {
      const resolved = await resolveActiveKey(widgetKey);
      if (resolved.error === "not_found") {
        set.status = 404;
        return { error: "Widget key not found" };
      }
      if (resolved.error === "revoked" || !resolved.row || !resolved.keyHash) {
        set.status = 410;
        return { error: "Widget key revoked" };
      }
      const [row] = await db
        .select({ id: companies.id, name: companies.name, domain: companies.domain })
        .from(companies)
        .where(eq(companies.id, resolved.row.companyId))
        .limit(1);
      company = row;
      rateLimitScopeId = resolved.keyHash;

      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }

      // Public key path: same deny-by-default origin gate as config/chat.
      // A DB failure reads as unavailable, never as allowed.
      let gate;
      try {
        gate = await assertOriginAllowed(resolved.row.id, request);
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        logger.error(`[VOICE] Gate unavailable: ${message}`);
        void recordError({
          source: "voice",
          message,
          stack: err instanceof Error ? err.stack : undefined,
          context: { keyPrefix: resolved.row.keyPrefix, stage: "voice-gate" },
          companyId: company.id,
        });
        set.status = 503;
        return { error: "Voice unavailable - try again shortly", code: "VOICE_UNAVAILABLE" };
      }
      if (!gate.allowed) {
        logger.warn(
          `[VOICE] Blocked token for key ${resolved.row.keyPrefix}… reason=${gate.reason} referer=${safeRefererForLog(request.headers.get("referer"))}`
        );
        set.status = 403;
        return { error: "This key is not allowed on this site", reason: gate.reason };
      }
    } else {
      // Session path: the guard has already checked company ownership. Using
      // the resolved row avoids a second, unowned lookup by body id.
      const owned = await requireCompany(ctx, "body");
      company = { id: owned.id, name: owned.name, domain: owned.domain };
      rateLimitScopeId = owned.id;
    }

    // 2. READY-gate: never mint voice for partial snapshots.
    const snapshot = await getLatestSnapshot(company.id);
    if (!snapshot || snapshot.status !== "READY") {
      set.status = 409;
      return {
        error: "Company indexing — try again shortly",
        status: snapshot?.status ?? "QUEUED",
      };
    }

    // 3. Rate-limit BEFORE touching the provider (per key/company + IP).
    const ip = getClientIp(request);
    const limit = await checkEmbedRateLimit(rateLimitScopeId, ip, "voice");
    if (!limit.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(limit.retryAfterSec);
      return {
        error: `Slow down — retry in ${limit.retryAfterSec}s`,
        retryAfterSec: limit.retryAfterSec,
      };
    }

    // 4. Persist the voice conversation IF the provider call succeeds, before
    // returning: the identity exists at call start, the transcript save later
    // only appends. A persistence failure degrades gracefully (no
    // conversation id returned; recordError keeps the signal) — voice never
    // dies because of bookkeeping.
    let voiceConversationId: string | null = null;
    // 5. Mint via the provider (key stays server-side).
    // Company id is injected server-side — never trust client-sent company.
    const customerName = metadata?.customer?.name?.trim().slice(0, 120);
    try {
      const minted = await mintVoiceKitToken({
        ...(customerName ? { customer: { name: customerName } } : {}),
        company: { id: company.id },
      });
      // Cookieless visit identity for the voice conversation row (same hashes
      // the chat path stamps). Absent on handcrafted URLs; chat still works.
      const sessionHash =
        typeof body.session_hash === "string" && body.session_hash.length >= 8
          ? body.session_hash.slice(0, 64)
          : null;
      const visitorHash =
        typeof body.visitor_hash === "string" && body.visitor_hash.length >= 8
          ? body.visitor_hash.slice(0, 64)
          : null;
      try {
        const [createdConv] = await db
          .insert(conversations)
          .values({
            companyId: company.id,
            title: "New Conversation",
            // Voice conversations carry their channel on the row: the docket
            // badges them, the sheet labels them, clustering can filter.
            channel: "voice",
            path: normalizePagePath(body.path),
            sessionHash,
            visitorHash,
          })
          .returning({ id: conversations.id });
        voiceConversationId = createdConv.id;
      } catch (persistErr) {
        logger.error(`[VOICE] conversation persist failed: ${(persistErr as Error).message}`);
        void recordError({
          source: "voice",
          message: persistErr instanceof Error ? persistErr.message : String(persistErr),
          stack: persistErr instanceof Error ? persistErr.stack : undefined,
          context: { companyId: company.id, stage: "conversation-persist" },
          companyId: company.id,
        });
      }
      if (minted.roomName) {
        roomCompanyMap.set(minted.roomName, company.id);
        try {
          const r = await getRedisClient();
          if (r) {
            await r.set(
              `voice:room:${minted.roomName}`,
              company.id,
              "EX",
              VOICE_ROOM_TTL_SECONDS
            );
          }
        } catch {
          // best-effort: in-memory map above still resolves this process
        }
      }
      logger.info(`[VOICE] Minted web-call token for company ${company.id} (${company.domain}) room ${minted.roomName ?? "unknown"}`);
      return {
        token: minted.token,
        roomName: minted.roomName ?? null,
        agentDispatch: minted.agentDispatch ?? null,
        livekitUrl: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || null,
        conversationId: voiceConversationId,
      };
    } catch (err: any) {
      const status = err?.status === 503 ? 503 : 502;
      set.status = status;
      if (status === 503) logger.error("[VOICE] Token mint misconfigured: missing VOICEKIT env");
      else logger.error(`[VOICE] Token mint failed: ${err?.message || "unknown"}`);
      void recordError({
        source: "voice",
        message: err?.message ?? String(err),
        stack: err?.stack,
        context: { companyId: company.id, stage: "token-mint", status },
        companyId: company.id,
      });
      return { error: status === 503 ? "Voice not configured" : "Voice provider unavailable" };
    }
  },
  {
    body: t.Object({
      companyId: t.Optional(t.String({ format: "uuid" })),
      widgetKey: t.Optional(t.String({ minLength: 1, maxLength: 256 })),
      // Host page the call started from (embed only), like the chat body.
      path: t.Optional(t.String({ maxLength: 1024, minLength: 1 })),
      // Cookieless visit identity (embed only): random ids the loader minted,
      // stamped on the voice conversation row for the Visitors visit context.
      session_hash: t.Optional(t.String({ maxLength: 64 })),
      visitor_hash: t.Optional(t.String({ maxLength: 64 })),
      metadata: t.Optional(
        t.Object({
          customer: t.Optional(t.Object({ name: t.Optional(t.String({ maxLength: 120 })) })),
        })
      ),
    }),
    detail: {
      summary: "Mint voice call token",
      description:
        "Resolves a company id (first-party chat) or opaque widget key (embed), enforces READY-gate + rate limits, creates the channel-marked voice conversation, and returns a short-lived LiveKit token minted server-side via VoiceKit.",
    },
  }
)
  // 2. Persist a voice call transcript (same dual identity as /token). The
  // conversation was created at mint time; this appends the finalized STT
  // lines exactly once. Product data path — independent of `data-track`.
  .post(
    "/transcript",
    async (ctx) => {
      const { body, set, request } = ctx;

      // 1. Identity: public path via widget key + origin gate; session path
      // already resolved by the auth plugin (requireCompany checks ownership).
      let companyId: string;
      let rateLimitScopeId: string;
      if (body.widgetKey) {
        const resolved = await resolveActiveKey(body.widgetKey);
        if (resolved.error === "not_found") {
          set.status = 404;
          return { error: "Widget key not found" };
        }
        if (resolved.error === "revoked" || !resolved.row || !resolved.keyHash) {
          set.status = 410;
          return { error: "Widget key revoked" };
        }
        let gate;
        try {
          gate = await assertOriginAllowed(resolved.row.id, request);
        } catch (err) {
          const message = (err as Error)?.message ?? String(err);
          logger.error(`[VOICE] Transcript gate unavailable: ${message}`);
          void recordError({
            source: "voice",
            message,
            stack: err instanceof Error ? err.stack : undefined,
            context: { keyPrefix: resolved.row.keyPrefix, stage: "transcript-gate" },
            companyId: resolved.row.companyId,
          });
          set.status = 503;
          return { error: "Voice unavailable - try again shortly", code: "VOICE_UNAVAILABLE" };
        }
        if (!gate.allowed) {
          set.status = 403;
          return { error: "This key is not allowed on this site", reason: gate.reason };
        }
        companyId = resolved.row.companyId;
        rateLimitScopeId = resolved.keyHash;
      } else {
        const company = await requireCompany(ctx, "body");
        companyId = company.id;
        rateLimitScopeId = company.id;
      }

      // 2. Rate limit: a transcript save is one per call; the shared voice
      // bucket bounds a flood as tightly as token minting does.
      const ip = getClientIp(request);
      const limit = await checkEmbedRateLimit(rateLimitScopeId, ip, "voice");
      if (!limit.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(limit.retryAfterSec);
        return { error: `Slow down — retry in ${limit.retryAfterSec}s`, retryAfterSec: limit.retryAfterSec };
      }

      // 3. The conversation must be a voice conversation of that company.
      const [conv] = await db
        .select({ id: conversations.id, companyId: conversations.companyId, channel: conversations.channel, title: conversations.title })
        .from(conversations)
        .where(eq(conversations.id, body.conversation_id))
        .limit(1);
      if (!conv || conv.companyId !== companyId) {
        set.status = 404;
        return { error: "Conversation not found" };
      }
      if (conv.channel !== "voice") {
        set.status = 409;
        return { error: "Conversation is not a voice session" };
      }

      // 4. Exactly one transcript per conversation: a saved call must not be
      // re-persisted, and an already-populated conversation (playground text
      // turn oddly routed) must not get a transcript stapled onto it.
      const [counted] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(eq(messages.conversationId, conv.id));
      if ((counted?.count ?? 0) > 0) {
        set.status = 409;
        return { error: "Transcript already saved" };
      }

      // 5. Keep only well-formed lines; STT output can be junk: empty, or
      // absurd — caps bound the write, not the caller's ambition.
      const lines = body.lines
        .map((l) => ({
          speaker: l.speaker === "agent" ? ("assistant" as const) : ("user" as const),
          text: l.text.trim().slice(0, 4000),
        }))
        .filter((l) => l.text.length > 0);
      if (lines.length === 0) {
        set.status = 422;
        return { error: "Transcript has no usable lines" };
      }

      // Stable ordering: messages order by (created_at, id); one row per line
      // at ms-increments keeps the dialogue order regardless of insertion.
      const base = Date.now();
      await db.insert(messages).values(
        lines.map((l, i) => ({
          conversationId: conv.id,
          role: l.speaker,
          content: l.text,
          meta: { engine: "voice" },
          createdAt: new Date(base + i),
        }))
      );

      // Title the docket row from the first visitor utterance: the default
      // "New Conversation" would hide real content behind a generic label.
      const firstUserLine = lines.find((l) => l.speaker === "user");
      if (firstUserLine) {
        await db
          .update(conversations)
          .set({ title: firstUserLine.text.slice(0, 80) })
          .where(eq(conversations.id, conv.id));
      }

      logger.info(`[VOICE] Transcript saved: conversation ${conv.id} (${lines.length} lines)`);
      return { saved: true, count: lines.length };
    },
    {
      body: t.Object({
        companyId: t.Optional(t.String({ format: "uuid" })),
        widgetKey: t.Optional(t.String({ minLength: 1, maxLength: 256 })),
        conversation_id: t.String({ format: "uuid" }),
        lines: t.Array(
          t.Object({
            speaker: t.Union([t.Literal("user"), t.Literal("agent")]),
            text: t.String({ minLength: 1, maxLength: 4000 }),
          }),
          { maxItems: 200 }
        ),
      }),
      detail: {
        summary: "Persist a voice transcript",
        description:
          "Appends finalized voice-call utterances to the channel-marked conversation created at token mint. Same dual identity as the token route: key-scoped (with the site origin gate) or company-scoped via session.",
      },
    }
  );
