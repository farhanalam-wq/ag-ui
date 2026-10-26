/**
 * Production env validation (docs/auth-tenancy.md §10.7). Development and
 * test intentionally keep local defaults, so only production is enforced.
 */
import { describe, expect, test } from "bun:test";
import { validateApiEnv } from "./env";

const complete: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  APP_URL: "https://app.example.com",
  DATABASE_URL: "postgresql://user:pass@db:5432/ag_ui",
  REDIS_HOST: "redis",
  REDIS_PORT: "6379",
  QDRANT_URL: "https://qdrant.example.com",
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URI: "https://api.example.com/api/auth/google/callback",
  SESSION_TTL_HOURS: "168",
  VOICE_TOOL_SECRET: "voice-secret",
};

describe("validateApiEnv", () => {
  test("development and test keep local defaults", () => {
    expect(validateApiEnv({ NODE_ENV: "development" })).toBeNull();
    expect(validateApiEnv({ NODE_ENV: "test" })).toBeNull();
    expect(validateApiEnv({ RUNTIME_ENV: "development" })).toBeNull();
  });

  test("a complete production environment parses", () => {
    const parsed = validateApiEnv(complete);
    expect(parsed?.APP_URL).toBe("https://app.example.com");
    expect(parsed?.SESSION_TTL_HOURS).toBe(168);
  });

  test("RUNTIME_ENV=production is enforced too", () => {
    expect(() =>
      validateApiEnv({
        ...complete,
        NODE_ENV: "development",
        RUNTIME_ENV: "production",
      })
    ).not.toThrow();
  });

  test("missing APP_URL fails fast", () => {
    const { APP_URL: _appUrl, ...env } = complete;
    expect(() => validateApiEnv(env)).toThrow("Invalid environment variables");
  });

  test("missing Google credentials fail fast", () => {
    const { GOOGLE_CLIENT_SECRET: _secret, ...env } = complete;
    expect(() => validateApiEnv(env)).toThrow("Invalid environment variables");
  });

  test("Redis needs a URL or host + port", () => {
    const {
      REDIS_HOST: _host,
      REDIS_PORT: _port,
      ...withoutRedis
    } = complete;

    expect(() => validateApiEnv(withoutRedis)).toThrow(
      "Invalid environment variables"
    );
    expect(
      validateApiEnv({
        ...withoutRedis,
        REDIS_URL: "redis://redis:6379",
      })?.REDIS_URL
    ).toBe("redis://redis:6379");
  });

  test("a non-URL APP_URL fails fast", () => {
    expect(() =>
      validateApiEnv({ ...complete, APP_URL: "app.example.com" })
    ).toThrow("Invalid environment variables");
  });
});
