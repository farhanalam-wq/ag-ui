/**
 * Password handling. Argon2id via Bun's built-in implementation, with the
 * parameters fixed in docs/auth-tenancy.md §3.2.
 */

import { createHash } from "node:crypto";

const ARGON2_OPTIONS = {
  algorithm: "argon2id" as const,
  memoryCost: 19456,
  timeCost: 2,
};

/**
 * A real Argon2id hash of a random throwaway string. Unknown-email logins run
 * a verify against this so the response time does not reveal whether an
 * account exists (docs/auth-tenancy.md §3.2).
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$VQ3ZS4CLNmG4S+WH6npDGkGZFYIcC9L0b3EX3fY2lY4$hp2Hwkwr/uzOoTUreOXGgWvy9gMnE8rgKVQ0RZlR+jc";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Stable, non-reversible identifier for logs and rate-limit keys. */
export function emailFingerprint(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex").slice(0, 32);
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await Bun.password.verify(password, hash);
  } catch {
    return false;
  }
}

/**
 * Burn the same Argon2 work as a real verify. Always returns false.
 */
export async function verifyDummyPassword(password: string): Promise<false> {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
