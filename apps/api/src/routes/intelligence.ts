import { Elysia, t } from "elysia";
import {
  db,
  retrieveCompanyContext,
  signalDrafts,
  eq,
  and,
  desc,
  checkAnalyticsReadLimit,
} from "@ag-ui/database";
import { buildFaqJsonLd, generateFaqDraft, logger } from "@ag-ui/shared";
import { requireCompany } from "../auth/plugin";
import { getClientIp } from "./embed";

/**
 * Intelligence → Signals drafts.
 *
 * A draft is generated **on demand** — a human on the radar decides a
 * blindspot cluster is worth closing, and the generation call grounds the FAQ
 * in what that company's knowledge base retrieves for the cluster question.
 * Nothing here publishes: status is the approval gate, and the CMS push
 * connectors are Phase 2. Refusals are answers, not errors to paper over:
 * no retrieved source → "no-source", sources retrieved but not sufficient →
 * "insufficient-source". A cluster with no sources cannot be drafted from,
 * because a draft from nothing would be the exact fabrication this module
 * exists to close.
 *
 * (company_id, cluster_key) is unique: regenerating returns the existing row
 * with `existing: true` instead of stacking near-duplicates for review.
 *
 * Status contract: bad requests answer 422 with `{ error }`, same as the
 * analytics routes (F-04/F-05).
 */

/** The status transitions the approval gate allows. */
const DRAFT_STATUSES = ["DRAFT", "APPROVED", "DISMISSED"] as const;
type DraftStatus = (typeof DRAFT_STATUSES)[number];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface GuardContext {
  query: Record<string, string | undefined>;
  set: { status?: number | string; headers: Record<string, string> };
  request: Request;
}

export const intelligenceRoutes = new Elysia({ prefix: "/api/analytics/intel" })
  .onBeforeHandle(async (ctx) => {
    // Same per-tenant budget as the read reports, applied to the generate
    // call too: an LLM round-trip is the most expensive thing this module
    // does, and the read budget is the only per-tenant throttle that exists.
    // GETs carry companyId in the query; POST/PATCH in the body.
    const { query, set, request } = ctx as unknown as GuardContext;
    const bodyCompany =
      (ctx as unknown as { body?: Record<string, unknown> }).body?.companyId;
    const companyId =
      typeof bodyCompany === "string" && bodyCompany
        ? bodyCompany
        : query?.companyId;
    if (typeof companyId === "string" && !UUID_RE.test(companyId)) {
      set.status = 422;
      return { error: "companyId must be a UUID" };
    }
    const limit = await checkAnalyticsReadLimit(getClientIp(request), companyId);
    if (!limit.allowed) {
      set.status = 429;
      set.headers["retry-after"] = String(limit.retryAfterSec);
      return { error: "Analytics rate limit exceeded", retryAfterSec: limit.retryAfterSec };
    }
  })
  .get(
    "/drafts",
    async (ctx) => {
      const company = await requireCompany(ctx, "query");
      const rows = await db
        .select()
        .from(signalDrafts)
        .where(eq(signalDrafts.companyId, company.id))
        .orderBy(desc(signalDrafts.updatedAt))
        .limit(100);
      return { drafts: rows.map(serializeDraft) };
    },
    {
      query: t.Object({ companyId: t.String() }),
      detail: {
        summary: "List Signals drafts",
        description:
          "All FAQ/JSON-LD drafts for the company, newest change first. Status is the approval gate.",
      },
    }
  )
  .post(
    "/drafts",
    async (ctx) => {
      const { body, set } = ctx;
      const company = await requireCompany(ctx, "body");
      const cleanKey = body.clusterKey.trim().slice(0, 80);
      const cleanQuestion = body.question.trim().slice(0, 500);
      if (!cleanKey || !cleanQuestion) {
        set.status = 422;
        return { error: "clusterKey and question are required" };
      }

      // Idempotent by cluster: a draft that already exists answers for its
      // cluster; regeneration is a deliberate status change, not a re-run.
      const [existing] = await db
        .select()
        .from(signalDrafts)
        .where(and(eq(signalDrafts.companyId, company.id), eq(signalDrafts.clusterKey, cleanKey)))
        .limit(1);
      if (existing) return { existing: true, draft: serializeDraft(existing) };

      // Ground the draft in the company's own knowledge base.
      let context;
      try {
        context = await retrieveCompanyContext(company.id, cleanQuestion);
      } catch (err: any) {
        logger.error(`[INTEL] draft retrieval failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 502;
        return { error: "Retrieval unavailable - try again shortly" };
      }
      if (context.chunks.length === 0) {
        set.status = 422;
        return {
          error: "no-source",
          message:
            "The knowledge base returned nothing for this question. A draft from nothing would be invention — index the material first (Knowledge → Sources).",
        };
      }

      let result;
      try {
        result = await generateFaqDraft({
          companyName: company.name,
          domain: company.domain,
          question: cleanQuestion,
          chunks: context.chunks,
          facts: context.facts,
        });
      } catch (err: any) {
        logger.error(`[INTEL] draft generation failed for ${company.id}: ${err?.message ?? err}`);
        set.status = 502;
        return { error: "Draft generation failed - try again shortly" };
      }
      if (!result.answerable) {
        set.status = 422;
        return {
          error: "insufficient-source",
          message:
            "The indexed pages retrieved for this question do not answer it. Close the blindspot by adding the missing material, then draft again.",
        };
      }

      const [inserted] = await db
        .insert(signalDrafts)
        .values({
          companyId: company.id,
          clusterKey: cleanKey,
          question: result.draft.question,
          status: "DRAFT",
          faq: {
            question: result.draft.question,
            answer: result.draft.answer,
            sources: result.draft.sources,
          },
          jsonld: buildFaqJsonLd(result.draft.question, result.draft.answer),
          model: result.model,
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return { existing: false, draft: serializeDraft(inserted) };
      // Raced with another generate for the same cluster; the winner stands.
      const [raced] = await db
        .select()
        .from(signalDrafts)
        .where(and(eq(signalDrafts.companyId, company.id), eq(signalDrafts.clusterKey, cleanKey)))
        .limit(1);
      if (!raced) {
        set.status = 502;
        return { error: "Draft generation failed - try again shortly" };
      }
      return { existing: true, draft: serializeDraft(raced) };
    },
    {
      body: t.Object({ companyId: t.String(), clusterKey: t.String(), question: t.String() }),
      detail: {
        summary: "Generate a Signals draft",
        description:
          "Generates an FAQ + JSON-LD patch for one blindspot cluster, grounded in the company's knowledge base. Refuses when no source can answer the question.",
      },
    }
  )
  .patch(
    "/drafts/:id",
    async (ctx) => {
      const { body, params, set } = ctx;
      const company = await requireCompany(ctx, "body");
      if (!UUID_RE.test(params.id)) {
        set.status = 422;
        return { error: "id must be a UUID" };
      }
      if (!DRAFT_STATUSES.includes(body.status as DraftStatus)) {
        set.status = 422;
        return { error: `status must be one of ${DRAFT_STATUSES.join(", ")}` };
      }
      const [updated] = await db
        .update(signalDrafts)
        .set({ status: body.status, updatedAt: new Date() })
        .where(and(eq(signalDrafts.id, params.id), eq(signalDrafts.companyId, company.id)))
        .returning();
      if (!updated) {
        set.status = 404;
        return { error: "Draft not found" };
      }
      return { draft: serializeDraft(updated) };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ companyId: t.String(), status: t.String() }),
      detail: {
        summary: "Set a draft's approval status",
        description:
          "APPROVED, DISMISSED, or back to DRAFT. No publish path exists — approval is a state, not an action on the website.",
      },
    }
  );

type DraftRow = typeof signalDrafts.$inferSelect;

function serializeDraft(row: DraftRow) {
  return {
    id: row.id,
    companyId: row.companyId,
    clusterKey: row.clusterKey,
    question: row.question,
    status: row.status as DraftStatus,
    faq: (row.faq ?? null) as {
      question: string;
      answer: string;
      sources: Array<{ title: string; url: string }>;
    } | null,
    jsonld: row.jsonld ?? null,
    model: row.model ?? null,
    createdAt: row.createdAt?.toISOString() ?? null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}
