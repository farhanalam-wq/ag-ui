import { Elysia, t } from "elysia";
import {
  getVisitorTranscriptBundle,
  listVisitorConversations,
} from "@ag-ui/database";
import { requireCompany, requireUser } from "../auth/plugin";
import { resolveOwnedConversation } from "@ag-ui/database";

/**
 * Visitors — Conversations surface (spec §9.1). Owner-scoped via the global
 * auth plugin; `requireCompany` returns the owned company or 404s. Transcript
 * detail is a derived route (conversation -> company -> owner).
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
  );
