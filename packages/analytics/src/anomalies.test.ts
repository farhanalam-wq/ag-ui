/**
 * The anomaly detector's permanent tests: the gates, and the z-score.
 *
 * Run: bun test packages/analytics/src/anomalies.test.ts
 */
import { describe, expect, test } from "bun:test";
import { detectAnomalies } from "./anomalies";

describe("detectAnomalies", () => {
  const base = [100, 102, 98, 101, 99, 100, 102];

  test("flags a spike day", () => {
    const f = detectAnomalies(base, [{ d: "2026-10-16", v: 140 }]);
    expect(f.length).toBe(1);
    expect(f[0]!.z).toBeGreaterThan(2);
  });

  test("ignores normal days and low-volume baselines", () => {
    expect(detectAnomalies(base, [{ d: "d", v: 101 }])).toEqual([]);
    // A quiet site must not turn noise into news.
    expect(detectAnomalies([5, 6, 5, 6, 5, 6, 5], [{ d: "d", v: 30 }])).toEqual([]);
    // Two baseline days are not a baseline.
    expect(detectAnomalies([100, 102], [{ d: "d", v: 200 }])).toEqual([]);
  });
});
