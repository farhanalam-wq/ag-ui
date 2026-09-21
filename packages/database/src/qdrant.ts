/**
 * packages/database/src/qdrant.ts
 *
 * Dedicated client, batch upsert, and search helpers for Qdrant vector database.
 * Frozen contracts (TASKS.md Section 0 & Task 12):
 * - Collection: company_chunks
 * - Vector dimension: 1536 Cosine
 * - Payload: company_id, snapshot_id, document_id, chunk_index, url, title, category
 * - Point ID: Must match Postgres chunk UUID string
 */

export interface QdrantChunkPayload {
  company_id: string;
  snapshot_id: string;
  document_id: string;
  chunk_index: number;
  url: string;
  title: string;
  category: string;
}

export interface QdrantPoint {
  id: string; // UUID string matching Postgres chunks.id
  vector: number[];
  payload: QdrantChunkPayload;
}

export interface QdrantQueryResult {
  id: string;
  score: number;
  payload: QdrantChunkPayload;
  vector?: number[];
}

export const QDRANT_COLLECTION = "company_chunks";

export function getQdrantUrl(): string {
  return (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/+$/, "");
}

export function getQdrantApiKey(): string {
  return process.env.QDRANT_API_KEY || "";
}

export function isQdrantConfigured(): boolean {
  return Boolean(process.env.QDRANT_URL);
}

export function isDualWriteEnabled(): boolean {
  return process.env.QDRANT_DUAL_WRITE === "true";
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const key = getQdrantApiKey();
  if (key) {
    headers["api-key"] = key;
  }
  return headers;
}

/**
 * Upserts points into Qdrant in batches of 256 to 512.
 * Throws on any terminal failure so snapshots can be marked FAILED without drift.
 */
export async function upsertChunkPoints(
  points: QdrantPoint[],
  batchSize = 256,
  collection = QDRANT_COLLECTION
): Promise<void> {
  if (points.length === 0) return;

  const url = `${getQdrantUrl()}/collections/${collection}/points?wait=true`;
  const headers = getHeaders();
  const effectiveBatchSize = Math.max(1, Math.min(batchSize, 512));

  for (let i = 0; i < points.length; i += effectiveBatchSize) {
    const batch = points.slice(i, i + effectiveBatchSize);
    const body = {
      points: batch.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload,
      })),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
    } catch (err: any) {
      throw new Error(
        `[QDRANT] Network error upserting batch ${i / effectiveBatchSize + 1} (${batch.length} points): ${err.message}`
      );
    }

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(
        `[QDRANT] Failed to upsert batch ${i / effectiveBatchSize + 1} (${batch.length} points, HTTP ${res.status}): ${errText}`
      );
    }
  }
}

/**
 * Queries Qdrant collection using vector similarity and payload filtering.
 * Filter supports company_id (mandatory) and snapshot_id (optional).
 */
export async function queryChunkPoints(
  vector: number[],
  filter: { companyId: string; snapshotId?: string },
  limit = 20,
  collection = QDRANT_COLLECTION
): Promise<QdrantQueryResult[]> {
  const url = `${getQdrantUrl()}/collections/${collection}/points/search`;
  const headers = getHeaders();

  const mustFilters: any[] = [
    { key: "company_id", match: { value: filter.companyId } },
  ];
  if (filter.snapshotId) {
    mustFilters.push({ key: "snapshot_id", match: { value: filter.snapshotId } });
  }

  const body = {
    vector,
    filter: {
      must: mustFilters,
    },
    limit,
    with_payload: true,
    with_vector: true,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (err: any) {
    throw new Error(`[QDRANT] Query network error: ${err.message}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[QDRANT] Query failed (HTTP ${res.status}): ${errText}`);
  }

  const data = (await res.json()) as any;
  const hits: any[] = data.result || [];

  return hits.map((hit) => ({
    id: String(hit.id),
    score: typeof hit.score === "number" ? hit.score : 0,
    payload: hit.payload as QdrantChunkPayload,
    vector: Array.isArray(hit.vector) ? hit.vector : undefined,
  }));
}

/**
 * Retrieves metadata and status for a Qdrant collection.
 */
export async function getCollectionInfo(collection = QDRANT_COLLECTION): Promise<any> {
  const url = `${getQdrantUrl()}/collections/${collection}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[QDRANT] Error fetching info for '${collection}': ${err}`);
  }
  const data = await res.json();
  return data.result;
}
