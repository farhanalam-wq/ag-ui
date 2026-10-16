/**
 * Phase 6 unit tests (permanent): scoring, gates, anomaly detector.
 * Run: bun test packages/analytics/src/insights.test.ts
 */
import { describe, expect, test } from "bun:test";
import { qualityScore, opportunityLabel, detectAnomalies } from "./insights";

describe("qualityScore", () => {
  test("perfect engagement scores 100, dead channel scores low", () => {
    expect(qualityScore(1, 0, 5)).toBe(100);
    expect(qualityScore(0, 1, 1)).toBeLessThan(15);
  });
});

describe("opportunityLabel", () => {
  test("small samples gate as insufficient-data", () => {
    expect(opportunityLabel(3, 1, 0).opportunity).toBe("insufficient-data");
  });
  test("high single-view share with volume is high opportunity", () => {
    expect(opportunityLabel(20, 0.8, 0.5).opportunity).toBe("high");
  });
  test("healthy entry is low", () => {
    expect(opportunityLabel(20, 0.2, 0.8).opportunity).toBe("low");
  });
});

describe("detectAnomalies", () => {
  const base = [100, 102, 98, 101, 99, 100, 102];
  test("flags a spike day", () => {
    const f = detectAnomalies(base, [{ d: "2026-10-16", v: 140 }], "prev");
    expect(f.length).toBe(1);
    expect(f[0]!.z).toBeGreaterThan(2);
  });
  test("ignores normal days and low-volume baselines", () => {
    expect(detectAnomalies(base, [{ d: "d", v: 101 }], "prev")).toEqual([]);
    expect(detectAnomalies([5, 6, 5, 6, 5, 6, 5], [{ d: "d", v: 30 }], "prev")).toEqual([]);
    expect(detectAnomalies([100, 102], [{ d: "d", v: 200 }], "prev")).toEqual([]);
  });
});
