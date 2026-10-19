/**
 * Phase 7 unit tests (permanent): parser routing, ranges, guardrails.
 * No DB: rejections return before any query.
 * Run: bun test packages/analytics/src/copilot.test.ts
 */
import { describe, expect, test } from "bun:test";
import { parseQuestion } from "./copilot";

describe("copilot parser", () => {
  test("routes a channel breakdown with range and compare", () => {
    const r = parseQuestion("sessions by channel last 7 days vs previous");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.intent).toBe("report");
    expect(r.plan.report).toBe("acquisition");
    expect(r.plan.rangeDays).toBe(7);
    expect(r.plan.compare).toBe(true);
  });

  test("parses weeks and defaults", () => {
    const r = parseQuestion("views past 2 weeks");
    expect(r.ok && r.plan.rangeDays).toBe(14);
    const d = parseQuestion("top pages?");
    expect(d.ok && d.plan.report).toBe("engagement");
  });

  test("extracts social channel without touching search", () => {
    const r = parseQuestion("traffic from social last 30 days");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.channels).toEqual(["Organic Social"]);
  });

  test("widget routing: trend vs kpis vs table", () => {
    const t = parseQuestion("show views trend as a bar chart last 30 days");
    expect(t.ok && t.plan.intent).toBe("widget");
    if (!t.ok || t.plan.intent !== "widget") return;
    expect(t.plan.widgetKind).toBe("acquisition-trend");
    expect(t.plan.variant).toBe("bar");
    const k = parseQuestion("engagement rate and active time widget");
    expect(k.ok && (k.plan as { widgetKind?: string }).widgetKind).toBe("engagement-kpis");
    const tb = parseQuestion("show channels table");
    expect(tb.ok && (tb.plan as { widgetKind?: string }).widgetKind).toBe("data-table");
  });

  test("insights routing", () => {
    const r = parseQuestion("any traffic anomalies?");
    expect(r.ok && r.plan.intent).toBe("insights");
    if (!r.ok || r.plan.intent !== "insights") return;
    expect(r.plan.section).toBe("anomalies");
  });

  test("guardrails: conversions, forecasts, gibberish", () => {
    const c = parseQuestion("what is our revenue?");
    expect(!c.ok && c.rejection.code).toBe("conversion-scope-excluded");
    const f = parseQuestion("predict next month traffic");
    expect(!f.ok && f.rejection.code).toBe("unsupported-forecast");
    const g = parseQuestion("hello there");
    expect(!g.ok && (g.rejection as { code: string }).code).toBe("unparseable");
    if (!g.ok && "examples" in g.rejection) expect(g.rejection.examples.length).toBeGreaterThan(0);
  });
});
