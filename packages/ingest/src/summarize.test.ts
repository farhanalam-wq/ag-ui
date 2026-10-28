import { describe, expect, test } from "bun:test";
import { classifyDeadLetter, summarizeFailures } from "../src/summarize";
import type { DeadLetterEntry } from "../src/types";

const entry = (over: Partial<DeadLetterEntry>): DeadLetterEntry => ({
  url: "https://example.com/page",
  stage: "fetch",
  status: null,
  error: "unknown",
  attempts: 1,
  ...over,
});

describe("classifyDeadLetter", () => {
  test("buckets from the dead letter's own fields", () => {
    expect(classifyDeadLetter(entry({ stage: "parse", error: "Parse failed: x" }))).toBe("Parse failure");
    expect(classifyDeadLetter(entry({ error: "cross-host skip (non-retryable)" }))).toBe("Cross-host skip");
    expect(classifyDeadLetter(entry({ error: "disallowed by robots.txt (non-retryable)" }))).toBe(
      "Robots.txt disallowed"
    );
    expect(classifyDeadLetter(entry({ error: "Playwright render failed: boom" }))).toBe(
      "Playwright render failed"
    );
    expect(classifyDeadLetter(entry({ error: "neterr (attempts=2, playwright fallback failed)" }))).toBe(
      "Playwright render failed"
    );
    expect(classifyDeadLetter(entry({ error: "JS shell (retry with --playwright)" }))).toBe(
      "JS shell (no HTML body)"
    );
    expect(classifyDeadLetter(entry({ status: 403, error: "HTTP 403 empty-or-bad (non-retryable)" }))).toBe(
      "HTTP 403"
    );
    expect(classifyDeadLetter(entry({ status: 403, error: "TimeoutError after 3 attempts" }))).toBe(
      "HTTP 403"
    ); // status wins over error text
    expect(classifyDeadLetter(entry({ status: null, error: "TimeoutError (3 attempts)" }))).toBe(
      "Network / timeout"
    );
    expect(classifyDeadLetter(entry({ status: null, error: "ECONNREFUSED x" }))).toBe("Network / timeout");
    expect(classifyDeadLetter(entry({ error: "HTTP fetch-fail empty-or-bad (non-retryable)" }))).toBe(
      "Empty or bad response"
    );
    expect(classifyDeadLetter(entry({ error: "something entirely novel" }))).toBe("Other");
  });
});

describe("summarizeFailures", () => {
  test("null/empty input → zero totals, no groups", () => {
    expect(summarizeFailures(null)).toEqual({ total: 0, groups: [], items: [] });
    expect(summarizeFailures([])).toEqual({ total: 0, groups: [], items: [] });
  });

  test("groups counts sorted desc; ties alphabetical", () => {
    const letters = [
      entry({ url: "https://a.com/1", status: 403, error: "x" }),
      entry({ url: "https://a.com/2", status: 403, error: "x" }),
      entry({ url: "https://a.com/3", error: "TimeoutError" }),
      entry({ url: "https://a.com/4", error: "TimeoutError" }),
      entry({ url: "https://a.com/5", error: "TimeoutError" }),
      entry({ url: "https://a.com/6", stage: "parse", error: "Parse failed: y" }),
    ];
    const s = summarizeFailures(letters);
    expect(s.total).toBe(6);
    expect(s.groups).toEqual([
      { reason: "Network / timeout", count: 3 },
      { reason: "HTTP 403", count: 2 },
      { reason: "Parse failure", count: 1 },
    ]);
  });

  test("items capped at maxItems, unmodified", () => {
    const letters = Array.from({ length: 8 }, (_, i) =>
      entry({ url: `https://a.com/${i}`, status: 500, error: "boom" })
    );
    const s = summarizeFailures(letters, { maxItems: 3 });
    expect(s.groups).toEqual([{ reason: "HTTP 500", count: 8 }]);
    expect(s.items).toHaveLength(3);
    expect(s.items[0].url).toBe("https://a.com/0");
  });

  test("default cap is 5 items", () => {
    const letters = Array.from({ length: 12 }, (_, i) =>
      entry({ url: `https://a.com/${i}`, error: "TimeoutError" })
    );
    expect(summarizeFailures(letters).items).toHaveLength(5);
  });

  test("groups stay complete even when items are capped (honest counts)", () => {
    const letters = [
      entry({ url: "https://a.com/1", status: 403, error: "x" }),
      entry({ url: "https://a.com/2", error: "JS shell (retry with --playwright)" }),
      entry({ url: "https://a.com/3", error: "JS shell (retry with --playwright)" }),
      entry({ url: "https://a.com/4", error: "JS shell (retry with --playwright)" }),
      entry({ url: "https://a.com/5", error: "JS shell (retry with --playwright)" }),
      entry({ url: "https://a.com/6", error: "JS shell (retry with --playwright)" }),
    ];
    const s = summarizeFailures(letters);
    expect(s.groups).toEqual([
      { reason: "JS shell (no HTML body)", count: 5 },
      { reason: "HTTP 403", count: 1 },
    ]);
    expect(s.items).toHaveLength(5);
  });
});
