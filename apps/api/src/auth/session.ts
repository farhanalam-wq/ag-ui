/**
 * Opaque session lifecycle. The raw token exists only in the httpOnly cookie;
 * the database stores sha256(token). See docs/auth-tenancy.md §4.
 */

import { createHash, randomBytes } from "node:crypto";
import { db, authSessions, users, eq, and, isNull, gt } from "@ag-ui/database";
import { authConfig } from "./config";
import { parseCookies, SESSION_COOKIE } from "./cookies";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function toAuthUser(row: {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
}): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
  };
}

export async function createSession(
  userId: string,
  ip: string,
  userAgent: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + authConfig.sessionTtlHours * 3600_000);

  await db.insert(authSessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
    ip,
    userAgent: userAgent ? userAgent.slice(0, 300) : null,
  });

  return { token, expiresAt };
}

export async function findSession(
  rawToken: string
): Promise<{ session: typeof authSessions.$inferSelect; user: AuthUser } | null> {
  if (!rawToken) return null;

  const [row] = await db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(
      and(
        eq(authSessions.tokenHash, hashSessionToken(rawToken)),
        isNull(authSessions.revokedAt),
        gt(authSessions.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!row) return null;

  // At most one write per hour per session (docs/auth-tenancy.md §4.2).
  const lastSeen = row.session.lastSeenAt;
  if (!lastSeen || Date.now() - lastSeen.getTime() > 3600_000) {
    void db
      .update(authSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(authSessions.id, row.session.id))
      .then(
        () => undefined,
        () => undefined
      );
  }

  return { session: row.session, user: toAuthUser(row.user) };
}

export async function revokeSession(rawToken: string): Promise<void> {
  if (!rawToken) return;
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(authSessions.tokenHash, hashSessionToken(rawToken)),
        isNull(authSessions.revokedAt)
      )
    );
}

export function sessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookies(request.headers.get("cookie"));
  return cookies[SESSION_COOKIE] ?? null;
}
