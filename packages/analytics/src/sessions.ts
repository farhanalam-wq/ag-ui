/**
 * packages/analytics/src/sessions.ts
 *
 * One definition per word.
 *
 * "Session", "engaged session", "bounce" and "pages per session" were each
 * computed in two or three places with different rules, so the same company
 * and the same range rendered two different "Sessions" numbers — one visit
 * counted as one session on the Website page and as two on the Engagement
 * page (docs/analytics-rebuild.md §3.7).
 *
 * This module is the single home for:
 *
 *   - the inactivity gap that ends a visit,
 *   - what makes a visit "engaged",
 *   - what makes a visit a "bounce",
 *   - pages per visit.
 *
 * The SQL fragments are what the rollup executes; the pure predicates are the
 * documented mirror the tests pin. `sessions.test.ts` asserts the two agree.
 *
 * Two unit vocabularies exist and both are named here on purpose:
 *
 *   - a **visit** is one island of activity: a run of events where no gap
 *     between consecutive events reaches SESSION_GAP_MINUTES. This is the
 *     unit every "Sessions" figure in the product counts.
 *   - a **tab-session** is one distinct `session_hash`: one page load. It is
 *     an implementation detail of the tracker and is never labelled
 *     "sessions" in the UI.
 */

import { db, pageViews, sql, eq, and, gte, lt, type SQL, type SQLWrapper } from "@ag-ui/database";

/** A visit ends after this much inactivity. */
export const SESSION_GAP_MINUTES = 30;

/** A visit with this many pageviews is engaged, whatever else happened. */
export const ENGAGED_MIN_PAGEVIEWS = 2;

/** Any of these events means the visitor did something, not just arrived. */
export const ENGAGEMENT_EVENT_TYPES = [
  "chat_open",
  "chat_message",
  "conversion",
  "scroll",
  "download",
  "click",
] as const;

export type EngagementEventType = (typeof ENGAGEMENT_EVENT_TYPES)[number];

/** `'chat_open', 'chat_message', ...` — one list, used by every query. */
export const ENGAGEMENT_TYPES_SQL = ENGAGEMENT_EVENT_TYPES.map((t) => `'${t}'`).join(", ");

/** Active seconds granted per heartbeat, and the per-visit cap on them. */
export const HEARTBEAT_SECONDS = 15;
export const MAX_ACTIVE_SECONDS_PER_VISIT = 1800;

/**
 * The rule that starts a new visit: no predecessor, or a gap wider than
 * SESSION_GAP_MINUTES. Shared by the rollup (raw SQL) and the report queries
 * (Drizzle), so the two can never drift apart.
 */
export function islandStartCase(createdAt: SQLWrapper, prevAt: SQLWrapper): SQL<number> {
  return sql<number>`CASE WHEN ${prevAt} IS NULL OR ${createdAt} - ${prevAt} > ${sql.raw(
    `interval '${SESSION_GAP_MINUTES} minutes'`
  )} THEN 1 ELSE 0 END`;
}

/** `BOOL_OR(type IN (...))` — did this visit interact, not just land? */
export function engagedInteractionSql(typeColumn: SQLWrapper): SQL<boolean> {
  return sql<boolean>`BOOL_OR(${typeColumn} IN (${sql.raw(ENGAGEMENT_TYPES_SQL)}))`;
}

/** The engagement rule: 2+ pageviews OR any interaction event. */
export function engagedSessionSql(pageviews: SQLWrapper, interacted: SQLWrapper): SQL<boolean> {
  return sql<boolean>`(${pageviews} >= ${ENGAGED_MIN_PAGEVIEWS} OR ${interacted})`;
}

export interface VisitEngagement {
  pageviews: number;
  interacted: boolean;
}

/** A visit is engaged when it saw 2+ pages or any interaction event. */
export function isEngagedSession(visit: VisitEngagement): boolean {
  return visit.pageviews >= ENGAGED_MIN_PAGEVIEWS || visit.interacted;
}

/** A visit is a bounce when it is not engaged. */
export function isBounceSession(visit: VisitEngagement): boolean {
  return !isEngagedSession(visit);
}

/** Share of visits that were engaged, as a percentage. */
export function engagementRate(engaged: number, visits: number): number {
  return visits > 0 ? Math.round((engaged / visits) * 1000) / 10 : 0;
}

/** Share of visits that bounced, as a percentage. */
export function bounceRate(engaged: number, visits: number): number {
  return visits > 0 ? Math.round(((visits - engaged) / visits) * 1000) / 10 : 0;
}

/** Average pageviews per visit. */
export function pagesPerSession(pageviews: number, visits: number): number {
  return visits > 0 ? Math.round((pageviews / visits) * 10) / 10 : 0;
}

/**
 * Distinct visits in a window, keyed by visit rather than by page load.
 *
 * `session_hash` alone is a page load, not a visit: one visitor who reads
 * for an hour is one visit but many page loads. The visit id is the pair
 * (session hash, island number) where the island number comes from
 * `islandStartCase`.
 */
export function visitKeySql(sessionHash: SQLWrapper, island: SQLWrapper): SQL<string> {
  return sql<string>`${sessionHash} || '#' || ${island}`;
}

/**
 * The event stream for a window, with the visit id attached.
 *
 * A `session_hash` is a page load, not a visit. This applies the same
 * island rule the rollup uses — one gap of inactivity ends a visit — so a
 * report that needs a per-path, per-channel or per-device session count
 * counts visits, not page loads. Without it the same report shows a
 * different "Sessions" number than the rollup that owns the metric.
 *
 * The scan starts one gap before the window so the first event inside the
 * window is not mistaken for the start of a visit, which is exactly what
 * the rollup does when it buckets a day. Those lookback events are used
 * only to establish the island chain and are filtered out of the result,
 * so the rows returned are the window's events and nothing else.
 */
export function sessionIslands(companyId: string, from: Date, to: Date) {
  const lookback = new Date(from.getTime() - SESSION_GAP_MINUTES * 60_000);
  const ev = db
    .select({
      sessionHash: pageViews.sessionHash,
      createdAt: pageViews.createdAt,
      type: pageViews.type,
      path: pageViews.path,
      viewport: pageViews.viewport,
      url: pageViews.url,
      referrer: pageViews.referrer,
      value: pageViews.value,
      meta: pageViews.meta,
      prevAt: sql<Date | null>`LAG(${pageViews.createdAt}) OVER (PARTITION BY ${pageViews.sessionHash} ORDER BY ${pageViews.createdAt})`.as("prev_at"),
    })
    .from(pageViews)
    .where(
      and(
        eq(pageViews.companyId, companyId),
        gte(pageViews.createdAt, lookback),
        lt(pageViews.createdAt, to),
        eq(pageViews.isBot, false)
      )
    )
    .as("ev");

  const isl = db
    .select({
      sessionHash: ev.sessionHash,
      createdAt: ev.createdAt,
      type: ev.type,
      path: ev.path,
      viewport: ev.viewport,
      url: ev.url,
      referrer: ev.referrer,
      value: ev.value,
      meta: ev.meta,
      island: sql<number>`SUM(${islandStartCase(ev.createdAt, ev.prevAt)}) OVER (PARTITION BY ${ev.sessionHash} ORDER BY ${ev.createdAt})`.as("island"),
    })
    .from(ev)
    .as("isl");

  return db
    .select({
      sessionHash: isl.sessionHash,
      visitKey: sql<string>`${isl.sessionHash} || '#' || ${isl.island}`.as("visit_key"),
      createdAt: isl.createdAt,
      type: isl.type,
      path: isl.path,
      viewport: isl.viewport,
      url: isl.url,
      referrer: isl.referrer,
      value: isl.value,
      meta: isl.meta,
      island: isl.island,
    })
    .from(isl)
    .where(gte(isl.createdAt, from))
    .as("visits");
}
