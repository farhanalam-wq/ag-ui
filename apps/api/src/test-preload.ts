/**
 * Bun test preload.
 *
 * `packages/database/src/index.ts` reads `DATABASE_URL` at import time, so the
 * test database must be selected before any test file imports the app. This
 * file runs first via the package test script.
 *
 * DB-backed tests skip when `TEST_DATABASE_URL` is absent. When it is present,
 * it must name a test database; pointing it at the live database is a hard
 * error (docs/auth-tenancy.md §14.6).
 */

const testUrl = process.env.TEST_DATABASE_URL;

if (testUrl) {
  let databaseName = "";
  try {
    databaseName = decodeURIComponent(new URL(testUrl).pathname.replace(/^\/+/, ""));
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid URL");
  }

  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `TEST_DATABASE_URL must point at a test database (got "${databaseName}")`
    );
  }

  process.env.DATABASE_URL = testUrl;
}
