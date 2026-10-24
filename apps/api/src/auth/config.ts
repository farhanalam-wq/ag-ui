/**
 * Auth configuration. Every value has a safe local default; Google login is
 * only enabled when both the client id and secret are present.
 *
 * See docs/auth-tenancy.md §4.4 (cookies) and §10.7 (configuration).
 */

function envInt(name: string, fallback: number, min = 1, max = 8760): number {
  const parsed = parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

const apiUrl = trimTrailingSlash(
  process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:3001"
);

export const authConfig = {
  appUrl: trimTrailingSlash(process.env.APP_URL || "http://localhost:3000"),
  apiUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleRedirectUri:
    process.env.GOOGLE_REDIRECT_URI || `${apiUrl}/api/auth/google/callback`,
  /** Only set when web and API are sibling subdomains (prod only). */
  cookieDomain: process.env.COOKIE_DOMAIN || "",
  sessionTtlHours: envInt("SESSION_TTL_HOURS", 168),
  isProduction:
    process.env.NODE_ENV === "production" ||
    process.env.RUNTIME_ENV === "production",
} as const;

export function googleConfigured(): boolean {
  return Boolean(authConfig.googleClientId && authConfig.googleClientSecret);
}
