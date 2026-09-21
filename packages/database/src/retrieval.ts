/**
 * packages/database/src/retrieval.ts
 *
 * Upgraded Hybrid Retrieval Engine (Task 13):
 * - Qdrant top-20 candidate search with payload filters ({ company_id, snapshot_id })
 * - PostgreSQL hydration for chunk content by chunk UUIDs
 * - Local deterministic Maximal Marginal Relevance (MMR) diversification (lambda 0.7, cap 6)
 * - Two-tier Redis caching:
 *     - qemb:v1:{sha256(query)} (1 hour TTL)
 *     - qctx:v1:{companyId}:{snapshotId}:{sha256(query)}:{limit} (5 min TTL, invalidated on READY)
 * - Prompt compiled strictly from the final 6 diversified excerpts + authoritative facts.
 */

import { db } from "./index";
import { companies, companySnapshots, brands, chunks, facts } from "./schema";
import { eq, desc, inArray } from "drizzle-orm";
import { generateEmbeddings, logger } from "@ag-ui/shared";
import type { Evidence } from "@ag-ui/contracts";
import { queryChunkPoints, mmrDiversify } from "./qdrant";
import {
  getCachedQueryEmbedding,
  setCachedQueryEmbedding,
  getCachedRetrievalContext,
  setCachedRetrievalContext,
} from "./cache";

export interface RetrievedContext {
  company: {
    id: string;
    name: string;
    domain: string;
    url: string;
  };
  brand: {
    logoUrl: string | null;
    tokens: any;
  } | null;
  facts: {
    subject: string;
    predicate: string;
    value: string;
    confidence: number | null;
  }[];
  chunks: {
    id: string;
    documentTitle: string;
    documentUrl: string;
    content: string;
    similarity: number;
  }[];
  evidence: Evidence[];
  compiledPromptContext: string;
}

/**
 * Performs hybrid retrieval (deterministic SQL facts + Qdrant semantic search + MMR diversification)
 * with Redis query embedding and context caching.
 */
export async function retrieveCompanyContext(
  companyId: string,
  query: string,
  options?: { chunkLimit?: number }
): Promise<RetrievedContext> {
  const finalLimit = Math.min(options?.chunkLimit || 6, 6);

  // 1. Fetch Company & Brand
  const [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    throw new Error(`Company with id ${companyId} not found`);
  }

  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.companyId, companyId))
    .limit(1);

  const [latestSnapshot] = await db
    .select()
    .from(companySnapshots)
    .where(eq(companySnapshots.companyId, companyId))
    .orderBy(desc(companySnapshots.version))
    .limit(1);

  if (!latestSnapshot) {
    return {
      company,
      brand: brand || null,
      facts: [],
      chunks: [],
      evidence: [],
      compiledPromptContext: `Company: ${company.name} (${company.domain})\nNo crawled snapshots available yet.`,
    };
  }

  // 2. Check Redis Retrieval Context Cache (5 min TTL)
  const cachedContext = await getCachedRetrievalContext<RetrievedContext>(
    companyId,
    latestSnapshot.id,
    query,
    finalLimit
  );
  if (cachedContext) {
    logger.debug(`[RETRIEVAL] Cache HIT for query '${query.slice(0, 40)}'`);
    return cachedContext;
  }

  // 3. Query Deterministic SQL Facts
  const factRecords = await db
    .select()
    .from(facts)
    .where(eq(facts.snapshotId, latestSnapshot.id));

  // 4. Query Embedding (Redis Cache with 1h TTL)
  let queryVector = await getCachedQueryEmbedding(query);
  if (!queryVector) {
    try {
      const [vec] = await generateEmbeddings([query]);
      queryVector = vec;
      if (queryVector) {
        await setCachedQueryEmbedding(query, queryVector);
      }
    } catch (err: any) {
      logger.warn(`[RETRIEVAL] Failed to generate query embedding: ${err.message}`);
    }
  }

  // 5. Qdrant Search (Top 20 candidates) + PostgreSQL Hydration + MMR
  let chunkMatches: {
    id: string;
    documentTitle: string;
    documentUrl: string;
    content: string;
    similarity: number;
  }[] = [];

  if (queryVector && queryVector.length > 0) {
    try {
      // Fetch top 20 candidates with vectors and payloads from Qdrant
      const candidates = await queryChunkPoints(
        queryVector,
        { companyId, snapshotId: latestSnapshot.id },
        20
      );

      if (candidates.length > 0) {
        // Hydrate chunk content from PostgreSQL by chunk UUID
        const chunkIds = candidates.map((c) => c.id);
        const chunkRows = await db
          .select({ id: chunks.id, content: chunks.content })
          .from(chunks)
          .where(inArray(chunks.id, chunkIds));

        const contentMap = new Map(chunkRows.map((r) => [r.id, r.content]));

        // Apply local deterministic MMR diversification (lambda 0.7, cap at most 6)
        const diversified = mmrDiversify(candidates, queryVector, 0.7, finalLimit);

        chunkMatches = diversified.map((c) => ({
          id: c.id,
          documentTitle: c.payload.title || "Untitled Document",
          documentUrl: c.payload.url || "",
          content: contentMap.get(c.id) || "",
          similarity: Math.max(0, Math.min(1, c.score)),
        }));
      }
    } catch (err: any) {
      logger.warn(`[RETRIEVAL] Qdrant search failed: ${err.message}`);
    }
  }

  // 6. Construct Evidence for UI Verification
  const evidence: Evidence[] = [];

  for (const f of factRecords) {
    evidence.push({
      sourceId: f.id,
      url: company.url,
      pageTitle: "Authoritative Company Facts",
      snippet: `${f.predicate.toUpperCase()}: ${f.value}`,
      type: "fact",
      score: (f.confidence || 100) / 100,
    });
  }

  for (const c of chunkMatches) {
    evidence.push({
      sourceId: c.id,
      url: c.documentUrl,
      pageTitle: c.documentTitle,
      snippet: c.content.slice(0, 280).replace(/\n+/g, " "),
      type: "chunk",
      score: c.similarity,
    });
  }

  // 7. Compile Prompt Context for LLM (Strictly from the final diversified excerpts)
  let contextStr = `COMPANY: ${company.name} (${company.domain})\nWEBSITE: ${company.url}\n\n`;

  if (factRecords.length > 0) {
    contextStr += `AUTHORITATIVE FACTS:\n`;
    for (const f of factRecords) {
      contextStr += `- ${f.predicate}: ${f.value}\n`;
    }
    contextStr += `\n`;
  }

  if (chunkMatches.length > 0) {
    contextStr += `RELEVANT DOCUMENTATION EXCERPTS:\n`;
    chunkMatches.forEach((c, idx) => {
      contextStr += `[Excerpt ${idx + 1}] (${c.documentTitle}):\n${c.content}\n\n`;
    });
  }

  const result: RetrievedContext = {
    company,
    brand: brand || null,
    facts: factRecords.map((f) => ({
      subject: f.subject,
      predicate: f.predicate,
      value: f.value,
      confidence: f.confidence,
    })),
    chunks: chunkMatches,
    evidence,
    compiledPromptContext: contextStr,
  };

  // 8. Cache Compiled Context in Redis (5 minutes TTL)
  await setCachedRetrievalContext(companyId, latestSnapshot.id, query, finalLimit, result);

  return result;
}
