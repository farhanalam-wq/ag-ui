/**
 * The catalogue's invariants.
 *
 * The catalogue is a contract, so the contract is tested. These assertions
 * are what stop it decaying back into prose: a metric without a story, a
 * source that points at a column that no longer exists, a metric displayed
 * on a surface that does not own it, a caveat nobody can explain.
 *
 * Run: bun test packages/analytics/src/catalogue.test.ts
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  conversations,
  messages as messagesTable,
  metricsDaily,
  metricsHourly,
  pageViews,
  sessions,
} from "@ag-ui/database";
import {
  CAVEATS,
  DIMENSIONS,
  GROUPS,
  METRICS,
  REPORTS,
  SURFACES,
  caveatNotes,
  type CaveatId,
  type DimensionId,
  type SourceRef,
  type SurfaceDef,
  type SurfaceId,
} from "./catalogue";
import { validateReportQuery } from "./registry";

/** The schema tables a metric or dimension may point at, by table name. */
const TABLES: Record<string, Record<string, unknown>> = {
  page_views: pageViews as unknown as Record<string, unknown>,
  sessions: sessions as unknown as Record<string, unknown>,
  metrics_daily: metricsDaily as unknown as Record<string, unknown>,
  metrics_hourly: metricsHourly as unknown as Record<string, unknown>,
  conversations: conversations as unknown as Record<string, unknown>,
  messages: messagesTable as unknown as Record<string, unknown>,
};

/** A Drizzle column carries the database column name on `.name`. */
function isColumn(value: unknown): value is { name: string } {
  return typeof value === "object" && value !== null && "name" in value && "dataType" in value;
}

/**
 * The catalogue names *database* columns, so the lookup matches on the
 * column's database name (`engaged_sessions`), not the JS property
 * (`engagedSessions`).
 */
function columnExists(ref: Extract<SourceRef, { kind: "column" }>): boolean {
  const table = TABLES[ref.table];
  if (!table) return false;
  return Object.values(table).some((c) => isColumn(c) && c.name === ref.column);
}

const allMetrics = Object.values(METRICS);

/** A widened view of the surfaces, so the tests iterate over every tab. */
const surfaces = SURFACES as unknown as Record<string, SurfaceDef>;

describe("the catalogue is a contract", () => {
  test("every metric answers a business question", () => {
    for (const m of allMetrics) {
      expect(m.story.length).toBeGreaterThan(0);
      expect(m.story.endsWith(".")).toBe(true);
      expect(m.definition.length).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  test("every metric declares its shape and its owner", () => {
    for (const m of allMetrics) {
      expect(["int", "float1", "percent1", "money1"]).toContain(m.format);
      expect(["count", "percent", "ratio", "seconds", "currency", "score"]).toContain(m.unit);
      expect(["visit", "event", "visitor", "derived"]).toContain(m.grain);
      expect(["rollup", "live"]).toContain(m.freshness);
      expect(m.gaEquivalent === null || m.gaEquivalent.length > 0).toBe(true);
      expect(SURFACES[m.surface]).toBeDefined();
    }
  });

  test("the key is the id, and ids are unique", () => {
    const ids = new Set<string>();
    for (const [key, m] of Object.entries(METRICS)) {
      expect(key).toBe(m.id);
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
    }
  });

  test("every available metric has a source that resolves", () => {
    for (const m of allMetrics) {
      if (m.status !== "available") continue;
      expect(m.source).toBeDefined();
      const src = m.source!;
      if (src.kind === "column") {
        expect(columnExists(src)).toBe(true);
      } else if (src.kind === "redis") {
        expect(src.key.length).toBeGreaterThan(0);
      } else if (src.kind === "derived") {
        expect(src.of.length).toBeGreaterThan(0);
        for (const of of src.of) expect(METRICS[of]).toBeDefined();
      } else {
        expect(src.how.length).toBeGreaterThan(0);
      }
    }
  });

  test("every dimension points at something real", () => {
    for (const d of Object.values(DIMENSIONS)) {
      expect(d.definition.length).toBeGreaterThan(0);
      if (!d.source) continue;
      if (d.source.kind === "column") expect(columnExists(d.source)).toBe(true);
    }
  });

  test("a metric can only break down by a dimension that exists", () => {
    for (const m of allMetrics) {
      for (const d of m.dimensions ?? []) {
        const dim = DIMENSIONS[d];
        expect(dim).toBeDefined();
        if (m.status === "available") expect(dim!.status).toBe("available");
      }
    }
  });

  test("every caveat that can ride with a metric has a sentence", () => {
    for (const m of allMetrics) {
      for (const c of m.caveats ?? []) {
        expect(CAVEATS[c as CaveatId]).toBeDefined();
      }
    }
  });

  test("every caveat the reports can raise has a sentence", () => {
    // The reports push flags by hand. A flag with no sentence would be
    // dropped silently by `caveatNotes`, so the customer would see a
    // caveat disappear instead of being explained.
    const dir = import.meta.dir;
    const used = new Set<string>();
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      const src = readFileSync(join(dir, file), "utf8");
      for (const m of src.matchAll(/dataQuality\.push\("([^"]+)"\)/g)) used.add(m[1]!);
    }
    expect(used.size).toBeGreaterThan(0);
    for (const code of used) {
      expect(`${code}: ${CAVEATS[code as CaveatId] ?? "MISSING"}`).not.toContain("MISSING");
    }
  });

  test("the caveat sentences resolve, and unknown codes are dropped", () => {
    expect(caveatNotes(["tracking-off"])).toEqual([CAVEATS["tracking-off"]]);
    expect(caveatNotes(["not-a-real-code"])).toEqual([]);
    expect(caveatNotes([])).toEqual([]);
  });
});

describe("surfaces and tabs", () => {
  test("a metric lives on exactly one surface, and is shown on tabs of that surface", () => {
    for (const m of allMetrics) {
      const tabs = Object.entries(surfaces[m.surface].tabs).filter(([, t]) => t.metrics.includes(m.id));
      if (m.status === "available") {
        expect(tabs.length).toBeGreaterThan(0);
      }
      // Never displayed on a surface that does not own it.
      for (const [surfaceId, s] of Object.entries(surfaces)) {
        for (const t of Object.values(s.tabs)) {
          if (t.metrics.includes(m.id)) {
            expect(surfaceId).toBe(m.surface);
          }
        }
      }
    }
  });

  test("an available metric's home tab is one of the tabs that shows it", () => {
    for (const m of allMetrics) {
      if (m.status !== "available") continue;
      const home = surfaces[m.surface].tabs[m.tab];
      expect(home).toBeDefined();
      expect(home!.metrics).toContain(m.id);
    }
  });

  test("every tab names dimensions that exist and are available", () => {
    for (const s of Object.values(surfaces)) {
      for (const t of Object.values(s.tabs)) {
        expect(t.label.length).toBeGreaterThan(0);
        for (const d of t.dimensions) {
          expect(DIMENSIONS[d as DimensionId]).toBeDefined();
          expect(DIMENSIONS[d as DimensionId].status).toBe("available");
        }
      }
    }
  });

  test("a tab never shows a metric that is not built yet", () => {
    for (const [surfaceId, s] of Object.entries(surfaces)) {
      for (const t of Object.values(s.tabs)) {
        for (const id of t.metrics) {
          expect(METRICS[id]).toBeDefined();
          // Planned metrics are not shown until the phase that builds them.
          expect(METRICS[id].status).not.toBe("planned");
          // Excluded metrics are served by the parked page, outside the
          // report framework, and only there.
          if (METRICS[id].status === "excluded") expect(surfaceId).toBe("parked");
        }
      }
    }
  });
});

describe("the reports the API serves", () => {
  test("every report group is a valid query against the catalogue", () => {
    for (const [report, groups] of Object.entries(REPORTS)) {
      for (const [name, group] of Object.entries(groups)) {
        const r = validateReportQuery({ metrics: [...group.metrics], dimensions: [...group.dimensions], rangeDays: 7 });
        expect(`${report}.${name}: ${r.ok ? "ok" : JSON.stringify(r.errors)}`).toBe(`${report}.${name}: ok`);
      }
    }
  });

  test("a report only serves metrics that are available", () => {
    for (const groups of Object.values(REPORTS)) {
      for (const group of Object.values(groups)) {
        for (const id of group.metrics) {
          expect(METRICS[id]).toBeDefined();
          expect(METRICS[id].status).toBe("available");
        }
      }
    }
  });
});

describe("the catalogue and the code that uses it", () => {
  test("the validator refuses exactly the excluded metrics", () => {
    for (const m of allMetrics) {
      const r = validateReportQuery({ metrics: [m.id], rangeDays: 7 });
      if (m.status === "excluded") {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors[0]!.code).toBe("conversion-scope-excluded");
      } else if (m.status === "available") {
        expect(r.ok).toBe(true);
      } else {
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.errors[0]!.code).toBe("metric-not-available");
      }
    }
  });

  test("the groups only contain metrics that exist", () => {
    for (const members of Object.values(GROUPS)) {
      for (const id of members) expect(METRICS[id]).toBeDefined();
    }
  });

  test("the parked surface is where the excluded metrics live", () => {
    for (const m of allMetrics) {
      if (m.status !== "excluded") continue;
      expect(m.surface).toBe("parked");
      expect(m.note).toBeDefined();
    }
  });
});

describe("the surface ids are the declared ones", () => {
  test("a surface id in the catalogue resolves to a declared surface", () => {
    for (const m of allMetrics) {
      const id = m.surface as SurfaceId;
      expect(SURFACES[id]).toBeDefined();
    }
  });
});
