import { Elysia, t } from "elysia";
import { db, brands, brandStylesheets, eq, desc } from "@ag-ui/database";
import { brandQueue } from "@ag-ui/queues";
import { logger } from "@ag-ui/shared";

export const brandRoutes = new Elysia({ prefix: "/api/brand" })
  .get(
    "/:companyId/latest",
    async ({ params, set }) => {
      const [stylesheet] = await db
        .select()
        .from(brandStylesheets)
        .where(eq(brandStylesheets.companyId, params.companyId))
        .orderBy(desc(brandStylesheets.createdAt))
        .limit(1);

      if (!stylesheet) {
        set.status = 404;
        return { error: "No brand stylesheet found for company" };
      }

      const [brand] = await db
        .select()
        .from(brands)
        .where(eq(brands.companyId, params.companyId))
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
    async ({ params }) => {
      const rows = await db
        .select()
        .from(brandStylesheets)
        .where(eq(brandStylesheets.companyId, params.companyId))
        .orderBy(desc(brandStylesheets.createdAt))
        .limit(20);

      return { stylesheets: rows };
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
    async ({ body }) => {
      const { companyId, snapshotId, origin } = body;
      const job = await brandQueue.add(
        "extract",
        { companyId, snapshotId: snapshotId ?? null, origin },
        { removeOnComplete: true }
      );
      logger.info(`[API:BRAND] retry queued for company ${companyId} (job ${job.id})`);
      return { success: true, jobId: job.id };
    },
    {
      body: t.Object({
        companyId: t.String(),
        snapshotId: t.Optional(t.Union([t.String(), t.Null()])),
        origin: t.String(),
      }),
      detail: {
        summary: "Retry brand extraction",
        description: "Enqueues a new dembrandt brand extraction job for the given company origin.",
      },
    }
  );
