/**
 * Phase 3 unit tests (permanent): new event-type validation.
 * Run: bun test packages/analytics/src/events.test.ts
 */
import { describe, expect, test } from "bun:test";
import { validateTrackEvent, TRACK_EVENT_TYPES } from "./events";

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
