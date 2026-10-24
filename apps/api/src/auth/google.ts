/**
 * Google OAuth 2.0 Authorization Code + PKCE.
 *
 * The one-time state lives in Redis (10 min TTL); the browser only receives a
 * short-lived httpOnly state cookie. The id_token is verified against Google's
 * JWKS. See docs/auth-tenancy.md §3.5.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getRedisClient } from "@ag-ui/database";
import { authConfig } from "./config";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs")
);
const STATE_TTL_SECONDS = 600;

export interface OAuthState {
  state: string;
  verifier: string;
  nonce: string;
  challenge: string;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export class GoogleAuthError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleAuthError";
    this.code = code;
  }
}

export function createOAuthState(): OAuthState {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const nonce = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, nonce, challenge };
}

export async function storeOAuthState(state: OAuthState): Promise<boolean> {
  const r = await getRedisClient();
  if (!r) return false;
  try {
    await r.set(
      `oauth:${state.state}`,
      JSON.stringify({
        verifier: state.verifier,
        nonce: state.nonce,
        createdAt: Date.now(),
      }),
      "EX",
      STATE_TTL_SECONDS
    );
    return true;
  } catch {
    return false;
  }
}

/** Read and delete the state entry, so a replay always fails. */
export async function consumeOAuthState(
  state: string
): Promise<{ verifier: string; nonce: string; createdAt: number } | null> {
  const r = await getRedisClient();
  if (!r) return null;

  try {
    const key = `oauth:${state}`;
    const raw = await r.get(key);
    if (!raw) return null;
    await r.del(key);

    const parsed = JSON.parse(raw) as {
      verifier?: unknown;
      nonce?: unknown;
      createdAt?: unknown;
    };
    if (
      typeof parsed.verifier !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }
    if (Date.now() - parsed.createdAt > STATE_TTL_SECONDS * 1000) return null;
    return {
      verifier: parsed.verifier,
      nonce: parsed.nonce,
      createdAt: parsed.createdAt,
    };
  } catch {
    return null;
  }
}

export function googleAuthUrl(
  state: string,
  challenge: string,
  nonce: string
): string {
  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", authConfig.googleClientId);
  url.searchParams.set("redirect_uri", authConfig.googleRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  return url.toString();
}

export async function exchangeCode(
  code: string,
  verifier: string
): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: authConfig.googleClientId,
      client_secret: authConfig.googleClientSecret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: authConfig.googleRedirectUri,
    }),
  });

  if (!res.ok) {
    throw new GoogleAuthError(
      "google_token_exchange_failed",
      `Google token exchange failed (${res.status})`
    );
  }

  const data = (await res.json()) as { id_token?: unknown };
  if (typeof data.id_token !== "string" || !data.id_token) {
    throw new GoogleAuthError("google_no_id_token", "Google returned no id_token");
  }
  return data.id_token;
}

export async function verifyGoogleIdToken(
  idToken: string,
  expectedNonce: string
): Promise<GoogleProfile> {
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: authConfig.googleClientId,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new GoogleAuthError(
      "google_invalid_token",
      "Google id_token verification failed"
    );
  }

  const nonce = typeof payload.nonce === "string" ? payload.nonce : "";
  if (!nonce || !safeEqual(nonce, expectedNonce)) {
    throw new GoogleAuthError("google_nonce_mismatch", "Google nonce mismatch");
  }

  const emailVerified =
    payload.email_verified === true || payload.email_verified === "true";
  const email =
    typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";

  if (!sub || !email) {
    throw new GoogleAuthError(
      "google_missing_claims",
      "Google profile is missing sub or email"
    );
  }
  if (!emailVerified) {
    throw new GoogleAuthError(
      "google_email_unverified",
      "Google email is not verified"
    );
  }

  return {
    sub,
    email,
    emailVerified,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}

/** Constant-time comparison for state/nonce values. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
