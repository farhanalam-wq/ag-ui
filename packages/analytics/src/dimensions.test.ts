/**
 * packages/analytics/src/dimensions.test.ts
 *
 * The dimension rules. Each has one definition, and the two callers — the
 * Drizzle reports and the raw-SQL rollup — read the same one, so a visit
 * cannot be a Mobile visit on one page and a Desktop visit on another.
 */

import { describe, expect, test } from "bun:test";
import { sql } from "@ag-ui/database";
import { deviceCaseSql, deviceCaseSqlText, localHourSql, timezoneOffsetMinutes, viewportWidthBucketSql, VIEWPORT_WIDTH_BUCKETS, VIEWPORT_WIDTH_UNKNOWN } from "./dimensions";
import { deviceFragment } from "./attribution";

/** The SQL an expression compiles to, parameters included. */
function sqlText(frag: { queryChunks: unknown[] }): string {
  const parts: string[] = [];
  const walk = (chunks: unknown[]) => {
    for (const c of chunks as any[]) {
      if (typeof c === "string" || typeof c === "number") {
        parts.push(String(c));
      } else if (c && typeof c === "object") {
        if (Array.isArray(c.queryChunks)) walk(c.queryChunks);
        else if (typeof c.sql === "string") parts.push(c.sql);
        else if ("value" in c) {
          const v = c.value;
          parts.push(Array.isArray(v) ? v.join("") : String(v));
        }
      }
    }
  };
  walk(frag.queryChunks);
  return parts.join("");
}

describe("the device rule", () => {
  test("a narrow viewport is Mobile, a wide one is Desktop", () => {
    const text = sqlText(deviceCaseSql(sql`vp`));
    expect(text).toContain("'Mobile'");
    expect(text).toContain("'Desktop'");
  });

  test("the builder copy carries the same threshold as the raw-SQL copy", () => {
    // The rollup cannot use the builder, so the rule exists twice — and the
    // two must not drift apart.
    expect(sqlText(deviceCaseSql(sql`vp`))).toContain("< 768");
    expect(deviceCaseSqlText("first_viewport")).toContain("< 768");
  });

  test("the threshold is written into the expression, not bound", () => {
    // The expression is used twice in one query (SELECT and GROUP BY), and
    // Postgres only groups by an expression identical to the selected one.
    // A bound 768 is a different expression from a written-out 768, and the
    // query fails with "must appear in the GROUP BY clause".
    expect(sqlText(deviceCaseSql(sql`vp`))).toContain("< 768");
  });

  test("the re-exported fragment is the same rule", () => {
    expect(deviceFragment).toBe(deviceCaseSql);
  });
});

describe("the viewport-width bucket rule", () => {
  const bucket = (vp = sql`viewport`) =>
    viewportWidthBucketSql(vp as never);

  test("every bucket label appears, plus the unknown bucket", () => {
    const text = sqlText(bucket());
    for (const label of [...VIEWPORT_WIDTH_BUCKETS.map((b) => b.label), VIEWPORT_WIDTH_UNKNOWN]) {
      expect(text).toContain(`'${label}'`);
    }
  });

  test("the Mobile/Desktop edge is the device rule's own threshold", () => {
    // The histogram explains the device split; a second boundary vocabulary
    // would let the two disagree.
    expect(sqlText(bucket())).toContain("< 768");
  });

  test("no bound parameters — SELECT and GROUP BY stay identical", () => {
    // Same trap as the device rule: the fragment is inlined twice in one
    // query, and a bound copy would make the GROUP BY a different expression.
    expect(sqlText(bucket())).not.toMatch(/\$\d+/);
  });

  test("a viewport that does not parse is unknown, not a width", () => {
    const text = sqlText(bucket());
    const unknownArm = text.slice(text.indexOf("CASE"), text.indexOf("WHEN substring"));
    expect(unknownArm).toContain("(unknown)");
  });
});

describe("the local hour", () => {
  test("shifts the visit's start by the reported offset", () => {
    const text = sqlText(localHourSql(sql`started_at`, sql`tz_offset`));
    expect(text).toContain("EXTRACT(HOUR FROM");
    expect(text).toContain("COALESCE");
  });
});

describe("timezone resolution", () => {
  const at = new Date("2026-07-01T12:00:00Z");

  test("resolves a zone to minutes east of UTC", () => {
    expect(timezoneOffsetMinutes("Europe/Berlin", at)).toBe(120); // CEST
    expect(timezoneOffsetMinutes("America/New_York", at)).toBe(-240); // EDT
    expect(timezoneOffsetMinutes("Asia/Kolkata", at)).toBe(330);
    expect(timezoneOffsetMinutes("UTC", at)).toBe(0);
  });

  test("follows daylight saving, because the offset is resolved for the instant", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    expect(timezoneOffsetMinutes("Europe/Berlin", winter)).toBe(60); // CET
    expect(timezoneOffsetMinutes("Europe/Berlin", at)).toBe(120); // CEST
  });

  test("an unknown zone is null, never a wrong hour", () => {
    expect(timezoneOffsetMinutes("Mars/Olympus", at)).toBeNull();
    expect(timezoneOffsetMinutes("", at)).toBeNull();
    expect(timezoneOffsetMinutes(null, at)).toBeNull();
    expect(timezoneOffsetMinutes(undefined, at)).toBeNull();
    expect(timezoneOffsetMinutes("../../etc/passwd", at)).toBeNull();
  });
});
