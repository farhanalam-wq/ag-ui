import { Elysia, t } from "elysia";
import {
  db,
  sql,
  companies,
  companySnapshots,
  enrichmentBatches,
  batchFiles,
  documents,
  facts,
  checkEmbedRateLimit,
  setPointsTombstoned,
  invalidateCompanyContextCache,
  eq,
  desc,
  and,
  isNull,
  inArray,
} from "@ag-ui/database";
import { enrichQueue } from "@ag-ui/queues";
import { extractUpload } from "@ag-ui/extract";
import { logger, extractCompanyFacts } from "@ag-ui/shared";

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

/**
 * Reserves the next minor version for a major snapshot and creates the
 * batch row. The snapshot row lock serializes concurrent mutations, so each
 * batch owns a distinct v<major>.<minor> from creation through READY.
 */
async function createBatch(
  companyId: string,
  snapshotId: string,
  extra?: { fileCount?: number }
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM company_snapshots WHERE id = ${snapshotId} FOR UPDATE`);
    const [row] = await tx
      .select({ minor: enrichmentBatches.minor })
      .from(enrichmentBatches)
      .where(eq(enrichmentBatches.snapshotId, snapshotId))
      .orderBy(desc(enrichmentBatches.minor))
      .limit(1);
    const [batch] = await tx
      .insert(enrichmentBatches)
      .values({
        companyId,
        snapshotId,
        minor: (row?.minor ?? 0) + 1,
        fileCount: extra?.fileCount ?? 0,
      })
      .returning();
    return batch;
  });
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
      const batch = await createBatch(companyId, snapshot.id, { fileCount: staged.length });

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
  )

  // 5. Tombstone documents (soft delete as a minor batch — restorable)
  .post(
    "/documents/delete",
    async ({ params, body, set }) => {
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
      const snapshot = await getLatestSnapshot(companyId);
      if (!snapshot) {
        set.status = 409;
        return { error: "Company has no knowledge yet" };
      }

      const ids = [...new Set(body.documentIds)].slice(0, 50);
      if (ids.length === 0) {
        set.status = 400;
        return { error: "Provide at least one document id" };
      }
      const targets = await db
        .select({ id: documents.id, title: documents.title })
        .from(documents)
        .where(
          and(
            eq(documents.snapshotId, snapshot.id),
            isNull(documents.deletedBatchId),
            inArray(documents.id, ids)
          )
        );
      if (targets.length === 0) {
        set.status = 404;
        return { error: "No matching live documents" };
      }

      const batch = await createBatch(companyId, snapshot.id);
      try {
        await db
          .update(documents)
          .set({ deletedBatchId: batch.id })
          .where(inArray(documents.id, targets.map((d) => d.id)));
        await db
          .delete(facts)
          .where(inArray(facts.documentId, targets.map((d) => d.id)));
        await setPointsTombstoned(
          targets.map((d) => d.id),
          true
        );
        await db
          .update(enrichmentBatches)
          .set({
            status: "READY",
            docs: 0,
            failed: 0,
            manifest: targets.map((d) => ({ documentId: d.id, title: d.title })),
            summary: {
              kind: "delete",
              removed: targets.map((d) => d.title),
              counts: { docs: targets.length, failed: 0 },
            },
            updatedAt: new Date(),
          })
          .where(eq(enrichmentBatches.id, batch.id));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Delete failed";
        await db
          .update(enrichmentBatches)
          .set({ status: "FAILED", errorSample: { message }, updatedAt: new Date() })
          .where(eq(enrichmentBatches.id, batch.id));
        set.status = 502;
        return { error: message };
      }

      await invalidateCompanyContextCache(companyId);
      logger.info(`[UPLOADS] Tombstoned ${targets.length} docs for company ${companyId} (batch ${batch.id})`);
      return { batchId: batch.id, status: "READY", minor: batch.minor, removed: targets.length };
    },
    {
      body: t.Object({ documentIds: t.Array(t.String({ format: "uuid" }), { maxItems: 50 }) }),
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Tombstone documents",
        description: "Soft-deletes documents as a minor batch. Restorable via rollback.",
      },
    }
  )

  // 6. Rollback to a version (compensating minor batch)
  .post(
    "/rollback",
    async ({ params, body, set }) => {
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

      const majors = await db
        .select()
        .from(companySnapshots)
        .where(eq(companySnapshots.companyId, companyId))
        .orderBy(desc(companySnapshots.version));
      if (majors.length === 0) {
        set.status = 409;
        return { error: "Company has no knowledge yet" };
      }
      const latest = majors[0];
      const targetMajor = majors.find((m) => m.version === body.targetMajor);
      if (!targetMajor) {
        set.status = 404;
        return { error: "Target version not found" };
      }
      const targetMinor = body.targetMinor ?? 0;

      const allBatches = await db
        .select()
        .from(enrichmentBatches)
        .where(eq(enrichmentBatches.companyId, companyId));
      const batchById = new Map(allBatches.map((b) => [b.id, b]));
      const versionOf = (snapshotId: string, minor: number) => {
        const major = majors.find((m) => m.id === snapshotId);
        return { major: major?.version ?? 0, minor };
      };
      const isAfterTarget = (snapshotId: string, minor: number) => {
        const v = versionOf(snapshotId, minor);
        return (
          v.major > targetMajor.version || (v.major === targetMajor.version && v.minor > targetMinor)
        );
      };

      // Docs added after the target get tombstoned: crawled docs from
      // newer majors, plus uploaded docs from post-target minors.
      const majorOfSnapshot = new Map(majors.map((m) => [m.id, m.version]));
      const addedAfter = await db
        .select({
          id: documents.id,
          title: documents.title,
          snapshotId: documents.snapshotId,
          batchId: documents.batchId,
        })
        .from(documents)
        .where(isNull(documents.deletedBatchId));
      const toTombstone = addedAfter.filter((d) => {
        const docMajor = majorOfSnapshot.get(d.snapshotId) ?? 0;
        if (docMajor > targetMajor.version) return true;
        if (!d.batchId) return false;
        const b = batchById.get(d.batchId);
        return b ? isAfterTarget(b.snapshotId, b.minor) : false;
      });

      // Docs tombstoned by batches after the target get restored.
      const tombstoned = await db
        .select({
          id: documents.id,
          title: documents.title,
          content: documents.content,
          url: documents.url,
          deletedBatchId: documents.deletedBatchId,
        })
        .from(documents);
      const toRestore = tombstoned.filter((d) => {
        if (!d.deletedBatchId) return false;
        const b = batchById.get(d.deletedBatchId);
        return b ? isAfterTarget(b.snapshotId, b.minor) : false;
      });

      if (toTombstone.length === 0 && toRestore.length === 0) {
        set.status = 409;
        return { error: "Already at the target version — nothing to change" };
      }

      const batch = await createBatch(companyId, latest.id);
      try {
        if (toTombstone.length > 0) {
          await db
            .update(documents)
            .set({ deletedBatchId: batch.id })
            .where(
              inArray(
                documents.id,
                toTombstone.map((d) => d.id)
              )
            );
          await db
            .delete(facts)
            .where(
              inArray(
                facts.documentId,
                toTombstone.map((d) => d.id)
              )
            );
          await setPointsTombstoned(
            toTombstone.map((d) => d.id),
            true
          );
        }
        if (toRestore.length > 0) {
          await db
            .update(documents)
            .set({ deletedBatchId: null })
            .where(
              inArray(
                documents.id,
                toRestore.map((d) => d.id)
              )
            );
          await setPointsTombstoned(
            toRestore.map((d) => d.id),
            false
          );
          const regenerated = extractCompanyFacts(
            company.name,
            company.domain,
            toRestore.map((d) => ({ title: d.title, content: d.content, url: d.url }))
          );
          if (regenerated.length > 0) {
            await db.insert(facts).values(
              regenerated.map((f) => ({
                snapshotId: latest.id,
                subject: f.subject,
                predicate: f.predicate,
                value: f.value,
                confidence: f.confidence,
              }))
            );
          }
        }
        await db
          .update(enrichmentBatches)
          .set({
            status: "READY",
            docs: toRestore.length,
            failed: 0,
            summary: {
              kind: "rollback",
              target: { major: targetMajor.version, minor: targetMinor },
              tombstoned: toTombstone.map((d) => d.title),
              restored: toRestore.map((d) => d.title),
              counts: {
                tombstoned: toTombstone.length,
                restored: toRestore.length,
                failed: 0,
              },
            },
            updatedAt: new Date(),
          })
          .where(eq(enrichmentBatches.id, batch.id));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Rollback failed";
        await db
          .update(enrichmentBatches)
          .set({ status: "FAILED", errorSample: { message }, updatedAt: new Date() })
          .where(eq(enrichmentBatches.id, batch.id));
        set.status = 502;
        return { error: message };
      }

      await invalidateCompanyContextCache(companyId);
      logger.info(
        `[UPLOADS] Rollback to v${targetMajor.version}.${targetMinor} for company ${companyId}: +${toRestore.length} restored, -${toTombstone.length} tombstoned`
      );
      return {
        batchId: batch.id,
        status: "READY",
        minor: batch.minor,
        restored: toRestore.length,
        tombstoned: toTombstone.length,
      };
    },
    {
      body: t.Object({ targetMajor: t.Integer({ minimum: 1 }), targetMinor: t.Optional(t.Integer({ minimum: 0 })) }),
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      detail: {
        summary: "Rollback to a version",
        description: "Applies a compensating minor batch restoring the target version state.",
      },
    }
  );
