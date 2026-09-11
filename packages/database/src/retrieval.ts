import { db } from "./index";
import { companies, companySnapshots, brands, documents, chunks, facts } from "./schema";
import { eq, desc, sql } from "drizzle-orm";
import { generateEmbeddings, logger } from "@ag-ui/shared";
import type { Evidence } from "@ag-ui/contracts";

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
 * Performs hybrid retrieval (SQL deterministic facts + pgvector semantic search) for a company.
 */
export async function retrieveCompanyContext(
  companyId: string,
  query: string,
  options?: { chunkLimit?: number }
): Promise<RetrievedContext> {
  const limit = options?.chunkLimit || 5;

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

  // 2. Query Deterministic SQL Facts
  const factRecords = await db
    .select()
    .from(facts)
    .where(eq(facts.snapshotId, latestSnapshot.id));

  // 3. Query pgvector Semantic Similarities
  let chunkMatches: {
    id: string;
    documentTitle: string;
    documentUrl: string;
    content: string;
    similarity: number;
  }[] = [];

  try {
    const [queryEmbedding] = await generateEmbeddings([query]);
    const vectorStr = `[${queryEmbedding.join(",")}]`;

    const rawRows = await db.execute(sql`
      SELECT 
        c.id,
        d.title as document_title,
        d.url as document_url,
        c.content,
        1 - (c.embedding <=> ${vectorStr}::vector) AS similarity
      FROM chunks c
      JOIN documents d ON c.document_id = d.id
      WHERE d.snapshot_id = ${latestSnapshot.id}::uuid
      ORDER BY c.embedding <=> ${vectorStr}::vector
      LIMIT ${limit};
    `);

    chunkMatches = rawRows.map((r: any) => ({
      id: r.id,
      documentTitle: r.document_title,
      documentUrl: r.document_url,
      content: r.content,
      similarity: parseFloat(r.similarity),
    }));
  } catch (err: any) {
    logger.warn(`[RETRIEVAL] Vector similarity search failed: ${err.message}`);
  }

  // 4. Construct Evidence for UI Verification
  const evidence: Evidence[] = [];

  // Add top facts as evidence
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

  // Add chunk matches as evidence
  for (const c of chunkMatches) {
    evidence.push({
      sourceId: c.id,
      url: c.documentUrl,
      pageTitle: c.documentTitle,
      snippet: c.content.slice(0, 280).replace(/\n+/g, " "),
      type: "chunk",
      score: Math.max(0, Math.min(1, c.similarity)),
    });
  }

  // 5. Compile Prompt Context for LLM
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

  return {
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
}
