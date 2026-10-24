/**
 * Auth routes: register, login, logout, me, Google start/callback.
 *
 * Session/tenancy enforcement for every other route lives in ../auth/plugin.ts.
 * These handlers use the opaque-session helpers from ../auth and never touch
 * company ownership. See docs/auth-tenancy.md §3, §4, §9.2.
 */

import { Elysia, t } from "elysia";
import { db, users, sql } from "@ag-ui/database";
import { logger } from "@ag-ui/shared";
import { requireUser, type AuthContext } from "../auth/plugin";
import { authConfig, googleConfigured } from "../auth/config";
import {
  emailFingerprint,
  hashPassword,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyDummyPassword,
  verifyPassword,
} from "../auth/password";
import {
  clearOauthStateCookie,
  clearSessionCookie,
  OAUTH_STATE_COOKIE,
  oauthStateCookie,
  parseCookies,
  sessionCookie,
} from "../auth/cookies";
import {
  createSession,
  revokeSession,
  sessionTokenFromRequest,
  toAuthUser,
} from "../auth/session";
import {
  checkAuthRateLimit,
  type AuthRateLimitResult,
} from "../auth/rate-limit";
import {
  consumeOAuthState,
  createOAuthState,
  exchangeCode,
  googleAuthUrl,
  safeEqual,
  storeOAuthState,
  verifyGoogleIdToken,
} from "../auth/google";
import { getClientIp, redirectResponse } from "../auth/http";
import { GoogleAccountConflict, resolveGoogleUser } from "../auth/users";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC_LOGIN_ERROR = "Invalid email or password.";

function rateLimited(set: any, result: AuthRateLimitResult) {
  set.status = 429;
  set.headers["retry-after"] = String(result.retryAfterSec);
  return {
    error: "Too many attempts. Try again later.",
    retryAfterSec: result.retryAfterSec,
  };
}

function invalidEmail(set: any) {
  set.status = 422;
  return { error: "Enter a valid email address." };
}

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  // 1. Self-serve registration. Creates the user and a session in one step.
  .post(
    "/register",
    async ({ body, set, request }) => {
      const ip = getClientIp(request);
      const limit = await checkAuthRateLimit("register:ip", ip, 5, 3600);
      if (!limit.allowed) return rateLimited(set, limit);

      const email = normalizeEmail(body.email);
      if (email.length > 320 || !EMAIL_RE.test(email)) return invalidEmail(set);

      const passwordHash = await hashPassword(body.password);
      const name = body.name?.trim() || email.split("@")[0];

      try {
        const [created] = await db
          .insert(users)
          .values({ email, passwordHash, name })
          .returning();

        const { token } = await createSession(
          created.id,
          ip,
          request.headers.get("user-agent")
        );

        set.status = 201;
        set.headers["set-cookie"] = sessionCookie(token);
        logger.info("[auth] register", { userId: created.id });

        return { user: toAuthUser(created) };
      } catch (err: any) {
        // Unique violation: keep the response generic (no enumeration).
        if (err?.code === "23505") {
          logger.warn("[auth] register rejected", {
            emailHash: emailFingerprint(email),
            ip,
            reason: "email_taken",
          });
          set.status = 409;
          return { error: "Registration could not be completed." };
        }
        throw err;
      }
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 320 }),
        password: t.String({
          minLength: PASSWORD_MIN_LENGTH,
          maxLength: PASSWORD_MAX_LENGTH,
        }),
        name: t.Optional(t.String({ maxLength: 120 })),
      }),
      detail: {
        summary: "Register",
        description:
          "Creates an email/password account and sets the session cookie. Self-serve.",
      },
    }
  )
  // 2. Email + password login.
  .post(
    "/login",
    async ({ body, set, request }) => {
      const ip = getClientIp(request);
      const email = normalizeEmail(body.email);

      const ipLimit = await checkAuthRateLimit("login:ip", ip, 10, 900);
      if (!ipLimit.allowed) return rateLimited(set, ipLimit);

      const emailLimit = await checkAuthRateLimit("login:email", email, 5, 900);
      if (!emailLimit.allowed) return rateLimited(set, emailLimit);

      const [user] = await db
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      // Unknown email and Google-only accounts still pay the Argon2 cost.
      const passwordOk = user?.passwordHash
        ? await verifyPassword(body.password, user.passwordHash)
        : await verifyDummyPassword(body.password);

      if (!user || !passwordOk) {
        logger.warn("[auth] login failed", {
          emailHash: emailFingerprint(email),
          ip,
          reason: user ? "password" : "unknown_email",
        });
        set.status = 401;
        return { error: GENERIC_LOGIN_ERROR };
      }

      const { token } = await createSession(
        user.id,
        ip,
        request.headers.get("user-agent")
      );

      set.headers["set-cookie"] = sessionCookie(token);
      logger.info("[auth] login", { userId: user.id });
      return { user: toAuthUser(user) };
    },
    {
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 320 }),
        // Do not enforce the minimum here: a short wrong password is a 401,
        // not a validation error that leaks policy.
        password: t.String({ maxLength: PASSWORD_MAX_LENGTH }),
      }),
      detail: {
        summary: "Log in",
        description:
          "Email/password login. Unknown emails and wrong passwords share one 401 response.",
      },
    }
  )
  // 3. Revoke the current session and clear the cookie.
  .post(
    "/logout",
    async ({ set, request }) => {
      const token = sessionTokenFromRequest(request);
      if (token) await revokeSession(token);
      set.headers["set-cookie"] = clearSessionCookie();
      return { ok: true };
    },
    {
      detail: {
        summary: "Log out",
        description: "Revokes the current session immediately and clears the cookie.",
      },
    }
  )
  // 4. Current user. The global auth plugin has already rejected missing,
  // expired, and revoked sessions; requireUser is the typed assertion.
  .get(
    "/me",
    (ctx) => {
      const user = requireUser(ctx as unknown as AuthContext);
      return { user };
    },
    {
      detail: {
        summary: "Current user",
        description: "Returns the signed-in user, or 401 when the session is absent, expired, or revoked.",
      },
    }
  )
  // 5. Google OAuth start. Requires Redis for the one-time state.
  .get(
    "/google/start",
    async ({ set, request }) => {
      if (!googleConfigured()) {
        set.status = 503;
        return { error: "Google sign-in is not configured." };
      }

      const ip = getClientIp(request);
      const limit = await checkAuthRateLimit("google:start:ip", ip, 20, 900);
      if (!limit.allowed) return rateLimited(set, limit);

      const state = createOAuthState();
      const stored = await storeOAuthState(state);
      if (!stored) {
        set.status = 503;
        return { error: "Google sign-in is temporarily unavailable." };
      }

      return redirectResponse(
        googleAuthUrl(state.state, state.challenge, state.nonce),
        [oauthStateCookie(state.state)]
      );
    },
    {
      detail: {
        summary: "Start Google login",
        description: "Redirects to Google with state + PKCE. Fails closed if Redis is unavailable.",
      },
    }
  )
  // 6. Google OAuth callback.
  .get(
    "/google/callback",
    async ({ query, request }) => {
      const ip = getClientIp(request);
      const fail = (code: string) =>
        redirectResponse(
          `${authConfig.appUrl}/login?error=${encodeURIComponent(code)}`,
          [clearOauthStateCookie()]
        );

      const limit = await checkAuthRateLimit("google:callback:ip", ip, 20, 900);
      if (!limit.allowed) return fail("rate_limited");
      if (query.error) return fail("google_cancelled");
      if (!query.code || !query.state) return fail("google_state");

      const cookies = parseCookies(request.headers.get("cookie"));
      const cookieState = cookies[OAUTH_STATE_COOKIE] ?? "";
      if (!safeEqual(cookieState, query.state)) return fail("google_state");

      const stored = await consumeOAuthState(query.state);
      if (!stored) return fail("google_state");

      try {
        const idToken = await exchangeCode(query.code, stored.verifier);
        const profile = await verifyGoogleIdToken(idToken, stored.nonce);
        const user = await resolveGoogleUser(profile);

        const { token } = await createSession(
          user.id,
          ip,
          request.headers.get("user-agent")
        );

        // Zero-company users land on the dashboard too: its empty state is
        // the entry point until a dedicated onboarding route exists.
        const destination = `${authConfig.appUrl}/overview`;

        logger.info("[auth] google login", { userId: user.id });

        return redirectResponse(destination, [
          sessionCookie(token),
          clearOauthStateCookie(),
        ]);
      } catch (err: any) {
        const reason = err?.code ?? err?.name ?? "unknown";
        logger.warn("[auth] google login failed", { ip, reason });

        if (err instanceof GoogleAccountConflict) return fail("google_conflict");
        if (err?.code === "google_email_unverified") {
          return fail("google_email_unverified");
        }
        return fail("google_failed");
      }
    },
    {
      query: t.Object({
        code: t.Optional(t.String()),
        state: t.Optional(t.String()),
        error: t.Optional(t.String()),
      }),
      detail: {
        summary: "Google login callback",
        description:
          "Exchanges the code, verifies the id_token, links or creates the user, sets the session, and redirects.",
      },
    }
  );
