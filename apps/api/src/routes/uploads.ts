import { Elysia, t } from "elysia";
import {
  db,
  sql,
  companies,
  companySnapshots,
  enrichmentBatches,
  batchFiles,
  checkEmbedRateLimit,
  eq,
  desc,
} from "@ag-ui/database";
import { enrichQueue } from "@ag-ui/queues";
import { extractUpload } from "@ag-ui/extract";
import { logger } from "@ag-ui/shared";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 20;
const PREVIEW_CHARS = 500;

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

async function getLatestSnapshot(companyId: string) {
  const [snap] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, companyId))
    .orderBy(desc(companySnapshots.version))
    .limit(1);
  return snap ?? null;
}

function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() || "file";
  return base.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 200) || "file";
}

export const uploadsRoutes = new Elysia({ prefix: "/api/companies/:id/uploads" })
  // 1. Upload files -> extract preview -> DRAFT batch (no knowledge touched)
  .post(
    "/",
    async ({ params, body, request, set }) => {
      const companyId = params.id;
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }

      // READY-major gate: never enrich a half-crawled company.
      const snapshot = await getLatestSnapshot(companyId);
      if (!snapshot || snapshot.status !== "READY") {
        set.status = 409;
        return { error: "Company indexing — try again shortly" };
      }

      const ip = getClientIp(request);
      const limit = await checkEmbedRateLimit(companyId, ip, "upload");
      if (!limit.allowed) {
        set.status = 429;
        set.headers["retry-after"] = String(limit.retryAfterSec);
        return { error: `Slow down — retry in ${limit.retryAfterSec}s` };
      }

      const incoming = Array.isArray(body.files) ? body.files : [body.files];
      if (incoming.length === 0 || incoming.length > MAX_FILES) {
        set.status = 400;
        return { error: `Upload between 1 and ${MAX_FILES} files per batch` };
      }

      let totalBytes = 0;
      const staged: { filename: string; mime?: string; buffer: Buffer; size: number }[] = [];
      for (const file of incoming) {
        const buffer = Buffer.from(await file.arrayBuffer());
        totalBytes += buffer.length;
        if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
          set.status = 413;
          return { error: `File "${file.name}" exceeds the 25MB per-file limit` };
        }
        staged.push({
          filename: sanitizeFilename(file.name || "file"),
          mime: file.type || undefined,
          buffer,
          size: buffer.length,
        });
      }
      if (totalBytes > MAX_BATCH_BYTES) {
        set.status = 413;
        return { error: "Batch exceeds the 100MB total limit" };
      }

      // Reserve the next minor version transactionally at creation: the
      // snapshot row lock serializes concurrent uploads, so each batch owns
      // a distinct v<major>.<minor> from DRAFT through READY (or FAILED).
      const [batch] = await db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM company_snapshots WHERE id = ${snapshot.id} FOR UPDATE`
        );
        const [row] = await tx
          .select({ minor: enrichmentBatches.minor })
          .from(enrichmentBatches)
          .where(eq(enrichmentBatches.snapshotId, snapshot.id))
          .orderBy(desc(enrichmentBatches.minor))
          .limit(1);
        return tx
          .insert(enrichmentBatches)
          .values({
            companyId,
            snapshotId: snapshot.id,
            minor: (row?.minor ?? 0) + 1,
            fileCount: staged.length,
          })
          .returning();
      });

      const manifest: Record<string, unknown>[] = [];
      for (const file of staged) {
        const entry: Record<string, unknown> = {
          filename: file.filename,
          mime: file.mime,
          size: file.size,
        };
        try {
          const result = await extractUpload({
            filename: file.filename,
            mime: file.mime,
            buffer: file.buffer,
          });
          if (result.kind === "url-list") {
            entry.urls = result.urls;
            entry.preview = `${result.urls.length} URLs for crawling`;
          } else {
            entry.title = result.document.title;
            entry.wordCount = result.document.wordCount;
            entry.preview = result.document.text.slice(0, PREVIEW_CHARS);
          }
        } catch (err: unknown) {
          entry.error = err instanceof Error ? err.message : "Extraction failed";
        }
        manifest.push(entry);
        await db.insert(batchFiles).values({
          batchId: batch.id,
          filename: file.filename,
          mime: file.mime,
          size: file.size,
          data: file.buffer.toString("base64"),
        });
      }

      const [updated] = await db
        .update(enrichmentBatches)
        .set({ manifest, updatedAt: new Date() })
        .where(eq(enrichmentBatches.id, batch.id))
        .returning();

      logger.info(`[UPLOADS] DRAFT batch ${batch.id} for company ${companyId} (${staged.length} files)`);
      set.status = 201;
      return {
        batchId: updated.id,
        status: updated.status,
        fileCount: updated.fileCount,
        manifest: updated.manifest,
      };
    },
    {
      body: t.Object({ files: t.Files() }),
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Upload enrichment files",
        description: "Validates and previews files, creating a DRAFT batch. No knowledge is modified.",
      },
    }
  )

  // 2. Confirm DRAFT batch -> PROCESSING + background enrich job
  .post(
    "/:batchId/confirm",
    async ({ params, set }) => {
      const [batch] = await db
        .select()
        .from(enrichmentBatches)
        .where(eq(enrichmentBatches.id, params.batchId))
        .limit(1);
      if (!batch || batch.companyId !== params.id) {
        set.status = 404;
        return { error: "Batch not found" };
      }
      if (batch.status !== "DRAFT") {
        set.status = 409;
        return { error: `Batch is already ${batch.status}` };
      }

      await db
        .update(enrichmentBatches)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(enrichmentBatches.id, batch.id));
      await enrichQueue.add("enrich", { batchId: batch.id });

      logger.info(`[UPLOADS] Batch ${batch.id} confirmed, enrich job queued`);
      return { batchId: batch.id, status: "PROCESSING" };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), batchId: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Confirm enrichment batch",
        description: "Queues background processing that produces a new minor version.",
      },
    }
  )

  // 3. Batch history for the Sources UI
  .get(
    "/",
    async ({ params, set }) => {
      const [company] = await db
        .select()
        .from(companies)
        .where(eq(companies.id, params.id))
        .limit(1);
      if (!company) {
        set.status = 404;
        return { error: "Company not found" };
      }
      const batches = await db
        .select()
        .from(enrichmentBatches)
        .where(eq(enrichmentBatches.companyId, params.id))
        .orderBy(desc(enrichmentBatches.createdAt));
      return {
        batches: batches.map((b) => ({
          ...b,
          // Never ship raw bytes to the UI.
          manifest: b.manifest,
        })),
      };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: { summary: "List enrichment batches" },
    }
  )

  // 4. Cancel a DRAFT batch (indexed nothing, so nothing to roll back)
  .delete(
    "/:batchId",
    async ({ params, set }) => {
      const [batch] = await db
        .select()
        .from(enrichmentBatches)
        .where(eq(enrichmentBatches.id, params.batchId))
        .limit(1);
      if (!batch || batch.companyId !== params.id) {
        set.status = 404;
        return { error: "Batch not found" };
      }
      if (batch.status !== "DRAFT") {
        set.status = 409;
        return { error: "Only DRAFT batches can be cancelled" };
      }
      await db
        .update(enrichmentBatches)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(enrichmentBatches.id, batch.id));
      return { batchId: batch.id, status: "CANCELLED" };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }), batchId: t.String({ format: "uuid" }) }),
      detail: { summary: "Cancel a DRAFT batch" },
    }
  );
