/**
 * The shared visit/engagement rules.
 *
 * These fixtures exist so that the Website page and the Engagement page
 * cannot disagree about what a "session" is again. The boundary cases are the
 * point: exactly two pageviews, and one pageview plus each interaction type.
 *
 * Run: bun test packages/analytics/src/sessions.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  bounceRate,
  ENGAGED_MIN_PAGEVIEWS,
  ENGAGEMENT_EVENT_TYPES,
  ENGAGEMENT_TYPES_SQL,
  engagementRate,
  isBounceSession,
  isEngagedSession,
  pagesPerSession,
  SESSION_GAP_MINUTES,
} from "./sessions";

describe("visit definition", () => {
  test("a visit ends after 30 minutes of inactivity", () => {
    expect(SESSION_GAP_MINUTES).toBe(30);
  });

  test("engagement threshold is 2 pageviews", () => {
    expect(ENGAGED_MIN_PAGEVIEWS).toBe(2);
  });
});

describe("engaged visit", () => {
  test("one pageview and no interaction is a bounce", () => {
    const visit = { pageviews: 1, interacted: false };
    expect(isEngagedSession(visit)).toBe(false);
    expect(isBounceSession(visit)).toBe(true);
  });

  test("exactly two pageviews is engaged", () => {
    const visit = { pageviews: 2, interacted: false };
    expect(isEngagedSession(visit)).toBe(true);
    expect(isBounceSession(visit)).toBe(false);
  });

  test("one pageview plus any interaction is engaged", () => {
    for (const type of ENGAGEMENT_EVENT_TYPES) {
      const visit = { pageviews: 1, interacted: true };
      expect(`${type}:${isEngagedSession(visit)}`).toBe(`${type}:true`);
    }
  });

  test("zero pageviews and no interaction is a bounce, not a crash", () => {
    expect(isEngagedSession({ pageviews: 0, interacted: false })).toBe(false);
  });
});

describe("rates", () => {
  test("engagement rate is a percentage", () => {
    expect(engagementRate(1, 4)).toBe(25);
    expect(engagementRate(3, 4)).toBe(75);
  });

  test("bounce rate is the complement", () => {
    expect(bounceRate(1, 4)).toBe(75);
    expect(bounceRate(3, 4)).toBe(25);
  });

  test("zero visits yields zero, never NaN or Infinity", () => {
    expect(engagementRate(0, 0)).toBe(0);
    expect(bounceRate(0, 0)).toBe(0);
    expect(pagesPerSession(0, 0)).toBe(0);
  });

  test("pages per session is one decimal place", () => {
    expect(pagesPerSession(10, 4)).toBe(2.5);
    expect(pagesPerSession(1, 3)).toBe(0.3);
  });
});

describe("the event list cannot drift", () => {
  test("every declared event type appears in the SQL fragment", () => {
    for (const type of ENGAGEMENT_EVENT_TYPES) {
      expect(ENGAGEMENT_TYPES_SQL).toContain(`'${type}'`);
    }
  });

  test("the SQL fragment contains nothing else", () => {
    expect(ENGAGEMENT_TYPES_SQL).toBe(
      "'chat_open', 'chat_message', 'conversion', 'scroll', 'download', 'click', 'voice_start', 'voice_end'"
    );
  });
});
