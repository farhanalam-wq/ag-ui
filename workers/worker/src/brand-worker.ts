import { Worker } from "bullmq";
import { QUEUE_NAMES, redisConnection, type BrandJobData } from "@ag-ui/queues";
import { db, brands, brandStylesheets, eq, desc } from "@ag-ui/database";
import { validateSafeUrl } from "@ag-ui/crawler";
import { runDembrandt, mapDembrandtToTokens } from "@ag-ui/brand";
import { logger } from "@ag-ui/shared";

export const brandWorker = new Worker<BrandJobData>(
  QUEUE_NAMES.BRAND,
  async (job) => {
    const { companyId, snapshotId, origin } = job.data;
    logger.info(`[BRAND WORKER] Starting brand extraction for company ${companyId} (job ${job.id}, origin=${origin})`);

    // Fetch existing QUEUED row or create one, then move to EXTRACTING.
    let stylesheetId: string;
    const existing = await db
      .select()
      .from(brandStylesheets)
      .where(eq(brandStylesheets.companyId, companyId))
      .orderBy(desc(brandStylesheets.createdAt))
      .limit(1);
    const queued = existing.find(
      (r) => r.status === "QUEUED" && (snapshotId === null || r.snapshotId === snapshotId)
    );
    if (queued) {
      stylesheetId = queued.id;
      await db
        .update(brandStylesheets)
        .set({ status: "EXTRACTING", updatedAt: new Date() })
        .where(eq(brandStylesheets.id, queued.id));
    } else {
      const [row] = await db
        .insert(brandStylesheets)
        .values({ companyId, snapshotId, status: "EXTRACTING" })
        .returning();
      stylesheetId = row.id;
    }

    try {
      await validateSafeUrl(origin);
      const raw: any = await runDembrandt(origin, {
        noSandbox: process.env.DEMBRANDT_NO_SANDBOX !== "0",
      });

      await db
        .update(brandStylesheets)
        .set({
          raw,
          dtcg: raw?.dtcg ?? null,
          tailwind: typeof raw?.tailwind === "string" ? raw.tailwind : null,
          designMd: typeof raw?.designMd === "string" ? raw.designMd : null,
          wcag: raw?.wcag ?? null,
          screenshotUrl: typeof raw?.screenshotUrl === "string" ? raw.screenshotUrl : null,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(brandStylesheets.id, stylesheetId));

      const { logoUrl, tokens } = mapDembrandtToTokens(raw);
      const [existingBrand] = await db
        .select()
        .from(brands)
        .where(eq(brands.companyId, companyId))
        .limit(1);
      if (existingBrand) {
        await db
          .update(brands)
          .set({ logoUrl: logoUrl ?? existingBrand.logoUrl, tokens })
          .where(eq(brands.id, existingBrand.id));
      } else {
        await db.insert(brands).values({ companyId, logoUrl, tokens });
      }

      await db
        .update(brandStylesheets)
        .set({ status: "READY", updatedAt: new Date() })
        .where(eq(brandStylesheets.id, stylesheetId));

      logger.info(`[BRAND WORKER] Brand extraction READY for company ${companyId} (stylesheet ${stylesheetId})`);
      return { status: "READY", stylesheetId };
    } catch (err: any) {
      const message = String(err?.message ?? err).slice(0, 500);
      logger.error(`[BRAND WORKER] Job ${job.id} failed for company ${companyId}: ${message}`);
      await db
        .update(brandStylesheets)
        .set({ status: "FAILED", error: message, updatedAt: new Date() })
        .where(eq(brandStylesheets.id, stylesheetId));
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 1,
  }
);

brandWorker.on("completed", (job) => {
  logger.info(`[BRAND WORKER] Job ${job.id} completed successfully`);
});

brandWorker.on("failed", (job, err) => {
  logger.error(`[BRAND WORKER] Job ${job?.id} failed with error: ${err.message}`);
});

logger.info("Background brand worker listening on Redis queue: brand-queue");
