/**
 * Route policy manifest.
 *
 * Every live API route is declared here exactly once. The auth plugin enforces
 * these policies before a handler runs, and `route-policy.test.ts` fails if the
 * manifest and `app.routes` drift in either direction. A new route therefore
 * cannot ship without an explicit public / authenticated / company decision.
 *
 * This file is the machine-readable counterpart of docs/auth-tenancy.md §9.
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Where a company-scoped route keeps its company id.
 *
 * - `path`    -> `:id` (companies/uploads/chat) or `:companyId` (brand)
 * - `query`   -> `?companyId=`
 * - `body`    -> `{ companyId }`
 * - `derived` -> the handler resolves it through packages/database/src/tenancy.ts
 *                (conversation, crawl job, widget key, domain, or owner+domain)
 */
export type CompanyIdSource = "path" | "query" | "body" | "derived";

export type RoutePolicy =
  | { kind: "public" }
  | { kind: "authenticated" }
  | { kind: "company"; id: CompanyIdSource }
  /**
   * `POST /api/voice/token` is the one dual-policy route: `widgetKey` is a
   * public, origin-gated embed surface; `companyId` is a session-owned company.
   * Both or neither is 422.
   */
  | { kind: "voice-token" };

export interface RoutePolicyRule {
  method: HttpMethod;
  /** Elysia route pattern, e.g. `/api/companies/:id`. */
  path: string;
  policy: RoutePolicy;
  /** Human note for the unusual ones. */
  note?: string;
}

const PUB: RoutePolicy = { kind: "public" };
const AUTH: RoutePolicy = { kind: "authenticated" };
const company = (id: CompanyIdSource): RoutePolicy => ({ kind: "company", id });

/**
 * Ordered for review, not for matching. `findRouteRule` compiles the patterns
 * once at module load.
 */
export const ROUTE_POLICIES: readonly RoutePolicyRule[] = [
  // API identity / docs
  { method: "GET", path: "/", policy: PUB },
  { method: "GET", path: "/health", policy: PUB },
  { method: "GET", path: "/swagger", policy: PUB, note: "development only" },
  { method: "GET", path: "/swagger/json", policy: PUB, note: "development only" },

  // Auth. The five entry points must be reachable without a session; /me is
  // the only one that requires one.
  { method: "POST", path: "/api/auth/register", policy: PUB },
  { method: "POST", path: "/api/auth/login", policy: PUB },
  { method: "POST", path: "/api/auth/logout", policy: PUB, note: "revokes when a cookie is present" },
  { method: "GET", path: "/api/auth/me", policy: AUTH },
  { method: "GET", path: "/api/auth/google/start", policy: PUB },
  { method: "GET", path: "/api/auth/google/callback", policy: PUB },

  // Companies and their children.
  { method: "GET", path: "/api/companies/", policy: AUTH, note: "filtered by owner_id" },
  { method: "POST", path: "/api/companies/", policy: AUTH, note: "owner from session" },
  { method: "GET", path: "/api/companies/:id", policy: company("path") },
  { method: "GET", path: "/api/companies/:id/chunks", policy: company("path") },
  { method: "GET", path: "/api/companies/:id/conversations", policy: company("path") },
  { method: "GET", path: "/api/companies/:id/documents", policy: company("path") },
  { method: "GET", path: "/api/companies/:id/facts", policy: company("path") },
  { method: "GET", path: "/api/companies/:id/versions", policy: company("path") },
  { method: "POST", path: "/api/companies/:id/chat", policy: company("path") },
  { method: "GET", path: "/api/companies/:id/widget-theme", policy: company("path") },
  { method: "PUT", path: "/api/companies/:id/widget-theme", policy: company("path") },
  { method: "DELETE", path: "/api/companies/:id/widget-theme", policy: company("path") },

  // Uploads. Elysia registers these with a trailing slash.
  { method: "GET", path: "/api/companies/:id/uploads/", policy: company("path") },
  { method: "POST", path: "/api/companies/:id/uploads/", policy: company("path") },
  { method: "POST", path: "/api/companies/:id/uploads/:batchId/confirm", policy: company("path") },
  { method: "DELETE", path: "/api/companies/:id/uploads/:batchId", policy: company("path") },
  { method: "POST", path: "/api/companies/:id/uploads/documents/delete", policy: company("path") },
  { method: "POST", path: "/api/companies/:id/uploads/rollback", policy: company("path") },

  // Brand.
  { method: "GET", path: "/api/brand/:companyId/latest", policy: company("path") },
  { method: "GET", path: "/api/brand/:companyId/history", policy: company("path") },
  { method: "POST", path: "/api/brand/retry", policy: company("body") },

  // Chat history.
  { method: "GET", path: "/api/conversations/:id/messages", policy: company("derived") },

  // Crawler.
  { method: "POST", path: "/api/crawler/discover", policy: AUTH, note: "no tenant rows" },
  { method: "POST", path: "/api/crawler/discover-sitemap", policy: AUTH, note: "no tenant rows" },
  { method: "POST", path: "/api/crawler/ingest", policy: AUTH, note: "owner from session" },
  { method: "GET", path: "/api/crawler/jobs/:id", policy: company("derived") },
  { method: "POST", path: "/api/crawler/jobs/:id/cancel", policy: company("derived") },
  { method: "GET", path: "/api/crawler/status/:domain", policy: company("derived"), note: "(owner_id, domain)" },

  // Analytics. cache-stats is the only non-company read: counters only.
  { method: "GET", path: "/api/analytics/cache-stats", policy: AUTH },
  { method: "GET", path: "/api/analytics/acquisition", policy: company("query") },
  { method: "GET", path: "/api/analytics/audience", policy: company("query") },
  { method: "GET", path: "/api/analytics/content", policy: company("query") },
  { method: "GET", path: "/api/analytics/conversions", policy: company("query") },
  { method: "GET", path: "/api/analytics/overview", policy: company("query") },
  { method: "GET", path: "/api/analytics/realtime", policy: company("query") },
  { method: "GET", path: "/api/analytics/website", policy: company("query") },
  { method: "GET", path: "/api/analytics/agent/overview", policy: company("query") },
  { method: "GET", path: "/api/analytics/agent/quality", policy: company("query") },
  { method: "GET", path: "/api/analytics/agent/questions", policy: company("query") },
  { method: "GET", path: "/api/analytics/agent/voice", policy: company("query") },

  // Operations.
  { method: "GET", path: "/api/operations/errors", policy: company("query") },
  { method: "GET", path: "/api/operations/activity", policy: company("query") },

  // Visitors — Conversations (spec §9.1).
  { method: "GET", path: "/api/visitors/conversations", policy: company("query") },
  { method: "GET", path: "/api/visitors/conversations/:id", policy: company("derived"), note: "resolves ownership in-handler via resolveOwnedConversation" },
  { method: "GET", path: "/api/visitors/leads", policy: company("query") },
  { method: "PATCH", path: "/api/visitors/leads/:id", policy: company("derived"), note: "resolves ownership in-handler via resolveOwnedLead" },
  { method: "GET", path: "/api/visitors/leads/:id", policy: company("derived"), note: "resolves ownership in-handler via resolveOwnedLead" },

  // Embed admin.
  { method: "GET", path: "/api/embed/keys", policy: company("query") },
  { method: "POST", path: "/api/embed/keys", policy: company("body") },
  { method: "POST", path: "/api/embed/keys/:keyId/revoke", policy: company("derived") },
  { method: "GET", path: "/api/embed/keys/:keyId/domains", policy: company("derived") },
  { method: "POST", path: "/api/embed/keys/:keyId/domains", policy: company("derived") },
  { method: "DELETE", path: "/api/embed/domains/:id", policy: company("derived") },

  // Embed public surface (key + origin gate).
  { method: "GET", path: "/api/embed/:key/config", policy: PUB, note: "key + origin gate" },
  { method: "POST", path: "/api/embed/:key/track", policy: PUB, note: "key + origin gate" },
  { method: "POST", path: "/api/embed/:key/rate", policy: PUB, note: "key + origin gate + key-scope ownership" },
  { method: "POST", path: "/api/embed/:key/chat", policy: PUB, note: "key + origin gate" },

  // Voice.
  { method: "POST", path: "/api/voice/token", policy: { kind: "voice-token" }, note: "widgetKey public / companyId session" },
  { method: "POST", path: "/api/voice/transcript", policy: { kind: "voice-token" }, note: "widgetKey public + origin gate / companyId session" },
  { method: "POST", path: "/api/voice/tool/query", policy: PUB, note: "bearer secret" },
];

/** Normalise a path for matching: leading slash, no query, no trailing slash. */
export function normalizeRoutePath(path: string): string {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0];
  const withLeading = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  if (withLeading.length <= 1) return "/";
  return withLeading.replace(/\/+$/, "");
}

export function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${normalizeRoutePath(path)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(path: string): RegExp {
  const normalized = normalizeRoutePath(path);
  if (normalized === "/") return /^\/$/;

  const body = normalized
    .slice(1)
    .split("/")
    .map((segment) =>
      segment.startsWith(":") ? "[^/]+" : escapeRegExp(segment)
    )
    .join("/");

  return new RegExp(`^/${body}$`);
}

interface CompiledRule {
  method: HttpMethod;
  regex: RegExp;
  rule: RoutePolicyRule;
}

const COMPILED: readonly CompiledRule[] = ROUTE_POLICIES.map((rule) => ({
  method: rule.method,
  regex: compilePattern(rule.path),
  rule,
}));

/**
 * Match a live request path against the manifest. `HEAD` follows `GET` so the
 * same policy applies; `OPTIONS` is the CORS preflight and is never a data
 * route.
 */
export function findRouteRule(
  method: string,
  pathname: string
): RoutePolicyRule | null {
  const upper = method.toUpperCase();
  if (upper === "OPTIONS") return null;

  const lookup = upper === "HEAD" ? "GET" : upper;
  const normalized = normalizeRoutePath(pathname);

  for (const compiled of COMPILED) {
    if (compiled.method !== lookup) continue;
    if (compiled.regex.test(normalized)) return compiled.rule;
  }

  return null;
}

export function routePolicyFor(
  method: string,
  pathname: string
): RoutePolicy | null {
  return findRouteRule(method, pathname)?.policy ?? null;
}
