import { Elysia, t } from "elysia";
import {
  db,
  brands,
  brandStylesheets,
  companySnapshots,
  eq,
  and,
  desc,
} from "@ag-ui/database";
import { brandQueue } from "@ag-ui/queues";
import { logger } from "@ag-ui/shared";
import { requireCompany } from "../auth/plugin";

export const brandRoutes = new Elysia({ prefix: "/api/brand" })
  // Drizzle returns camelCase (designMd, screenshotUrl, createdAt); the API
  // contract mirrors it 1:1 so the web client never guesses key casing.
  .get(
    "/:companyId/latest",
    async (ctx) => {
      const { set } = ctx;
      const company = await requireCompany(ctx);

      const [stylesheet] = await db
        .select()
        .from(brandStylesheets)
        .where(eq(brandStylesheets.companyId, company.id))
        .orderBy(desc(brandStylesheets.createdAt))
        .limit(1);

      if (!stylesheet) {
        set.status = 404;
        return { error: "No brand stylesheet found for company" };
      }

      const [brand] = await db
        .select()
        .from(brands)
        .where(eq(brands.companyId, company.id))
        .limit(1);

      return { stylesheet, brand: brand ?? null };
    },
    {
      params: t.Object({
        companyId: t.String(),
      }),
      detail: {
        summary: "Get latest brand stylesheet",
        description: "Returns the most recent brand stylesheet row plus the current brand tokens for a company.",
      },
    }
  )

  .get(
    "/:companyId/history",
    async (ctx) => {
      const company = await requireCompany(ctx);
      const rows = await db
        .select()
        .from(brandStylesheets)
        .where(eq(brandStylesheets.companyId, company.id))
        .orderBy(desc(brandStylesheets.createdAt))
        .limit(20);

      // `items` is the contract the web client reads; `stylesheets` kept for compat.
      return { items: rows, stylesheets: rows };
    },
    {
      params: t.Object({
        companyId: t.String(),
      }),
      detail: {
        summary: "List brand stylesheet history",
        description: "Returns the last 20 brand stylesheet extractions for a company, newest first.",
      },
    }
  )

  .post(
    "/retry",
    async (ctx) => {
      const { body, set } = ctx;
      // Body policy: the guard resolved and ownership-checked body.companyId.
      const company = await requireCompany(ctx, "body");

      // Origin is optional: fall back to the company's stored URL so the
      // Appearance page retry button works without knowing it.
      const origin = body.origin ?? company.url;
      if (!origin) {
        set.status = 400;
        return { error: "origin is required (no stored company URL found)" };
      }

      // A caller-supplied snapshot id must belong to this company; otherwise a
      // brand job could stamp a stylesheet against another tenant's snapshot.
      let snapshotId = body.snapshotId ?? null;
      if (snapshotId) {
        const [ownedSnapshot] = await db
          .select({ id: companySnapshots.id })
          .from(companySnapshots)
          .where(
            and(
              eq(companySnapshots.id, snapshotId),
              eq(companySnapshots.companyId, company.id)
            )
          )
          .limit(1);
        if (!ownedSnapshot) {
          set.status = 404;
          return { error: "Snapshot not found" };
        }
      } else {
        // Stamp the active snapshot when the caller didn't name one, so every
        // stylesheet row knows which knowledge version it belongs to.
        try {
          const [latest] = await db
            .select({ id: companySnapshots.id })
            .from(companySnapshots)
            .where(eq(companySnapshots.companyId, company.id))
            .orderBy(desc(companySnapshots.version))
            .limit(1);
          snapshotId = latest?.id ?? null;
        } catch {
          snapshotId = null;
        }
      }

      const job = await brandQueue.add(
        "extract",
        { companyId: company.id, snapshotId, origin },
        { removeOnComplete: true }
      );
      logger.info(`[API:BRAND] retry queued for company ${company.id} (job ${job.id})`);
      return { success: true, jobId: job.id };
    },
    {
      body: t.Object({
        companyId: t.String(),
        snapshotId: t.Optional(t.Union([t.String(), t.Null()])),
        origin: t.Optional(t.String()),
      }),
      detail: {
        summary: "Retry brand extraction",
        description: "Enqueues a new dembrandt brand extraction job for the given company origin.",
      },
    }
  );
