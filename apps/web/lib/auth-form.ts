/**
 * Shared auth form helpers for the login/register pages (A8).
 *
 * Mirrors the API contract in apps/api/src/routes/auth.ts: same email shape,
 * password bounds read from docs/auth-tenancy.md §3.2 (12–128). The point of
 * validating here is feedback speed — the API stays the authority.
 */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function validateEmail(email: string): string | null {
  const value = email.trim();
  if (value.length === 0) return "Email is required.";
  if (value.length > 320 || !EMAIL_RE.test(value)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

/** Login only needs "did they type something" — a short wrong password stays a
 * generic 401 from the API (no policy leak on the login surface). */
export function validateLoginPassword(password: string): string | null {
  if (password.length === 0) return "Password is required.";
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  return null;
}

export function validateName(name: string): string | null {
  if (name.length > 120) return "Name must be at most 120 characters.";
  return null;
}
