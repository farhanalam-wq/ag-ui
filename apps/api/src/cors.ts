/**
 * Explicit CORS policies (docs/auth-tenancy.md §10.3).
 *
 * Two surfaces, never one global `origin: true` + `credentials: true`:
 *
 * - dashboard + auth: only the exact `APP_URL`, credentials allowed;
 * - public embed (`/api/embed/*`, voice-by-key): reflect the request origin,
 *   credentials never allowed;
 * - voice tool: no browser CORS at all (server-to-server bearer secret).
 *
 * The embed surface reflects any origin because the request itself is still
 * gated by the key + allowed-origin allowlist in `widget-key-domains.ts`.
 */
import { Elysia } from "elysia";
import { authConfig } from "./auth/config";

export type CorsSurface = "dashboard" | "embed" | "none";

export interface CorsPolicy {
  surface: CorsSurface;
  /** `null` means "do not emit Access-Control-Allow-Origin". */
  allowOrigin: string | null;
  credentials: boolean;
}

const EMBED_PREFIX = "/api/embed/";
// Dual routes: dashboard company path vs public widget-key path. Treated as
// the embed surface for any non-dashboard origin (the handler's origin gate
// then decides whether the key may serve that page).
const VOICE_DUAL_PATHS = new Set(["/api/voice/token", "/api/voice/transcript"]);
const VOICE_TOOL_PREFIX = "/api/voice/tool/";

function originOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Pick the policy for one request. `origin` is the raw `Origin` header (null
 * when the browser did not send one).
 */
export function corsPolicyFor(
  method: string,
  pathname: string,
  origin: string | null,
  appUrl: string
): CorsPolicy {
  const requestOrigin = originOf(origin);
  const appOrigin = originOf(appUrl);

  if (pathname.startsWith(VOICE_TOOL_PREFIX)) {
    return { surface: "none", allowOrigin: null, credentials: false };
  }

  if (pathname.startsWith(EMBED_PREFIX)) {
    return {
      surface: "embed",
      allowOrigin: requestOrigin,
      credentials: false,
    };
  }

  // Dual route: dashboard company path vs public widget-key path. A dashboard
  // request is exactly APP_URL; everything else is treated as the embed
  // surface so the widget still gets an allow-origin header (and then the
  // handler's origin gate decides whether the key may serve that page).
  if (VOICE_DUAL_PATHS.has(pathname)) {
    const dashboard = Boolean(requestOrigin && requestOrigin === appOrigin);
    return dashboard
      ? { surface: "dashboard", allowOrigin: appOrigin, credentials: true }
      : { surface: "embed", allowOrigin: requestOrigin, credentials: false };
  }

  const allowed = Boolean(requestOrigin && requestOrigin === appOrigin);
  return {
    surface: "dashboard",
    allowOrigin: allowed ? appOrigin : null,
    credentials: allowed,
  };
}

/** Response headers for a normal (non-preflight) request. */
export function corsHeaders(
  policy: CorsPolicy,
  request: Request
): Record<string, string> {
  if (policy.surface === "none") return {};

  const headers: Record<string, string> = { Vary: "Origin" };

  if (policy.allowOrigin) {
    headers["Access-Control-Allow-Origin"] = policy.allowOrigin;
    if (policy.credentials) {
      headers["Access-Control-Allow-Credentials"] = "true";
    }
  }

  if (request.method.toUpperCase() === "OPTIONS") {
    headers["Access-Control-Allow-Methods"] =
      "GET, POST, PUT, PATCH, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] =
      request.headers.get("access-control-request-headers") ??
      "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "600";
  }

  return headers;
}

/**
 * One preflight handler, registered before routing. Returning a Response from
 * `onRequest` short-circuits the request, so OPTIONS is answered exactly once
 * and never reaches the auth policy (which has no OPTIONS entries).
 */
export const corsPlugin = new Elysia({ name: "cors" }).onRequest(
  ({ request, set }) => {
    const pathname = new URL(request.url).pathname;
    const policy = corsPolicyFor(
      request.method,
      pathname,
      request.headers.get("origin"),
      authConfig.appUrl
    );
    const headers = corsHeaders(policy, request);

    for (const [name, value] of Object.entries(headers)) {
      set.headers[name] = value;
    }

    if (request.method.toUpperCase() === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
  }
);
