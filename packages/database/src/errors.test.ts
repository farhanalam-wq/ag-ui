import { afterAll, describe, expect, test } from "bun:test";
import { client } from "./index";
import { escapeLike, sanitizeContext } from "./errors";

afterAll(async () => {
  // errors.ts imports the shared db client; no query is opened by these tests.
  await client.end();
});

describe("escapeLike", () => {
  test("escapes LIKE wildcards and backslashes", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("sanitizeContext", () => {
  test("returns null when there is no context", () => {
    expect(sanitizeContext(undefined)).toBeNull();
  });

  test("redacts sensitive keys recursively and keeps safe values", () => {
    const out = sanitizeContext({
      apiKey: "sk-live",
      nested: {
        authorization: "Bearer topsecret",
        password: "hunter2",
        cookie: "sid=abc",
        token: "tok-123",
        safe: "ok",
      },
      safe: 7,
    });

    expect(out).toMatchObject({
      apiKey: "[REDACTED]",
      safe: 7,
      nested: {
        authorization: "[REDACTED]",
        password: "[REDACTED]",
        cookie: "[REDACTED]",
        token: "[REDACTED]",
        safe: "ok",
      },
    });
    expect(JSON.stringify(out)).not.toContain("sk-live");
    expect(JSON.stringify(out)).not.toContain("hunter2");
  });

  test("clips strings at 1000 characters", () => {
    const out = sanitizeContext({ note: "x".repeat(1200) });
    expect((out?.note as string).length).toBe(1000);
    expect((out?.note as string).endsWith("…[truncated]")).toBe(true);
  });

  test("clips arrays at 50 items", () => {
    const out = sanitizeContext({ items: Array.from({ length: 60 }, (_, i) => i) });
    expect((out?.items as number[]).length).toBe(50);
  });

  test("stops nesting after six levels", () => {
    const out = sanitizeContext({
      deep: { a: { b: { c: { d: { e: { f: { g: "deep" } } } } } } },
    });
    expect((out?.deep as any).a.b.c.d.e.f).toBe("[depth limit]");
  });

  test("compacts oversized contexts and preserves redaction", () => {
    const out = sanitizeContext({
      apiKey: "sk-live",
      big: Object.fromEntries(
        Array.from({ length: 12 }, (_, i) => [`k${i}`, "y".repeat(2000)])
      ),
    });

    expect(out?._truncated).toBe(true);
    expect(out?.apiKey).toBe("[REDACTED]");
    expect(Buffer.byteLength(JSON.stringify(out), "utf8")).toBeLessThanOrEqual(8192);
    expect(JSON.stringify(out)).not.toContain("sk-live");
  });
});
