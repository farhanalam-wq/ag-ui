/**
 * packages/analytics/src/audience.ts
 *
 * Who is showing up: device, browser, operating system and hour of day.
 *
 * Everything here is read from the visit fact table the rollup writes
 * (`sessions`), so a breakdown of "Sessions" by device is the same unit the
 * rollup counts — one row per visit, not one per page load. The rollup
 * copies the visit's profile from the event that opened it, using the same
 * rules the reports use (`dimensions.ts`): the device from the visit's first
 * page, the browser, the OS and the timezone from its first event.
 *
 * Two honest limits, both stated in the payload rather than hidden:
 *
 *   - a visit with no reported timezone is bucketed in UTC, and the report
 *     says what share of visits that covers (`timezone-unavailable`);
 *   - events collected before the collector recorded a profile have no
 *     browser or OS at all, and the report says so too
 *     (`dimensions-unavailable`).
 *
 * Country is not here: the GeoIP source is still an open decision
 * (docs/analytics-rebuild.md D12), and a breakdown nobody can source is
 * worse than no breakdown.
 */

import { db, sessions as sessionsTable, pageViews, sql, eq, and, gte, lt } from "@ag-ui/database";
import { reportFreshness, type AudienceReport, type BreakdownRow } from "./registry";
import { localHourSql, viewportWidthBucketSql, VIEWPORT_WIDTH_BUCKETS, VIEWPORT_WIDTH_UNKNOWN } from "./dimensions";

/** The label a missing dimension gets. "Unknown" is not "other". */
function label(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : "Unknown";
}

/**
 * The audience profile for a range of days.
 *
 * One query produces the joint distribution (device × browser × OS × hour);
 * the four breakdowns are that grid read four ways, so the numbers always
 * add up to the same total.
 */
export async function getAudienceReport(
  companyId: string,
  rangeDays: number
): Promise<AudienceReport> {
  const dataQuality: string[] = [];
  const now = new Date();
  const fromDay = new Date(now.getTime() - (rangeDays - 1) * 86_400_000).toISOString().slice(0, 10);
  const windowStart = new Date(`${fromDay}T00:00:00Z`);

  const hour = localHourSql(sessionsTable.startedAt, sessionsTable.tzOffset);

  const grid = await db
    .select({
      device: sessionsTable.device,
      browser: sessionsTable.browser,
      os: sessionsTable.os,
      hour: hour.as("hour"),
      visits: sql<number>`COUNT(*)::int`.as("visits"),
      pageviews: sql<number>`COALESCE(SUM(${sessionsTable.pageviewCount}), 0)::int`.as("pageviews"),
      withTimezone: sql<number>`COUNT(*) FILTER (WHERE ${sessionsTable.tzOffset} IS NOT NULL)::int`.as("with_tz"),
    })
    .from(sessionsTable)
    .where(
      and(
        eq(sessionsTable.companyId, companyId),
        gte(sessionsTable.startedAt, windowStart),
        lt(sessionsTable.startedAt, now)
      )
    )
    .groupBy(sessionsTable.device, sessionsTable.browser, sessionsTable.os, hour);

  const totals = { sessions: 0, pageviews: 0 };
  let withTimezone = 0;
  const devices = new Map<string, { sessions: number; pageviews: number }>();
  const browsers = new Map<string, { sessions: number; pageviews: number }>();
  const oses = new Map<string, { sessions: number; pageviews: number }>();
  const hours = new Map<string, { sessions: number; pageviews: number }>();

  const add = (
    into: Map<string, { sessions: number; pageviews: number }>,
    key: string,
    sessions: number,
    pageviews: number
  ) => {
    const cur = into.get(key) ?? { sessions: 0, pageviews: 0 };
    cur.sessions += sessions;
    cur.pageviews += pageviews;
    into.set(key, cur);
  };

  for (const row of grid) {
    const visits = Number(row.visits ?? 0);
    const pageviews = Number(row.pageviews ?? 0);
    totals.sessions += visits;
    totals.pageviews += pageviews;
    withTimezone += Number(row.withTimezone ?? 0);

    add(devices, label(row.device), visits, pageviews);
    add(browsers, label(row.browser), visits, pageviews);
    add(oses, label(row.os), visits, pageviews);
    add(hours, `${String(row.hour ?? 0).padStart(2, "0")}:00`, visits, pageviews);
  }

  const toRows = (m: Map<string, { sessions: number; pageviews: number }>): BreakdownRow[] =>
    [...m.entries()]
      .map(([label, v]) => ({ label, sessions: v.sessions, pageviews: v.pageviews }))
      .sort((a, b) => Number(b.sessions) - Number(a.sessions));

  const timezoneCoverage =
    totals.sessions > 0 ? Math.round((withTimezone / totals.sessions) * 1000) / 10 : 0;

  // The viewport-width distribution behind the device split: the same scan
  // the Website overview uses for its top viewports, grouped by the bucket
  // rule instead of the raw string, so the shape survives sparse widths.
  // Pageview grain — the visit table keeps the device bucket, not the width
  // — and the tab says so. The same fragment object inlines into SELECT and
  // GROUP BY, so Postgres sees one expression, not two.
  const widthBucket = viewportWidthBucketSql(pageViews.viewport);
  const widthRows = await db
    .select({
      label: sql<string>`${widthBucket}`.as("label"),
      pageviews: sql<number>`COUNT(*)::int`.as("pageviews"),
    })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.companyId, companyId),
        eq(pageViews.type, "pageview"),
        eq(pageViews.isBot, false),
        gte(pageViews.createdAt, windowStart),
        lt(pageViews.createdAt, now)
      )
    )
    .groupBy(sql`${widthBucket}`);
  const widthIndex = new Map(
    [...VIEWPORT_WIDTH_BUCKETS.map((b) => b.label), VIEWPORT_WIDTH_UNKNOWN].map(
      (label, i) => [label, i]
    )
  );
  const byViewportWidth: BreakdownRow[] = widthRows
    .map((r) => ({
      label: String(r.label ?? VIEWPORT_WIDTH_UNKNOWN),
      pageviews: Number(r.pageviews ?? 0),
    }))
    .sort(
      (a, b) =>
        (widthIndex.get(a.label) ?? widthIndex.size) -
        (widthIndex.get(b.label) ?? widthIndex.size)
    );

  if (totals.sessions === 0 && totals.pageviews === 0) dataQuality.push("tracking-off");
  // Visits with no timezone are bucketed in UTC — say so rather than mixing
  // two clocks silently.
  if (totals.sessions > 0 && timezoneCoverage < 100) dataQuality.push("timezone-unavailable");
  // Events collected before the collector recorded a profile have no
  // browser and no OS. An empty breakdown is not the same as "no Chrome",
  // and a partly-filled one is not the same as a full one.
  const unknownBrowser = browsers.get("Unknown")?.sessions ?? 0;
  if (unknownBrowser > 0) dataQuality.push("dimensions-unavailable");

  return {
    kind: "audience",
    companyId,
    rangeDays,
    totals,
    breakdowns: {
      device: toRows(devices),
      browser: toRows(browsers),
      os: toRows(oses),
      hour: [...hours.entries()]
        .map(([label, v]) => ({ label, sessions: v.sessions, pageviews: v.pageviews }))
        .sort((a, b) => String(a.label).localeCompare(String(b.label))),
      viewportWidth: byViewportWidth,
    },
    timezoneCoverage,
    freshness: await reportFreshness(false, dataQuality),
  };
}
