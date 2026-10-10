import { randomUUID } from "node:crypto";
import type { CliOptions, CrawledDoc } from "./types";
import {
  db,
  companies,
  companySnapshots,
  brands,
  documents,
  chunks,
  facts,
  crawlJobs,
  eq,
  desc,
  upsertChunkPoints,
  invalidateCompanyContextCache,
} from "@ag-ui/database";
import { extractBrandIntelligence } from "@ag-ui/crawler";
import {
  chunkMarkdown,
  generateEmbeddings,
  extractCompanyFacts,
  EmbeddingBatchError,
} from "@ag-ui/shared";

export async function populateDb(
  baseUrl: URL,
  domain: string,
  docs: CrawledDoc[],
  rootHtml: string | null,
  opts: CliOptions,
  crawlStats: Record<string, any>,
  jobContext?: { companyId: string; snapshotId: string; crawlJobId: string; version: number }
) {
  const t0 = Date.now();
  const companyName = domain.split(".")[0].toUpperCase();
  console.log(`\n[DB] Populating Postgres (${process.env.DATABASE_URL ? "DATABASE_URL set" : "default localhost"})…`);

  let companyId: string;
  let snapId: string;
  let version: number;
  let crawlJobId: string | null = jobContext?.crawlJobId ?? null;

  if (jobContext) {
    companyId = jobContext.companyId;
    snapId = jobContext.snapshotId;
    version = jobContext.version;
  } else {
    // Company find-or-create fallback.
    let [existing] = await db.select().from(companies).where(eq(companies.domain, domain)).limit(1);
    if (!existing) {
      const [ins] = await db
        .insert(companies)
        .values({ domain, name: companyName, url: baseUrl.origin })
        .returning();
      companyId = ins.id;
      console.log(`[DB] created company ${companyName} (${companyId})`);
    } else {
      companyId = existing.id;
      console.log(`[DB] reusing company ${existing.name} (${companyId})`);
    }

    // Snapshot versioning.
    const [latest] = await db
      .select()
      .from(companySnapshots)
      .where(eq(companySnapshots.companyId, companyId))
      .orderBy(desc(companySnapshots.version))
      .limit(1);
    version = (latest?.version ?? 0) + 1;
    const [snap] = await db
      .insert(companySnapshots)
      .values({ companyId, version, status: docs.length === 0 ? "FAILED" : "CRAWLING", pageCount: crawlStats.selected ?? docs.length })
      .returning();
    snapId = snap.id;
    console.log(`[DB] snapshot v${version} (${snapId}) status=CRAWLING`);
  }

  if (docs.length === 0) {
    console.log("[DB] no documents crawled — marking snapshot FAILED, nothing to embed.");
    await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
    if (crawlJobId) {
      await db.update(crawlJobs).set({ status: "FAILED", errorSample: crawlStats.deadLetters?.slice(0, 200) ?? [], updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
    }
    return { companyId, snapshotId: snapId, version, insertedDocs: 0, chunkCount: 0, factCount: 0, ms: Date.now() - t0 };
  }

  // Brand upsert from root HTML.
  try {
    const brandData = rootHtml
      ? extractBrandIntelligence(rootHtml, baseUrl)
      : {
          logoUrl: undefined as any,
          tokens: {
            colors: { primary: "#2563eb", background: "#09090b", foreground: "#fafafa" },
            typography: {},
            radius: "0.5rem",
            style: "corporate",
          } as any,
        };
    const [eb] = await db.select().from(brands).where(eq(brands.companyId, companyId)).limit(1);
    if (eb) {
      await db.update(brands).set({ logoUrl: (brandData as any).logoUrl, tokens: (brandData as any).tokens }).where(eq(brands.id, eb.id));
    } else {
      await db.insert(brands).values({ companyId, logoUrl: (brandData as any).logoUrl, tokens: (brandData as any).tokens });
    }
    console.log(`[DB] brand upserted (primary=${(brandData as any).tokens?.colors?.primary})`);
  } catch (err: any) {
    console.log(`[DB] brand extraction skipped: ${err.message}`);
  }

  // Documents bulk insert (Task 1: content_hash, word_count, headings).
  const inserted = await db
    .insert(documents)
    .values(
      docs.map((d) => ({
        snapshotId: snapId,
        url: d.url,
        title: d.title,
        category: d.category,
        content: d.content,
        contentHash: d.contentHash,
        wordCount: d.wordCount,
        headings: d.headings,
      }))
    )
    .returning();
  console.log(`[DB] inserted ${inserted.length} documents`);

  await db.update(companySnapshots).set({ status: "PROCESSING" }).where(eq(companySnapshots.id, snapId));
  if (crawlJobId) {
    await db.update(crawlJobs).set({ status: "EMBEDDING", docs: inserted.length, updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
  }

  // Chunk + embed (skippable for fast smoke tests).
  let chunkCount = 0;
  if (opts.skipEmbed) {
    console.log("[DB] --skip-embed: chunks/embeddings/facts skipped.");
    await db.update(companySnapshots).set({ status: "READY", pageCount: docs.length }).where(eq(companySnapshots.id, snapId));
    await invalidateCompanyContextCache(companyId);
    if (crawlJobId) {
      await db.update(crawlJobs).set({ status: "READY", docs: docs.length, failed: crawlStats.failed ?? 0, errorSample: crawlStats.deadLetters?.slice(0, 200) ?? [], updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
    }
    return { companyId, snapshotId: snapId, version, insertedDocs: inserted.length, chunkCount: 0, factCount: 0, ms: Date.now() - t0 };
  }

  const pending: {
    id: string;
    documentId: string;
    content: string;
    chunkIndex: number;
    url: string;
    title: string;
    category: string;
  }[] = [];
  for (const d of inserted) {
    const cs = chunkMarkdown(d.content, { docTitle: d.title, url: d.url });
    for (const c of cs) {
      pending.push({
        id: randomUUID(),
        documentId: d.id,
        content: c.content,
        chunkIndex: c.chunkIndex,
        url: d.url,
        title: d.title,
        category: d.category,
      });
    }
  }
  chunkCount = pending.length;
  console.log(`[DB] chunked into ${pending.length} pieces — embedding (${opts.embedConcurrency} streams)…`);
  if (pending.length > 0) {
    const tE = Date.now();
    let vecs: number[][];
    try {
      vecs = await generateEmbeddings(
        pending.map((p) => p.content),
        { concurrency: opts.embedConcurrency, useCache: !opts.noEmbedCache }
      );
    } catch (err: any) {
      await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
      const batchInfo = err instanceof EmbeddingBatchError ? ` (batch ${err.batchIndex}, status=${err.status ?? "unknown"})` : "";
      if (crawlJobId) {
        const errSample = [
          ...(crawlStats.deadLetters || []).slice(0, 199),
          {
            stage: "embedding",
            batchIndex: err instanceof EmbeddingBatchError ? err.batchIndex : null,
            status: err instanceof EmbeddingBatchError ? err.status : null,
            error: err.message,
            attempts: 3,
          },
        ];
        await db.update(crawlJobs).set({ status: "FAILED", errorSample: errSample, updatedAt: new Date() }).where(eq(crawlJobs.id, crawlJobId));
      }
      throw new Error(`[DB] embedding failed${batchInfo}: ${err.message}; snapshot marked FAILED, no partial vectors written`);
    }
    console.log(`[DB] embeddings done in ${((Date.now() - tE) / 1000).toFixed(1)}s (${vecs.length}x1536d)`);

    // 1. Write relational chunks to Postgres with explicit pre-generated UUIDs
    try {
      for (let i = 0; i < pending.length; i += 100) {
        const slice = pending.slice(i, i + 100).map((p) => ({
          id: p.id,
          documentId: p.documentId,
          content: p.content,
          chunkIndex: p.chunkIndex,
        }));
        await db.insert(chunks).values(slice as any);
        process.stdout.write(`\r[DB] chunks inserted ${Math.min(i + 100, pending.length)}/${pending.length}`);
      }
      console.log("");
    } catch (err: any) {
      await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
      if (crawlJobId) {
        await db.update(crawlJobs).set({
          status: "FAILED",
          errorSample: [...(crawlStats.deadLetters || []).slice(0, 199), { stage: "postgres_chunk_insert", error: err.message }],
          updatedAt: new Date(),
        }).where(eq(crawlJobs.id, crawlJobId));
      }
      throw new Error(`[DB] Postgres chunk insert failed: ${err.message}; snapshot marked FAILED`);
    }

    // 2. Direct vector write to Qdrant collection 'company_chunks'
    try {
      const qdrantPoints = pending.map((p, idx) => ({
        id: p.id,
        vector: vecs[idx],
        payload: {
          company_id: companyId,
          snapshot_id: snapId,
          document_id: p.documentId,
          chunk_index: p.chunkIndex,
          url: p.url,
          title: p.title,
          category: p.category,
        },
      }));
      console.log(`[QDRANT] Upserting ${qdrantPoints.length} points to 'company_chunks' (batches of 256)...`);
      await upsertChunkPoints(qdrantPoints, 256);
      console.log(`[QDRANT] Vector upsert complete (${qdrantPoints.length} points)`);
    } catch (err: any) {
      await db.update(companySnapshots).set({ status: "FAILED" }).where(eq(companySnapshots.id, snapId));
      if (crawlJobId) {
        await db.update(crawlJobs).set({
          status: "FAILED",
          errorSample: [...(crawlStats.deadLetters || []).slice(0, 199), { stage: "qdrant_vector_write", error: err.message }],
          updatedAt: new Date(),
        }).where(eq(crawlJobs.id, crawlJobId));
      }
      throw new Error(`[QDRANT] Vector upsert failed: ${err.message}; snapshot marked FAILED, not marked READY`);
    }
  }

  // Deterministic facts.
  const companyRow = (await db.select().from(companies).where(eq(companies.id, companyId)).limit(1))[0];
  const extracted = extractCompanyFacts(companyRow?.name ?? companyName, domain, inserted);
  if (extracted.length > 0) {
    await db.insert(facts).values(extracted.map((f) => ({ snapshotId: snapId, subject: f.subject, predicate: f.predicate, value: f.value, confidence: f.confidence })));
  }
  console.log(`[DB] facts: ${extracted.length}`);

  await db.update(companySnapshots).set({ status: "READY", pageCount: docs.length }).where(eq(companySnapshots.id, snapId));
  await invalidateCompanyContextCache(companyId);
  if (crawlJobId) {
    await db.update(crawlJobs).set({
      status: "READY",
      crawled: crawlStats.selected ?? docs.length,
      docs: docs.length,
      failed: crawlStats.failed ?? 0,
      errorSample: crawlStats.deadLetters?.slice(0, 200) ?? [],
      updatedAt: new Date(),
    }).where(eq(crawlJobs.id, crawlJobId));
  }
  return { companyId, snapshotId: snapId, version, insertedDocs: inserted.length, chunkCount, factCount: extracted.length, ms: Date.now() - t0 };
}
