import { createHash, randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { QUEUE_NAMES, redisConnection, type EnrichJobData } from "@ag-ui/queues";
import {
  db,
  eq,
  companies,
  enrichmentBatches,
  batchFiles,
  documents,
  chunks,
  facts,
  upsertChunkPoints,
  invalidateCompanyContextCache,
} from "@ag-ui/database";
import { validateSafeUrl } from "@ag-ui/crawler";
import { extractUpload } from "@ag-ui/extract";
import {
  logger,
  chunkMarkdown,
  generateEmbeddings,
  extractCompanyFacts,
} from "@ag-ui/shared";

export const enrichWorker = new Worker<EnrichJobData>(
  QUEUE_NAMES.ENRICH,
  async (job) => {
    const { batchId } = job.data;
    logger.info(`[ENRICH WORKER] Starting batch ${batchId} (job ${job.id})`);

    const [batch] = await db
      .select()
      .from(enrichmentBatches)
      .where(eq(enrichmentBatches.id, batchId))
      .limit(1);
    if (!batch) throw new Error(`Enrichment batch not found: ${batchId}`);
    if (batch.status === "READY") {
      logger.info(`[ENRICH WORKER] Batch ${batchId} already READY, skipping`);
      return { status: "READY", skipped: true };
    }

    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, batch.companyId))
      .limit(1);
    if (!company) throw new Error(`Company not found for batch: ${batchId}`);

    const files = await db
      .select()
      .from(batchFiles)
      .where(eq(batchFiles.batchId, batchId));

    try {
      await db
        .update(enrichmentBatches)
        .set({ status: "PROCESSING", updatedAt: new Date() })
        .where(eq(enrichmentBatches.id, batchId));

      const insertedDocs: {
        id: string;
        snapshotId: string;
        url: string;
        title: string;
        category: string;
        content: string;
      }[] = [];
      const manifest: Record<string, unknown>[] = [];
      const pendingUrls: string[] = [];
      let failed = 0;

      for (const file of files) {
        const entry: Record<string, unknown> = {
          filename: file.filename,
          mime: file.mime,
          size: file.size,
        };
        try {
          const result = await extractUpload({
            filename: file.filename,
            mime: file.mime ?? undefined,
            buffer: Buffer.from(file.data, "base64"),
          });
          if (result.kind === "url-list") {
            // URL lists don't become documents: SSRF-guard now, crawl later.
            const safe: string[] = [];
            for (const url of result.urls) {
              try {
                await validateSafeUrl(url);
                safe.push(url);
              } catch {
                // Drop unsafe URLs silently; counted below.
              }
            }
            pendingUrls.push(...safe);
            entry.urls = safe.length;
            entry.dropped = result.urls.length - safe.length;
          } else {
            const doc = result.document;
            const contentHash = createHash("sha256").update(doc.text).digest("hex");
            const [inserted] = await db
              .insert(documents)
              .values({
                snapshotId: batch.snapshotId,
                url: `upload://${file.filename}`,
                title: doc.title,
                category: doc.category ?? "general",
                content: doc.text,
                contentHash,
                wordCount: doc.wordCount,
                headings: doc.headings.slice(0, 50),
                sourceKind: "upload",
                originName: file.filename,
                batchId: batch.id,
              })
              .returning();
            insertedDocs.push({
              id: inserted.id,
              snapshotId: batch.snapshotId,
              url: `upload://${file.filename}`,
              title: doc.title,
              category: doc.category ?? "general",
              content: doc.text,
            });
            entry.title = doc.title;
            entry.wordCount = doc.wordCount;
            entry.documentId = inserted.id;
          }
        } catch (err: unknown) {
          failed += 1;
          entry.error = err instanceof Error ? err.message : "Extraction failed";
        }
        manifest.push(entry);
      }

      if (insertedDocs.length === 0 && pendingUrls.length === 0) {
        throw new Error("No readable documents or URLs produced from batch files.");
      }

      // Chunk + embed the uploaded documents under the same major snapshot.
      const toProcess: { documentId: string; content: string; chunkIndex: number }[] = [];
      for (const doc of insertedDocs) {
        for (const c of chunkMarkdown(doc.content, { docTitle: doc.title, url: doc.url })) {
          toProcess.push({ documentId: doc.id, content: c.content, chunkIndex: c.chunkIndex });
        }
      }

      if (toProcess.length > 0) {
        const embeddings = await generateEmbeddings(toProcess.map((c) => c.content));
        const docMap = new Map(insertedDocs.map((d) => [d.id, d]));
        const chunkRows = toProcess.map((c) => {
          const doc = docMap.get(c.documentId);
          return {
            id: randomUUID(),
            documentId: c.documentId,
            content: c.content,
            chunkIndex: c.chunkIndex,
            url: doc?.url || "",
            title: doc?.title || "",
            category: doc?.category || "general",
          };
        });
        for (let i = 0; i < chunkRows.length; i += 50) {
          await db.insert(chunks).values(
            chunkRows.slice(i, i + 50).map((r) => ({
              id: r.id,
              documentId: r.documentId,
              content: r.content,
              chunkIndex: r.chunkIndex,
            }))
          );
        }
        await upsertChunkPoints(
          chunkRows.map((r, idx) => ({
            id: r.id,
            vector: embeddings[idx],
            payload: {
              company_id: company.id,
              snapshot_id: batch.snapshotId,
              document_id: r.documentId,
              chunk_index: r.chunkIndex,
              url: r.url,
              title: r.title,
              category: r.category,
            },
          })),
          256
        );
      }

      const extractedFacts = extractCompanyFacts(company.name, company.domain, insertedDocs);
      if (extractedFacts.length > 0) {
        await db.insert(facts).values(
          extractedFacts.map((f) => ({
            snapshotId: batch.snapshotId,
            subject: f.subject,
            predicate: f.predicate,
            value: f.value,
            confidence: f.confidence,
          }))
        );
      }

      // The minor version was reserved at batch creation; completion only
      // flips status and records the summary.
      await db
        .update(enrichmentBatches)
        .set({
          status: "READY",
          docs: insertedDocs.length,
          failed,
          manifest,
          summary: {
            kind: "upload",
            added: insertedDocs.map((d) => d.title),
            pendingUrls,
            counts: {
              docs: insertedDocs.length,
              chunks: toProcess.length,
              facts: extractedFacts.length,
              failed,
            },
          },
          updatedAt: new Date(),
        })
        .where(eq(enrichmentBatches.id, batchId));

      await invalidateCompanyContextCache(company.id);
      logger.info(
        `[ENRICH WORKER] Batch ${batchId} READY as minor ${batch.minor} (${insertedDocs.length} docs, ${toProcess.length} chunks)`
      );
      return {
        status: "READY",
        minor: batch.minor,
        documentCount: insertedDocs.length,
        chunkCount: toProcess.length,
        factsCount: extractedFacts.length,
        pendingUrls: pendingUrls.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Enrichment failed";
      logger.error(`[ENRICH WORKER] Batch ${batchId} failed:`, message);
      await db
        .update(enrichmentBatches)
        .set({ status: "FAILED", errorSample: { message }, updatedAt: new Date() })
        .where(eq(enrichmentBatches.id, batchId));
      throw err;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

enrichWorker.on("completed", (job) => {
  logger.info(`[ENRICH WORKER] Job ${job.id} completed successfully`);
});

enrichWorker.on("failed", (job, err) => {
  logger.error(`[ENRICH WORKER] Job ${job?.id} failed with error: ${err.message}`);
});

logger.info("Background enrich worker listening on Redis queue: enrich-queue");
