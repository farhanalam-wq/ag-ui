/**
 * Phase 5 unit tests (permanent): widget config validation rejects bad
 * configs with reasons before touching the database.
 * Run: bun test packages/analytics/src/widgets.test.ts
 */
import { describe, expect, test } from "bun:test";
import { buildWidgetSpec } from "./widgets";

describe("widget config validation", () => {
  test("unknown kind and out-of-range days rejected", async () => {
    const r1 = await buildWidgetSpec(null, "c", { kind: "funnel-3d", rangeDays: 7 });
    expect(r1.ok).toBe(false);
    const r2 = await buildWidgetSpec(null, "c", { kind: "acquisition-kpis", rangeDays: 91 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors[0]!.code).toBe("bad-kind");
  });

  test("data-table needs a compatible report+table pair", async () => {
    const r1 = await buildWidgetSpec(null, "c", { kind: "data-table", rangeDays: 7 });
    expect(r1.ok).toBe(false);
    const r2 = await buildWidgetSpec(null, "c", {
      kind: "data-table", report: "acquisition", table: "title", rangeDays: 7,
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors[0]!.code).toBe("incompatible-table");
  });

  test("channels only on acquisition; trend metric must match family", async () => {
    const r1 = await buildWidgetSpec(null, "c", {
      kind: "engagement-kpis", rangeDays: 7, channels: ["Email"],
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.errors[0]!.code).toBe("bad-channels");
    const r2 = await buildWidgetSpec(null, "c", {
      kind: "acquisition-trend", rangeDays: 7, trendMetric: "engagedSessions",
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.errors[0]!.code).toBe("bad-trend-metric");
  });

  test("report must match the widget family when given", async () => {
    const r = await buildWidgetSpec(null, "c", {
      kind: "acquisition-kpis", report: "engagement", rangeDays: 7,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.code).toBe("incompatible-report");
  });
});
