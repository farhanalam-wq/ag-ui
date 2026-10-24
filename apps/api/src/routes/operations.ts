import { Elysia, t } from "elysia";
import { listErrorEvents, listActivity } from "@ag-ui/database";
import { logger } from "@ag-ui/shared";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO date/datetime → Date. `null` means present but unparseable. */
function parseSince(raw: string | undefined): Date | undefined | null {
  if (raw === undefined || raw.trim() === "") return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ERROR_SOURCE = t.Union([
  t.Literal("api"),
  t.Literal("crawler"),
  t.Literal("worker"),
  t.Literal("embed"),
  t.Literal("retrieval"),
  t.Literal("chat"),
  t.Literal("voice"),
]);

const ERROR_LEVEL = t.Union([t.Literal("error"), t.Literal("warn")]);

/** Offset paging bounds shared by both reads. `t.Numeric` coerces query strings. */
const PAGE_QUERY = {
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
  offset: t.Optional(t.Numeric({ minimum: 0 })),
};

export const operationsRoutes = new Elysia({ prefix: "/api/operations" })
  // Auth (401) and company ownership (404) are enforced by the global auth
  // plugin from the route-policy manifest. The reads below are already scoped
  // by the verified `companyId`.
  .get(
    "/errors",
    async ({ query, set }) => {
      if (!UUID_RE.test(query.companyId)) {
        set.status = 422;
        return { error: "companyId must be a UUID" };
      }
      const since = parseSince(query.since);
      if (since === null) {
        set.status = 422;
        return { error: "since must be a valid ISO date" };
      }

      try {
        return await listErrorEvents({
          companyId: query.companyId,
          source: query.source,
          level: query.level,
          since,
          q: query.q,
          jobId: query.jobId,
          limit: query.limit,
          offset: query.offset,
        });
      } catch (err: any) {
        logger.error(`[OPERATIONS] errors read failed: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Errors unavailable" };
      }
    },
    {
      query: t.Object({
        companyId: t.String({ format: "uuid" }),
        source: t.Optional(ERROR_SOURCE),
        level: t.Optional(ERROR_LEVEL),
        // Parsed in the handler so date-only and full ISO datetime both work.
        since: t.Optional(t.String()),
        q: t.Optional(t.String({ maxLength: 200 })),
        jobId: t.Optional(t.String({ maxLength: 200 })),
        ...PAGE_QUERY,
      }),
      detail: {
        summary: "List captured errors",
        description:
          "Offset-paged error events for one company. `companyId` is required. Filters: source, level, since, q (message/route), jobId. Invalid companyId format is 422; an unknown UUID is an empty list.",
      },
    }
  )
  .get(
    "/activity",
    async ({ query, set }) => {
      if (!UUID_RE.test(query.companyId)) {
        set.status = 422;
        return { error: "companyId must be a UUID" };
      }
      const since = parseSince(query.since);
      if (since === null) {
        set.status = 422;
        return { error: "since must be a valid ISO date" };
      }

      try {
        return await listActivity({
          companyId: query.companyId,
          status: query.status,
          kind: query.kind,
          since,
          q: query.q,
          limit: query.limit,
          offset: query.offset,
        });
      } catch (err: any) {
        logger.error(`[OPERATIONS] activity read failed: ${err?.message ?? err}`);
        set.status = 500;
        return { error: "Activity unavailable" };
      }
    },
    {
      query: t.Object({
        companyId: t.String({ format: "uuid" }),
        status: t.Optional(t.String({ maxLength: 40 })),
        kind: t.Optional(t.Union([t.Literal("crawl_job"), t.Literal("snapshot")])),
        since: t.Optional(t.String()),
        q: t.Optional(t.String({ maxLength: 200 })),
        ...PAGE_QUERY,
      }),
      detail: {
        summary: "List derived activity",
        description:
          "Offset-paged activity trail for one company, derived from crawl_jobs + company_snapshots (newest first). `companyId` is required. Filters: status, kind, since, q (company name).",
      },
    }
  );
