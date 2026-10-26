/**
 * CSRF guard for cookie-authenticated dashboard/auth routes
 * (docs/auth-tenancy.md §10.4).
 *
 * The session cookie is SameSite=Lax; this is the second layer. Every unsafe
 * dashboard or auth request must prove it came from `APP_URL` via `Origin`
 * (falling back to `Referer`). `Sec-Fetch-Site`, when present, must not say
 * cross-site.
 *
 * Exempt by design:
 * - `/api/embed/*` — no cookies; the key + allowed-origin gate is the control.
 * - `/api/voice/tool/*` — server-to-server bearer secret, no cookies.
 * - `/api/voice/token` — dual route: the widget-key path is cookie-free and
 *   origin-gated, while the company path is protected by SameSite=Lax (a
 *   cross-site POST does not carry the session cookie).
 */
import { Elysia, status } from "elysia";
import { authConfig } from "./auth/config";

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_PREFIXES = ["/api/embed/", "/api/voice/tool/"];
const EXEMPT_EXACT = new Set(["/api/voice/token"]);

export type CsrfFailure = "origin" | "fetch-site";

function originOf(value: string | null): string | null {
  if (!value || value === "null") return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/** Pure decision function, unit-tested without a running app. */
export function checkCsrf(
  request: Request,
  appUrl: string
): { ok: true } | { ok: false; reason: CsrfFailure } {
  const method = request.method.toUpperCase();
  if (!UNSAFE_METHODS.has(method)) return { ok: true };

  const pathname = new URL(request.url).pathname;
  if (
    EXEMPT_EXACT.has(pathname) ||
    EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  ) {
    return { ok: true };
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "same-site") {
    return { ok: false, reason: "fetch-site" };
  }

  const source =
    request.headers.get("origin") ?? request.headers.get("referer");
  const sourceOrigin = originOf(source);
  const appOrigin = originOf(appUrl);

  if (!sourceOrigin || !appOrigin || sourceOrigin !== appOrigin) {
    return { ok: false, reason: "origin" };
  }

  return { ok: true };
}

/** Global guard. Registered after CORS so a 403 still carries CORS headers. */
export const csrfPlugin = new Elysia({ name: "csrf" }).onRequest(
  ({ request }) => {
    const decision = checkCsrf(request, authConfig.appUrl);
    if (!decision.ok) {
      return status(403, { error: "Invalid request origin" });
    }
  }
);
