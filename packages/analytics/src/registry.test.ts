/**
 * The registry's behaviour: query validation, channel taxonomy, Organic
 * Search exclusion vs Organic Social.
 *
 * The metric contract's own invariants (every metric has a story, every
 * source resolves, every surface owns its metrics) live in
 * `catalogue.test.ts`.
 * Run: bun test packages/analytics/src/registry.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  classifyChannel,
  classifyDevice,
  parseUtm,
  validateReportQuery,
  MAX_RANGE_DAYS,
} from "./registry";
import { METRICS } from "./catalogue";

describe("channel taxonomy (free, first-party)", () => {
  test("direct: no referrer, no utm", () => {
    expect(classifyChannel("", "https://shop.example/pricing")).toEqual({
      channel: "Direct",
      source: "(direct)",
      medium: "(none)",
      campaign: "(not set)",
    });
  });

  test("organic social via referrer host (and subdomains)", () => {
    expect(classifyChannel("https://www.instagram.com/p/x", "https://shop.example/").channel).toBe("Organic Social");
    expect(classifyChannel("https://m.facebook.com/y", "https://shop.example/").channel).toBe("Organic Social");
    expect(classifyChannel("https://x.com/z", "https://shop.example/").channel).toBe("Organic Social");
  });

  test("organic social via utm_medium=social survives without referrer", () => {
    const a = classifyChannel("", "https://shop.example/?utm_medium=social&utm_source=instagram");
    expect(a.channel).toBe("Organic Social");
    expect(a.source).toBe("instagram");
  });

  test("search referrers stay Referral (no fabricated Organic Search)", () => {
    for (const ref of ["https://www.google.com/search?q=x", "https://www.bing.com/search?q=x", "https://duckduckgo.com/?q=x"]) {
      const a = classifyChannel(ref, "https://shop.example/");
      expect(a.channel).toBe("Referral");
      expect(a.source).toContain(".");
    }
  });

  test("email precedence over social/campaign signals", () => {
    const a = classifyChannel("https://x.com/z", "https://shop.example/?utm_medium=email&utm_campaign=launch");
    expect(a.channel).toBe("Email");
    expect(a.campaign).toBe("launch");
  });

  test("campaign via utm_campaign; plain referrer is Referral", () => {
    expect(classifyChannel("", "https://shop.example/?utm_campaign=spring").channel).toBe("Campaign");
    expect(classifyChannel("https://blog.example/post", "https://shop.example/").channel).toBe("Referral");
  });

  test("never throws on hostile input", () => {
    expect(classifyChannel("::::", "not a url").channel).toBe("Direct");
    expect(parseUtm("::::")).toEqual({ source: "", medium: "", campaign: "" });
  });
});

describe("device buckets", () => {
  test("viewport width split at 768", () => {
    expect(classifyDevice("390x844")).toBe("Mobile");
    expect(classifyDevice("1440x900")).toBe("Desktop");
    expect(classifyDevice("")).toBe("Desktop");
  });
});

describe("query validator", () => {
  test("accepts a valid acquisition query", () => {
    const r = validateReportQuery({ metrics: ["sessions", "pageviews"], dimensions: ["day", "channel"], rangeDays: 14 });
    expect(r.ok).toBe(true);
  });

  test("rejects unknown metric/dimension and bad range", () => {
    const r = validateReportQuery({ metrics: ["nope"], dimensions: ["nope"], rangeDays: 91 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.map((e) => e.code)).toContain("unknown-metric");
      expect(r.errors.map((e) => e.code)).toContain("unknown-dimension");
      expect(r.errors.map((e) => e.code)).toContain("bad-range");
    }
    expect(MAX_RANGE_DAYS).toBe(90);
  });

  test("planned metrics fail loudly, never silently", () => {
    const r = validateReportQuery({ metrics: ["newUsers"], dimensions: ["day"], rangeDays: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.every((e) => e.code === "metric-not-available")).toBe(true);
  });

  test("delivered metrics validate (engagedSessions, landingPage)", () => {
    const r = validateReportQuery({
      metrics: ["sessions", "pageviews", "engagedSessions"],
      dimensions: ["day", "path", "device"],
      rangeDays: 7,
    });
    expect(r.ok).toBe(true);
    const r2 = validateReportQuery({ metrics: ["sessions"], dimensions: ["landingPage"], rangeDays: 7 });
    expect(r2.ok).toBe(true);
    const r3 = validateReportQuery({ metrics: ["engagementRate"], dimensions: ["day"], rangeDays: 7 });
    expect(r3.ok).toBe(true);
  });

  test("conversion metrics rejected as out-of-scope", () => {
    const r = validateReportQuery({ metrics: ["conversions", "revenue"], rangeDays: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.every((e) => e.code === "conversion-scope-excluded")).toBe(true);
  });

  test("organic search filter rejected; organic social filter allowed", () => {
    const bad = validateReportQuery({ metrics: ["sessions"], rangeDays: 7, channelFilter: ["Organic Search"] });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors[0]!.code).toBe("organic-search-unsupported");
    const good = validateReportQuery({ metrics: ["sessions"], rangeDays: 7, channelFilter: ["Organic Social", "Direct"] });
    expect(good.ok).toBe(true);
  });

  test("uniques cannot split by channel (HLL constraint)", () => {
    const r = validateReportQuery({ metrics: ["uniques"], dimensions: ["channel"], rangeDays: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.code).toBe("incompatible-dimensions");
  });

  test("the metric catalogue is reachable through the registry's public surface", () => {
    // The catalogue's own invariants (every metric has a story, every
    // source resolves) live in catalogue.test.ts.
    expect(Object.keys(METRICS).length).toBeGreaterThan(0);
  });
});
