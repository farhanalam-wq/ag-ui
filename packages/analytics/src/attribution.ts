/**
 * packages/analytics/src/attribution.ts
 *
 * ORM-first attribution. Channel derivation is composed with the drizzle
 * query builder ($with CTEs over the pageViews table); `sql` fragments
 * are used ONLY where Postgres has no builder equivalent (UTM regex
 * extraction, CASE taxonomy, FILTER aggregates, array_agg entry).
 * SOCIAL_HOSTS stays the single source of truth for JS + SQL.
 *
 * The CTEs here are on the *visit* grain: one row per event, carrying the
 * visit id, so a report that counts "Sessions" against a dimension counts
 * the same unit the rollup counts. There is deliberately no page-load-grain
 * variant — a "Sessions" number built on one would disagree with every
 * other surface in the module.
 */

import { db, sql, type SQL, type SQLWrapper } from "@ag-ui/database";
import { SOCIAL_HOSTS } from "./registry";
import { sessionIslands } from "./sessions";

/** `host = 'x' OR host LIKE '%.x' ...` — values bound as params. */
function socialHostCondition(host: SQLWrapper): SQL {
  const parts = SOCIAL_HOSTS.flatMap((h) => [sql`${host} = ${h}`, sql`${host} LIKE ${`%.${h}`}`]);
  return sql`(${sql.join(parts, sql` OR `)})`;
}

const uSrcFor = (url: SQLWrapper) => sql<string>`COALESCE(substring(${url} from '[?&]utm_source=([^&#]*)'), '')`;
const uMedFor = (url: SQLWrapper) => sql<string>`lower(COALESCE(substring(${url} from '[?&]utm_medium=([^&#]*)'), ''))`;
const uCampFor = (url: SQLWrapper) => sql<string>`COALESCE(substring(${url} from '[?&]utm_campaign=([^&#]*)'), '')`;
const rHostFor = (ref: SQLWrapper) => sql<string>`lower(regexp_replace(split_part(${ref}, '/', 3), '^www\\.', ''))`;

function channelCase(u: SQLWrapper, m: SQLWrapper, c: SQLWrapper, r: SQLWrapper): SQL<string> {
  return sql<string>`CASE
    WHEN ${m} IN ('email', 'newsletter', 'mail') THEN 'Email'
    WHEN ${m} IN ('social', 'organic-social') OR ${socialHostCondition(r)} THEN 'Organic Social'
    WHEN ${c} <> '' THEN 'Campaign'
    WHEN ${r} <> '' THEN 'Referral'
    WHEN ${u} <> '' THEN 'Campaign'
    ELSE 'Direct' END`;
}

/**
 * The channel taxonomy on the visit grain.
 *
 * `visitKey` identifies a visit (one island of activity) the same way the
 * rollup does. Every "Sessions" number in this module counts these, so a
 * channel breakdown and a rollup total are the same unit.
 *
 * Compose with `db.with(v1, v2).select(...).from(v2)`.
 */
export function visitAttrCTEs(companyId: string, from: Date, to: Date) {
  const isl = sessionIslands(companyId, from, to);
  const v1 = db.$with("vattr1").as(
    db
      .select({
        visitKey: isl.visitKey,
        path: isl.path,
        viewport: isl.viewport,
        type: isl.type,
        createdAt: isl.createdAt,
        uSrc: uSrcFor(isl.url).as("u_src"),
        uMed: uMedFor(isl.url).as("u_med"),
        uCamp: uCampFor(isl.url).as("u_camp"),
        rHost: rHostFor(isl.referrer).as("rhost"),
        channel: channelCase(
          uSrcFor(isl.url),
          uMedFor(isl.url),
          uCampFor(isl.url),
          rHostFor(isl.referrer)
        ).as("channel"),
      })
      .from(isl)
  );
  const v2 = db.$with("vattr2").as(
    db
      .select({
        visitKey: v1.visitKey,
        path: v1.path,
        viewport: v1.viewport,
        type: v1.type,
        createdAt: v1.createdAt,
        channel: v1.channel,
        source: sql<string>`COALESCE(NULLIF(${v1.uSrc}, ''), NULLIF(${v1.rHost}, ''), '(direct)')`.as("source"),
        medium: sql<string>`CASE
          WHEN ${v1.channel} = 'Direct' THEN '(none)'
          WHEN ${v1.uMed} <> '' THEN ${v1.uMed}
          WHEN ${v1.channel} = 'Organic Social' THEN 'organic'
          WHEN ${v1.channel} = 'Referral' THEN 'referral'
          ELSE '(none)' END`.as("medium"),
        campaign: sql<string>`COALESCE(NULLIF(${v1.uCamp}, ''), '(not set)')`.as("campaign"),
      })
      .from(v1)
  );
  return { v1, v2 };
}

/**
 * Desktop vs Mobile from a "WxH" viewport column.
 *
 * The rule itself lives in `dimensions.ts`, next to the other dimension
 * rules and the raw-SQL copy the rollup uses. This re-export keeps the
 * existing call sites working.
 */
export { deviceCaseSql as deviceFragment } from "./dimensions";
