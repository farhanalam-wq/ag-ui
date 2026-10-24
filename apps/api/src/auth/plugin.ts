/**
 * Auth plugin.
 *
 * A single global `resolve` hook enforces the route-policy manifest before any
 * handler runs:
 *
 *   public        -> no session lookup
 *   authenticated -> 401 without a valid session
 *   company       -> 401 without a session, 422 for a malformed/missing id,
 *                    404 when the company exists but belongs to someone else
 *   voice-token   -> public with `widgetKey`, company-scoped with `companyId`
 *
 * Handlers receive `authUser` / `authCompany` / `authCompanyId` in context and
 * never read cookies or query `companies` for ownership themselves.
 *
 * See docs/auth-tenancy.md §5.4, §5.5, and §10.1.
 */

import { Elysia, status } from "elysia";
import {
  isUuid,
  resolveOwnedCompany,
  type CompanyRow,
} from "@ag-ui/database";
import { logger } from "@ag-ui/shared";
import { clearSessionCookie } from "./cookies";
import {
  findSession,
  sessionTokenFromRequest,
  type AuthUser,
} from "./session";
import {
  findRouteRule,
  type CompanyIdSource,
} from "../route-policy";

type SessionRow = NonNullable<
  Awaited<ReturnType<typeof findSession>>
>["session"];

export interface ResolvedSession {
  userId: string;
  user: AuthUser;
  session: SessionRow;
}

export interface AuthContext {
  /** Allows Elysia's resolve hook to merge the object into route context. */
  [key: string]: unknown;
  authUser: AuthUser | null;
  authCompany: CompanyRow | null;
  authCompanyId: string | null;
  params?: Record<string, string | undefined>;
  query?: Record<string, unknown>;
  body?: unknown;
}

export class AuthHttpError extends Error {
  readonly statusCode: 401 | 404 | 422;

  constructor(statusCode: 401 | 404 | 422, message: string) {
    super(message);
    this.name = "AuthHttpError";
    this.statusCode = statusCode;
  }
}

/** Resolve the opaque session cookie, or null when absent/expired/revoked. */
export async function resolveSession(
  request: Request
): Promise<ResolvedSession | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;

  const found = await findSession(token);
  if (!found) return null;

  return {
    userId: found.user.id,
    user: found.user,
    session: found.session,
  };
}

/** Return the session user or throw a 401. */
export function requireUser(ctx: unknown): AuthUser {
  const c = ctx as AuthContext;
  if (!c.authUser) {
    throw new AuthHttpError(401, "Authentication required");
  }
  return c.authUser;
}

/**
 * Return the owned company or throw a 404.
 *
 * `policy` is normally the same source declared in the manifest. Derived
 * routes (conversation/job/key/domain) resolve the company first and pass its
 * id string here, so the ownership check stays in this one place.
 */
export async function requireCompany(
  ctx: unknown,
  policy: CompanyIdSource | string = "derived"
): Promise<CompanyRow> {
  const c = ctx as AuthContext;
  const user = requireUser(c);

  if (c.authCompany) return c.authCompany;

  let companyId: string | null = null;

  switch (policy) {
    case "path":
      companyId =
        readString(c.params?.id) ?? readString(c.params?.companyId);
      break;
    case "query":
      companyId = readString(c.query?.companyId);
      break;
    case "body":
      companyId = readString(
        (c.body as Record<string, unknown> | null | undefined)?.companyId
      );
      break;
    case "derived":
      break;
    default:
      companyId = policy;
      break;
  }

  if (!companyId) throw new AuthHttpError(404, "Company not found");
  if (!isUuid(companyId)) {
    throw new AuthHttpError(422, "companyId must be a UUID");
  }

  const company = await resolveOwnedCompany(user.id, companyId);
  if (!company) throw new AuthHttpError(404, "Company not found");
  return company;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function companyIdFrom(
  ctx: AuthContext,
  source: CompanyIdSource
): string | null {
  switch (source) {
    case "path":
      return (
        readString(ctx.params?.id) ?? readString(ctx.params?.companyId) ?? null
      );
    case "query":
      return readString(ctx.query?.companyId);
    case "body":
      return readString(
        (ctx.body as Record<string, unknown> | null | undefined)?.companyId
      );
    default:
      return null;
  }
}

function baseContext(
  params: unknown,
  query: unknown,
  body: unknown
): AuthContext {
  return {
    authUser: null,
    authCompany: null,
    authCompanyId: null,
    params: params as Record<string, string | undefined>,
    query: query as Record<string, unknown>,
    body,
  };
}

export const authPlugin = new Elysia({ name: "auth" })
  .resolve(async ({ request, set, params, query, body }) => {
    const pathname = new URL(request.url).pathname;
    const rule = findRouteRule(request.method, pathname);

    // CORS preflight is handled by @elysiajs/cors. If it reaches us, it is not
    // a data route and must not require a session.
    if (!rule) {
      if (request.method.toUpperCase() === "OPTIONS") {
        return baseContext(params, query, body);
      }
      logger.error(
        `[auth] no route policy for ${request.method} ${pathname}`
      );
      return status(500, { error: "Route policy missing" });
    }

    const base = baseContext(params, query, body);
    const policy = rule.policy;

    if (policy.kind === "public") return base;

    if (policy.kind === "voice-token") {
      const companyId = readString(
        (body as Record<string, unknown> | null | undefined)?.companyId
      );
      const widgetKey = readString(
        (body as Record<string, unknown> | null | undefined)?.widgetKey
      );

      if ((companyId && widgetKey) || (!companyId && !widgetKey)) {
        return status(422, {
          error: "Provide exactly one of companyId or widgetKey",
        });
      }

      // Embed path: the widget key is the credential; origin gate is applied
      // by the handler. No session is involved.
      if (widgetKey) return base;
    }

    const token = sessionTokenFromRequest(request);
    if (!token) {
      return status(401, { error: "Authentication required" });
    }

    const resolved = await resolveSession(request);
    if (!resolved) {
      // The browser sent a cookie that no longer works: clear it so the next
      // request does not repeat the failed lookup.
      set.headers["set-cookie"] = clearSessionCookie();
      return status(401, { error: "Authentication required" });
    }

    const authenticated: AuthContext = {
      ...base,
      authUser: resolved.user,
    };

    if (policy.kind === "authenticated") return authenticated;

    if (policy.kind === "voice-token") {
      const companyId = readString(
        (body as Record<string, unknown> | null | undefined)?.companyId
      )!;
      if (!isUuid(companyId)) {
        return status(422, { error: "companyId must be a UUID" });
      }
      const company = await resolveOwnedCompany(resolved.user.id, companyId);
      if (!company) return status(404, { error: "Company not found" });
      return {
        ...authenticated,
        authCompany: company,
        authCompanyId: company.id,
      };
    }

    // policy.kind === "company"
    if (policy.id === "derived") return authenticated;

    const companyId = companyIdFrom(authenticated, policy.id);
    if (!companyId) {
      return status(422, { error: "companyId is required" });
    }
    if (!isUuid(companyId)) {
      return status(422, { error: "companyId must be a UUID" });
    }

    const company = await resolveOwnedCompany(resolved.user.id, companyId);
    if (!company) return status(404, { error: "Company not found" });

    return {
      ...authenticated,
      authCompany: company,
      authCompanyId: company.id,
    };
  })
  /**
   * Explicit route-level macros. The global hook above is the enforcement
   * backstop; these exist for routes that want the dependency stated in the
   * route definition and for handler-side `requireCompany` calls.
   */
  .macro({
    auth: {
      resolve: (ctx: any) => {
        if (!ctx.authUser) {
          return status(401, { error: "Authentication required" });
        }
        return {};
      },
    },
    company: (source: CompanyIdSource) => ({
      resolve: async (ctx: any) => {
        if (!ctx.authUser) {
          return status(401, { error: "Authentication required" });
        }
        if (source === "derived" || ctx.authCompany) return {};
        try {
          await requireCompany(ctx, source);
          return {};
        } catch (err) {
          if (err instanceof AuthHttpError) {
            return status(err.statusCode, { error: err.message });
          }
          throw err;
        }
      },
    }),
  })
  .onError(({ error, set }: any) => {
    if (error instanceof AuthHttpError) {
      set.status = error.statusCode;
      return { error: error.message };
    }
  })
  // Without this, Elysia scopes the plugin's resolve/onError to the plugin
  // itself and the parent routes are unguarded.
  .as("global");
