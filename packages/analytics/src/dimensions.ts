/**
 * packages/analytics/src/dimensions.ts
 *
 * One rule per dimension.
 *
 * Device, browser, operating system and hour-of-day are all derived, and
 * each derivation used to have more than one home. The device rule lived in
 * `attribution.ts` as a SQL fragment while the rollup had no idea what a
 * device was, so the rollup's sessions and the Engagement page's device
 * table could disagree about the same visit. A dimension that has two rules
 * is not a dimension, it is a coin toss.
 *
 * So every rule in this file has exactly one definition, and both callers
 * — the Drizzle reports and the raw-SQL rollup — read it from here:
 *
 *   - `deviceCaseSql` / `deviceCaseSqlText`: viewport width → Mobile/Desktop
 *   - `localHourSql`: a visit's start hour in the visitor's own timezone
 *   - `timezoneOffsetMinutes`: an IANA timezone → minutes east of UTC
 *
 * The browser and operating-system taxonomies are not here: they are data,
 * and data lives in the catalogue (`BROWSER_VALUES` / `OS_VALUES`).
 */

import { sql, type SQL, type SQLWrapper } from "@ag-ui/database";

/** Below this viewport width a visit counts as Mobile. */
export const DEVICE_MOBILE_MAX_WIDTH = 768;

/**
 * The device rule as a SQL expression.
 *
 * A viewport that does not parse ("", "unknown", "1024") is not Mobile:
 * the product says Desktop vs Mobile, and a missing width is not evidence
 * of a small screen.
 *
 * The threshold is written into the expression rather than bound as a
 * parameter, because this expression is used twice in the same query — once
 * in the SELECT and once in the GROUP BY — and Postgres only accepts a
 * grouped expression that is *identical* to the selected one. Two bound
 * copies of "768" are two different expressions, and the query fails.
 */
export function deviceCaseSql(vp: SQLWrapper): SQL<string> {
  return sql<string>`CASE
    WHEN ${vp} ~ '^[0-9]{1,4}x' AND substring(${vp} from '^([0-9]{1,4})x')::int < ${sql.raw(
      String(DEVICE_MOBILE_MAX_WIDTH)
    )}
    THEN 'Mobile' ELSE 'Desktop' END`;
}

/**
 * The same rule as raw SQL text, for the one module that cannot use the
 * builder (the rollup). It is generated from the same constants, so the two
 * cannot drift apart.
 */
export function deviceCaseSqlText(column: string): string {
  return `CASE WHEN ${column} ~ '^[0-9]{1,4}x' AND substring(${column} from '^([0-9]{1,4})x')::int < ${DEVICE_MOBILE_MAX_WIDTH} THEN 'Mobile' ELSE 'Desktop' END`;
}

/**
 * The hour a visit started, in the visitor's own timezone.
 *
 * `startedAt` is a timestamptz and the database runs in UTC, so the hour is
 * extracted in UTC after shifting the instant by the visit's reported offset.
 * A visit with no reported offset (`NULL`) is bucketed in UTC — and the
 * report says so, with the `timezone-unavailable` caveat, rather than
 * pretending every visitor is on the same clock.
 */
export function localHourSql(startedAt: SQLWrapper, tzOffset: SQLWrapper): SQL<number> {
  return sql<number>`EXTRACT(HOUR FROM ${startedAt} + (COALESCE(${tzOffset}, 0) * INTERVAL '1 minute'))::int`;
}

/**
 * The same rule as raw SQL text, for the rollup.
 */
export function localHourSqlText(startedAt: string, tzOffset: string): string {
  return `EXTRACT(HOUR FROM ${startedAt} + (COALESCE(${tzOffset}, 0) * INTERVAL '1 minute'))::int`;
}

/**
 * Minutes east of UTC for an IANA timezone at a given instant.
 *
 * The snippet reports `Intl.DateTimeFormat().resolvedOptions().timeZone` —
 * a *zone*, not an offset — so the offset is resolved here, at the moment
 * the event happened, which is what makes daylight saving correct.
 *
 * Returns null for anything that is not a timezone this runtime knows:
 * an unknown zone must not become a wrong hour.
 */
export function timezoneOffsetMinutes(timeZone: string | null | undefined, at: Date): number | null {
  const tz = (timeZone ?? "").trim();
  if (tz.length === 0) return null;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    });
    const part = formatter.formatToParts(at).find((p) => p.type === "timeZoneName");
    const raw = part?.value ?? "";
    // "GMT", "GMT+02:00", "GMT-05:30"
    const m = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(raw);
    if (!m) return null;
    const sign = m[1] === "-" ? -1 : 1;
    const hours = parseInt(m[2] ?? "0", 10);
    const minutes = parseInt(m[3] ?? "0", 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return sign * (hours * 60 + minutes);
  } catch {
    return null;
  }
}
