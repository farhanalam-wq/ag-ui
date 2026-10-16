/**
 * packages/analytics/src/attribution.ts
 *
 * ORM-first attribution. Channel derivation is composed with the drizzle
 * query builder ($with CTEs over the pageViews table); `sql` fragments
 * are used ONLY where Postgres has no builder equivalent (UTM regex
 * extraction, CASE taxonomy, FILTER aggregates, array_agg entry).
 * SOCIAL_HOSTS stays the single source of truth for JS + SQL.
 */

import { db, pageViews, sql, eq, and, gte, lt, type SQL, type SQLWrapper } from "@ag-ui/database";
import { SOCIAL_HOSTS } from "./registry";

/** `host = 'x' OR host LIKE '%.x' ...` — values bound as params. */
function socialHostCondition(host: SQLWrapper): SQL {
  const parts = SOCIAL_HOSTS.flatMap((h) => [sql`${host} = ${h}`, sql`${host} LIKE ${`%.${h}`}`]);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

const uSrc = sql<string>`COALESCE(substring(${pageViews.url} from '[?&]utm_source=([^&#]*)'), '')`;
const uMed = sql<string>`lower(COALESCE(substring(${pageViews.url} from '[?&]utm_medium=([^&#]*)'), ''))`;
const uCamp = sql<string>`COALESCE(substring(${pageViews.url} from '[?&]utm_campaign=([^&#]*)'), '')`;
const rHost = sql<string>`lower(regexp_replace(split_part(${pageViews.referrer}, '/', 3), '^www\\.', ''))`;

function channelCase(u: SQLWrapper, m: SQLWrapper, c: SQLWrapper, r: SQLWrapper): SQL<string> {
  return sql<string>`CASE
    WHEN ${m} IN ('email', 'newsletter', 'mail') THEN 'Email'
    WHEN ${m} IN ('social', 'organic-social') OR ${socialHostCondition(r)} THEN 'Organic Social'
    WHEN ${c} <> '' THEN 'Campaign'
    WHEN ${r} <> '' THEN 'Referral'
    WHEN ${u} <> '' THEN 'Campaign'
    ELSE 'Direct' END`;
}

function windowWhere(companyId: string, from: Date, to: Date) {
  return and(
    eq(pageViews.companyId, companyId),
    gte(pageViews.createdAt, from),
    lt(pageViews.createdAt, to),
    eq(pageViews.isBot, false)
  );
}

/**
 * Shared attr CTEs over a raw window. a2 exposes sessionHash, path,
 * viewport, type, channel, source, medium, campaign. Compose with
 * `db.with(a1, a2).select(...).from(a2)`.
 */
export function attrCTEs(companyId: string, from: Date, to: Date) {
  const ev = db
    .select({
      sessionHash: pageViews.sessionHash,
      path: pageViews.path,
      viewport: pageViews.viewport,
      type: pageViews.type,
      uSrc: uSrc.as("u_src"),
      uMed: uMed.as("u_med"),
      uCamp: uCamp.as("u_camp"),
      rHost: rHost.as("rhost"),
    })
    .from(pageViews)
    .where(windowWhere(companyId, from, to))
    .as("ev");
  const a1 = db.$with("attr1").as(
    db
      .select({
        sessionHash: ev.sessionHash,
        path: ev.path,
        viewport: ev.viewport,
        type: ev.type,
        uSrc: ev.uSrc,
        uMed: ev.uMed,
        uCamp: ev.uCamp,
        rHost: ev.rHost,
        channel: channelCase(ev.uSrc, ev.uMed, ev.uCamp, ev.rHost).as("channel"),
      })
      .from(ev)
  );
  const a2 = db.$with("attr2").as(
    db
      .select({
        sessionHash: a1.sessionHash,
        path: a1.path,
        viewport: a1.viewport,
        type: a1.type,
        channel: a1.channel,
        source: sql<string>`COALESCE(NULLIF(${a1.uSrc}, ''), NULLIF(${a1.rHost}, ''), '(direct)')`.as("source"),
        medium: sql<string>`CASE
          WHEN ${a1.channel} = 'Direct' THEN '(none)'
          WHEN ${a1.uMed} <> '' THEN ${a1.uMed}
          WHEN ${a1.channel} = 'Organic Social' THEN 'organic'
          WHEN ${a1.channel} = 'Referral' THEN 'referral'
          ELSE '(none)' END`.as("medium"),
        campaign: sql<string>`COALESCE(NULLIF(${a1.uCamp}, ''), '(not set)')`.as("campaign"),
      })
      .from(a1)
  );
  return { a1, a2 };
}

/**
 * Window predicate builder for services that query pageViews directly.
 */
export function pageViewsWindow(companyId: string, from: Date, to: Date) {
  return windowWhere(companyId, from, to);
}

/** Desktop vs Mobile from a "WxH" viewport column. */
export function deviceFragment(vp: SQLWrapper): SQL<string> {
  return sql<string>`CASE
    WHEN ${vp} ~ '^[0-9]{1,4}x' AND substring(${vp} from '^([0-9]{1,4})x')::int < 768
    THEN 'Mobile' ELSE 'Desktop' END`;
}
