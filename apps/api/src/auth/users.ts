/**
 * User lookup and Google account linking.
 *
 * Linking rules (docs/auth-tenancy.md §3.5/§3.6):
 *   - google_sub match wins.
 *   - otherwise a verified email with no google_sub is linked once.
 *   - an email that already has a different google_sub is a conflict.
 *   - otherwise a new passwordless user is created.
 */

import { db, users, eq, and, isNull, sql } from "@ag-ui/database";
import { normalizeEmail } from "./password";
import type { GoogleProfile } from "./google";

export type UserRow = typeof users.$inferSelect;

export class GoogleAccountConflict extends Error {
  constructor() {
    super("Google account conflicts with an existing account");
    this.name = "GoogleAccountConflict";
  }
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizeEmail(email)}`)
    .limit(1);
  return row ?? null;
}

export async function findUserByGoogleSub(sub: string): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.googleSub, sub))
    .limit(1);
  return row ?? null;
}

export async function resolveGoogleUser(profile: GoogleProfile): Promise<UserRow> {
  const bySub = await findUserByGoogleSub(profile.sub);
  if (bySub) return bySub;

  const byEmail = await findUserByEmail(profile.email);
  if (byEmail) {
    if (byEmail.googleSub && byEmail.googleSub !== profile.sub) {
      throw new GoogleAccountConflict();
    }
    if (byEmail.googleSub === profile.sub) return byEmail;

    // Link the Google identity once, only if no other login won the race.
    const [linked] = await db
      .update(users)
      .set({
        googleSub: profile.sub,
        name: byEmail.name ?? profile.name,
        avatarUrl: byEmail.avatarUrl ?? profile.picture,
        updatedAt: new Date(),
      })
      .where(and(eq(users.id, byEmail.id), isNull(users.googleSub)))
      .returning();

    if (linked) return linked;

    const raced = await findUserByGoogleSub(profile.sub);
    if (raced) return raced;
    throw new GoogleAccountConflict();
  }

  try {
    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        googleSub: profile.sub,
        name: profile.name,
        avatarUrl: profile.picture,
      })
      .returning();
    return created;
  } catch (err: any) {
    if (err?.code === "23505") {
      const raced =
        (await findUserByGoogleSub(profile.sub)) ??
        (await findUserByEmail(profile.email));
      if (raced && (!raced.googleSub || raced.googleSub === profile.sub)) {
        return raced;
      }
      throw new GoogleAccountConflict();
    }
    throw err;
  }
}
