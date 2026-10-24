/**
 * Session and OAuth-state cookies.
 *
 * The session cookie is httpOnly, SameSite=Lax, Secure in production, and
 * host-only unless COOKIE_DOMAIN is configured. Names follow docs/auth-tenancy.md
 * §4.4:
 *   dev                     -> ag_session
 *   prod, same origin       -> __Host-ag_session
 *   prod, sibling subdomain -> __Secure-ag_session (+ Domain)
 */

import { authConfig } from "./config";

const secure = authConfig.isProduction;
const domain = authConfig.isProduction ? authConfig.cookieDomain : "";

export const SESSION_COOKIE = secure
  ? domain
    ? "__Secure-ag_session"
    : "__Host-ag_session"
  : "ag_session";

/**
 * `__Host-` requires Path=/ and no Domain, which is incompatible with scoping
 * the state cookie to the callback path. Use `__Secure-` in production.
 */
export const OAUTH_STATE_COOKIE = secure ? "__Secure-ag_oauth_state" : "ag_oauth_state";

const OAUTH_STATE_PATH = "/api/auth/google";
const OAUTH_STATE_MAX_AGE = 600;

interface CookieOptions {
  maxAge: number;
  path: string;
  domain?: string;
}

function serialize(name: string, value: string, opts: CookieOptions): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    "SameSite=Lax",
    "HttpOnly",
  ];
  if (secure) parts.push("Secure");
  if (opts.domain) parts.push(`Domain=${opts.domain}`);
  return parts.join("; ");
}

export function sessionCookie(token: string): string {
  return serialize(SESSION_COOKIE, token, {
    maxAge: authConfig.sessionTtlHours * 3600,
    path: "/",
    domain,
  });
}

export function clearSessionCookie(): string {
  return serialize(SESSION_COOKIE, "", { maxAge: 0, path: "/", domain });
}

export function oauthStateCookie(state: string): string {
  return serialize(OAUTH_STATE_COOKIE, state, {
    maxAge: OAUTH_STATE_MAX_AGE,
    path: OAUTH_STATE_PATH,
  });
}

export function clearOauthStateCookie(): string {
  return serialize(OAUTH_STATE_COOKIE, "", {
    maxAge: 0,
    path: OAUTH_STATE_PATH,
  });
}

/** Parse a `Cookie` header. Malformed pairs are ignored. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}
