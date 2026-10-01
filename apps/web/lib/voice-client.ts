/**
 * Voice token client for ag-ui (Company AI).
 * Mints short-lived LiveKit web-call tokens via the backend proxy
 * (`POST /api/voice/token`) — the VoiceKit provider key never reaches
 * the browser. Error copy mirrors the text-chat surface so voice and
 * chat failures read identically.
 */

import { API_BASE_URL } from "./api-client";

export interface VoiceTokenRequest {
  companyId?: string;
  widgetKey?: string;
  apiBase?: string;
  // company is injected server-side at mint; client must never spoof it.
  // The optional field below exists only for forward-compat typing.
  metadata?: { customer?: { name?: string }; company?: { id?: string } };
}

export interface VoiceTokenResponse {
  token: string;
  roomName: string | null;
  agentDispatch: unknown;
  livekitUrl: string | null;
}

export const VOICE_LIVEKIT_URL_FALLBACK =
  process.env.NEXT_PUBLIC_LIVEKIT_URL || "";

/**
 * Resolve the effective LiveKit server URL: backend value first
 * (source of truth per call), public env fallback second.
 */
export function resolveLivekitUrl(minted: VoiceTokenResponse): string {
  return minted.livekitUrl || VOICE_LIVEKIT_URL_FALLBACK;
}

function baseFor(customBase?: string): string {
  if (customBase && customBase.trim()) return customBase.trim().replace(/\/$/, "");
  return API_BASE_URL.replace(/\/$/, "");
}

/**
 * Mint a LiveKit token for a voice call. Exactly one of `companyId`
 * (first-party `/?company=` chat) or `widgetKey` (embed iframe) is required.
 * Throws an `Error` whose message is display-ready UI copy.
 */
export async function fetchVoiceToken(
  req: VoiceTokenRequest,
  signal?: AbortSignal
): Promise<VoiceTokenResponse> {
  const base = baseFor(req.apiBase);

  let res: Response;
  try {
    res = await fetch(`${base}/api/voice/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(req.companyId ? { companyId: req.companyId } : {}),
        ...(req.widgetKey ? { widgetKey: req.widgetKey } : {}),
        ...(req.metadata ? { metadata: req.metadata } : {}),
      }),
      signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    throw new Error("Could not reach the voice service — check your connection");
  }

  if (res.ok) {
    const data = await res.json().catch(() => null);
    if (!data?.token) throw new Error("Voice service returned an invalid response");
    return {
      token: data.token,
      roomName: data.roomName ?? null,
      agentDispatch: data.agentDispatch ?? null,
      livekitUrl: data.livekitUrl ?? null,
    };
  }

  // Display copy matches the text-chat surface for the same states.
  if (res.status === 404) throw new Error("Assistant offline — not found");
  if (res.status === 410) throw new Error("This assistant was disabled");
  if (res.status === 409) throw new Error("Company indexing — try again shortly");
  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    throw new Error(
      retryAfter ? `Slow down — retry in ${retryAfter}s` : "Slow down — too many requests"
    );
  }
  if (res.status === 503) throw new Error("Voice is not available right now");
  if (res.status === 400) throw new Error("Could not start the voice call");

  const detail = await res.text().catch(() => "");
  throw new Error(
    detail && detail.length < 200 ? `Voice service error: ${detail}` : "Voice service error — try again"
  );
}
