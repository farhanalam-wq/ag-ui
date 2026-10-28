import { Elysia, t } from "elysia";
import {
  getVisitorLeadDetail,
  getVisitorTranscriptBundle,
  LEAD_STATUS_TRANSITIONS,
  listVisitorConversations,
  listVisitorLeads,
  updateVisitorLeadStatus,
} from "@ag-ui/database";
import { requireCompany, requireUser } from "../auth/plugin";
import { resolveOwnedConversation, resolveOwnedLead } from "@ag-ui/database";

/**
 * Visitors surface (spec §9.1 conversations, §9.2 leads). Owner-scoped via
 * the global auth plugin; `requireCompany` returns the owned company or 404s.
 * Detail routes are derived (row -> company -> owner), mirroring chat.ts.
 */

const PAGE_QUERY = {
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 200 })),
  offset: t.Optional(t.Numeric({ minimum: 0 })),
};

/** ISO date/datetime -> Date. `null` means present but unparseable. */
function parseDateQuery(raw: string | undefined): Date | undefined | null {
  if (raw === undefined || raw.trim() === "") return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

const LEAD_STATUS_VALUES = Object.keys(LEAD_STATUS_TRANSITIONS);

export const visitorsRoutes = new Elysia({ prefix: "/api/visitors" })
  .get(
    "/conversations",
    async (ctx) => {
      const { query, set } = ctx;
      const company = await requireCompany(ctx, "query");
      const since = parseDateQuery(query.since);
      const until = parseDateQuery(query.until);
      if (since === null || until === null) {
        set.status = 422;
        return { error: "since/until must be an ISO date or datetime" };
      }
      const rating = query.rating === 1 || query.rating === -1 ? query.rating : undefined;

      const { rows, total } = await listVisitorConversations({
        companyId: company.id,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
        since,
        until,
        path: query.path?.trim() || undefined,
        search: query.search?.trim().slice(0, 200) || undefined,
        rating,
      });
      return { total, conversations: rows };
    },
    {
      query: t.Object({
        companyId: t.String({ format: "uuid" }),
        ...PAGE_QUERY,
        since: t.Optional(t.String()),
        until: t.Optional(t.String()),
        path: t.Optional(t.String({ maxLength: 1024 })),
        search: t.Optional(t.String({ maxLength: 200 })),
        rating: t.Optional(t.Union([t.Literal(1), t.Literal(-1)])),
      }),
      detail: {
        summary: "List visitor conversations",
        description:
          "Paged conversation index with message counts, rating aggregates and visit context (device/browser/os) resolved from the cookieless session hash.",
      },
    }
  )
  .get(
    "/conversations/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const user = requireUser(ctx);

      // Derived policy: conversation -> company -> owner (chat.ts pattern).
      const owned = await resolveOwnedConversation(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { error: "Conversation not found" };
      }

      const bundle = await getVisitorTranscriptBundle(owned.company.id, params.id);
      if (!bundle) {
        set.status = 404;
        return { error: "Conversation not found" };
      }
      return { company: { id: owned.company.id, name: owned.company.name }, ...bundle };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Get a conversation transcript",
        description:
          "Ordered transcript with evidence and rating per message, plus the visit context resolved through the session hash.",
      },
    }
  )
  .get(
    "/leads",
    async (ctx) => {
      const { query, set } = ctx;
      const company = await requireCompany(ctx, "query");
      const since = parseDateQuery(query.since);
      const until = parseDateQuery(query.until);
      if (since === null || until === null) {
        set.status = 422;
        return { error: "since/until must be an ISO date or datetime" };
      }

      const { rows, total } = await listVisitorLeads({
        companyId: company.id,
        limit: query.limit ?? 50,
        offset: query.offset ?? 0,
        status: query.status?.trim().toUpperCase() || undefined,
        search: query.search?.trim().slice(0, 200) || undefined,
        tag: query.tag?.trim().slice(0, 80) || undefined,
        since,
        until,
      });
      return { total, leads: rows };
    },
    {
      query: t.Object({
        companyId: t.String({ format: "uuid" }),
        ...PAGE_QUERY,
        status: t.Optional(t.Enum(Object.fromEntries(LEAD_STATUS_VALUES.map((s) => [s, s])))),
        search: t.Optional(t.String({ maxLength: 200 })),
        tag: t.Optional(t.String({ maxLength: 80 })),
        since: t.Optional(t.String()),
        until: t.Optional(t.String()),
      }),
      detail: {
        summary: "List visitor leads",
        description:
          "Paged lead docket: contact details, BANT cues, tags, confidence and the pipeline status, each linked to its originating conversation.",
      },
    }
  )
  .patch(
    "/leads/:id",
    async (ctx) => {
      const { params, body, set } = ctx;
      const user = requireUser(ctx);

      // Derived policy: lead -> company -> owner.
      const owned = await resolveOwnedLead(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { error: "Lead not found" };
      }

      const result = await updateVisitorLeadStatus({
        companyId: owned.company.id,
        leadId: params.id,
        status: body.status,
      });
      if (result.kind === "not-found") {
        set.status = 404;
        return { error: "Lead not found" };
      }
      // Illegal ladder moves are a validation error, not a 404: the row says
      // so, the caller has every id right.
      if (result.kind === "invalid") {
        set.status = 422;
        return { error: result.message };
      }
      return { lead: result.lead };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        // Statuses are forced uppercase at the database; the enum is the
        // canonical writer surface.
        status: t.Union(
          LEAD_STATUS_VALUES.map((s) => t.Literal(s as (typeof LEAD_STATUS_VALUES)[number]))
        ),
      }),
      detail: {
        summary: "Update a lead status",
        description:
          "Moves one lead through the docket pipeline (NEW → QUALIFIED/CONTACTED/DISMISSED, QUALIFIED → CONTACTED/DISMISSED, CONTACTED → DISMISSED; DISMISSED is terminal). Illegal transitions are 422.",
      },
    }
  )
  .get(
    "/leads/:id",
    async (ctx) => {
      const { params, set } = ctx;
      const user = requireUser(ctx);

      const owned = await resolveOwnedLead(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { error: "Lead not found" };
      }

      const detail = await getVisitorLeadDetail(owned.company.id, params.id);
      if (!detail) {
        set.status = 404;
        return { error: "Lead not found" };
      }
      return { company: { id: owned.company.id, name: owned.company.name }, lead: detail };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Get a lead detail",
        description: "Full lead with the owning conversation resolved for the drawer deep link.",
      },
    }
  );
