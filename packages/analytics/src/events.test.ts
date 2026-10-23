/**
 * Phase 3 unit tests (permanent): new event-type validation.
 * Run: bun test packages/analytics/src/events.test.ts
 */
import { describe, expect, test } from "bun:test";
import { validateTrackEvent, normalizePagePath, TRACK_EVENT_TYPES } from "./events";

const base = {
  event_id: "e1",
  company_id: "c1",
  session_hash: "s1",
  visitor_hash: "v1",
  url: "https://shop.example/pricing",
};

describe("phase 3 event types", () => {
  test("scroll/download/click/heartbeat validate like pageviews", () => {
    for (const type of ["scroll", "download", "click", "heartbeat"] as const) {
      const r = validateTrackEvent({ ...base, event_id: `e-${type}`, type });
      expect(r.ok).toBe(true);
    }
    expect(TRACK_EVENT_TYPES).toContain("heartbeat");
  });

  test("scroll depth rides in capped meta", () => {
    const r = validateTrackEvent({ ...base, event_id: "e-scroll", type: "scroll", meta: { depth: 50 } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.meta).toEqual({ depth: 50 });
  });

  test("pageview title rides in capped meta", () => {
    const r = validateTrackEvent({ ...base, event_id: "e-pv", type: "pageview", meta: { title: "Pricing" } });
    expect(r.ok).toBe(true);
  });

  test("unknown types still rejected; value only honored on conversion", () => {
    expect(validateTrackEvent({ ...base, event_id: "e-x", type: "signup" }).ok).toBe(false);
    const hb = validateTrackEvent({ ...base, event_id: "e-hb", type: "heartbeat", value: 99 });
    expect(hb.ok).toBe(true);
    if (hb.ok) expect(hb.event.value).toBeNull();
  });
});

describe("voice events are counts only (O-3)", () => {
  test("voice_start and voice_end are known types", () => {
    expect(TRACK_EVENT_TYPES).toContain("voice_start");
    expect(TRACK_EVENT_TYPES).toContain("voice_end");
  });

  test("voice_start carries no meta at all", () => {
    const r = validateTrackEvent({
      ...base,
      event_id: "e-vstart",
      type: "voice_start",
      meta: { transcript: "hello" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.meta).toEqual({});
  });

  test("voice_end rebuilds meta from three primitives and drops everything else", () => {
    // A malicious or careless client posts a transcript. The validator keeps
    // the counts and nothing else — O-3 is enforced here, not trusted.
    const r = validateTrackEvent({
      ...base,
      event_id: "e-vend",
      type: "voice_end",
      meta: { durationSec: 92.6, turns: 4, abandoned: false, transcript: "my card is 4111 1111" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.meta).toEqual({ durationSec: 93, turns: 4, abandoned: false });
      expect(JSON.stringify(r.event.meta)).not.toContain("4111");
    }
  });

  test("voice_end caps runaway values and coerces junk", () => {
    const r = validateTrackEvent({
      ...base,
      event_id: "e-vcap",
      type: "voice_end",
      meta: { durationSec: 999_999, turns: -5, abandoned: "yes" },
    });
    expect(r.ok).toBe(true);
    // turns clamps to 0, and abandonment is derived from turns — never reported.
    if (r.ok) expect(r.event.meta).toEqual({ durationSec: 14400, turns: 0, abandoned: true });
  });

  test("a voice_end with no meta still produces a usable row", () => {
    const r = validateTrackEvent({ ...base, event_id: "e-vnone", type: "voice_end" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.meta).toEqual({ durationSec: 0, turns: 0, abandoned: true });
  });
});

describe("chat events are counts only", () => {
  test("chat_open stores a zero turn count and nothing else", () => {
    const r = validateTrackEvent({
      ...base,
      event_id: "e-copen",
      type: "chat_open",
      meta: { turns: 9, text: "hello", title: "Pricing" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.meta).toEqual({ turns: 0 });
  });

  test("chat_message keeps its turn count and drops the question", () => {
    const r = validateTrackEvent({
      ...base,
      event_id: "e-cmsg",
      type: "chat_message",
      meta: { turns: 2, text: "my card is 4111 1111" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.event.meta).toEqual({ turns: 2 });
      expect(JSON.stringify(r.event.meta)).not.toContain("4111");
    }
  });

  test("chat_close carries the panel's duration and turns, nothing else", () => {
    const r = validateTrackEvent({
      ...base,
      event_id: "e-cclose",
      type: "chat_close",
      meta: { durationSec: 93.4, turns: 3, transcript: "secret" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.meta).toEqual({ durationSec: 93, turns: 3 });
  });

  test("runaway chat values are capped", () => {
    const r = validateTrackEvent({
      ...base,
      event_id: "e-ccap",
      type: "chat_close",
      meta: { durationSec: 999_999, turns: -1 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.event.meta).toEqual({ durationSec: 14400, turns: 0 });
  });
});

describe("normalizePagePath (conversation host path)", () => {
  test("accepts a same-site path", () => {
    expect(normalizePagePath("/pricing")).toBe("/pricing");
    expect(normalizePagePath("  /docs/getting-started  ")).toBe("/docs/getting-started");
  });

  test("drops query and hash, so a path is not a query log", () => {
    expect(normalizePagePath("/search?q=card+4111")).toBe("/search");
    expect(normalizePagePath("/docs#install")).toBe("/docs");
  });

  test("rejects anything that is not a path", () => {
    expect(normalizePagePath("https://evil.example/x")).toBeNull();
    expect(normalizePagePath("pricing")).toBeNull();
    expect(normalizePagePath("/a\u0000b")).toBeNull();
    expect(normalizePagePath(42)).toBeNull();
    expect(normalizePagePath(null)).toBeNull();
  });

  test("truncates rather than storing an unbounded string", () => {
    const long = "/" + "a".repeat(5000);
    expect(normalizePagePath(long)!.length).toBe(1024);
  });
});
