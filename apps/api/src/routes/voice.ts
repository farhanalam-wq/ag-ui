import { Elysia, t } from "elysia";
import {
  db,
  companies,
  companySnapshots,
  resolveWidgetKeyByHash,
  checkEmbedRateLimit,
  eq,
  desc,
} from "@ag-ui/database";
import { hashWidgetKey, logger } from "@ag-ui/shared";

const VOICEKIT_TOKEN_PATH = "/api/web-call/get-token";
const VOICEKIT_FETCH_TIMEOUT_MS = 15000;
const PROVIDER_DETAIL_MAX_CHARS = 300;

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
 */
async function mintVoiceKitToken(metadata?: { customer?: { name?: string } }): Promise<VoiceKitMint> {
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
  async ({ body, set, request }) => {
    const { companyId, widgetKey, metadata } = body;

    if ((companyId && widgetKey) || (!companyId && !widgetKey)) {
      set.status = 400;
      return { error: "Provide exactly one of companyId or widgetKey" };
    }

    // 1. Resolve identity (company row for both paths).
    let company: { id: string } | undefined;
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
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, resolved.row.companyId))
        .limit(1);
      company = row;
      rateLimitScopeId = resolved.keyHash;
    } else {
      const [row] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(eq(companies.id, companyId!))
        .limit(1);
      company = row;
      rateLimitScopeId = companyId!;
    }

    if (!company) {
      set.status = 404;
      return { error: "Company not found" };
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

    // 4. Mint via the provider (key stays server-side).
    const customerName = metadata?.customer?.name?.trim().slice(0, 120);
    try {
      const minted = await mintVoiceKitToken(
        customerName ? { customer: { name: customerName } } : undefined
      );
      logger.info(`[VOICE] Minted web-call token for company ${company.id}`);
      return {
        token: minted.token,
        roomName: minted.roomName ?? null,
        agentDispatch: minted.agentDispatch ?? null,
        livekitUrl: process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL || null,
      };
    } catch (err: any) {
      const status = err?.status === 503 ? 503 : 502;
      set.status = status;
      if (status === 503) logger.error("[VOICE] Token mint misconfigured: missing VOICEKIT env");
      else logger.error(`[VOICE] Token mint failed: ${err?.message || "unknown"}`);
      return { error: status === 503 ? "Voice not configured" : "Voice provider unavailable" };
    }
  },
  {
    body: t.Object({
      companyId: t.Optional(t.String({ format: "uuid" })),
      widgetKey: t.Optional(t.String({ minLength: 1, maxLength: 256 })),
      metadata: t.Optional(
        t.Object({
          customer: t.Optional(t.Object({ name: t.Optional(t.String({ maxLength: 120 })) })),
        })
      ),
    }),
    detail: {
      summary: "Mint voice call token",
      description:
        "Resolves a company id (first-party chat) or opaque widget key (embed), enforces READY-gate + rate limits, and returns a short-lived LiveKit token minted server-side via VoiceKit.",
    },
  }
);
