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

/**
 * Single source of truth for the embedding dimension. Qdrant collection
 * dimensions are immutable after creation, so this must never be inferred
 * from incoming data — one off-size batch would permanently lock the
 * collection to the wrong width and fail every later upsert.
 */
export const QDRANT_VECTOR_DIMS = 1536;

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
 * Ensures a Qdrant collection exists with proper vector dimension, distance, and payload indexes.
 */
export async function ensureQdrantCollection(
  collection = QDRANT_COLLECTION,
  dims = QDRANT_VECTOR_DIMS
): Promise<void> {
  if (dims !== QDRANT_VECTOR_DIMS) {
    throw new Error(
      `[QDRANT] Refusing to create collection '${collection}' with dims=${dims}: expected ${QDRANT_VECTOR_DIMS}. Refusing to lock the collection to an off-size width.`
    );
  }
  const baseUrl = getQdrantUrl();
  const headers = getHeaders();
  try {
    const checkRes = await fetch(`${baseUrl}/collections/${collection}`, { headers });
    if (checkRes.ok) return;

    if (checkRes.status === 404) {
      const createRes = await fetch(`${baseUrl}/collections/${collection}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          vectors: {
            size: dims,
            distance: "Cosine",
          },
          hnsw_config: {
            ef_construct: 128,
            m: 16,
          },
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text().catch(() => "");
        // Throw so callers mark the snapshot FAILED instead of drifting.
        throw new Error(
          `[QDRANT] Failed to create collection '${collection}' (HTTP ${createRes.status}): ${errText}`
        );
      }

      {
        const indexes = [
          { field_name: "company_id", field_schema: "keyword" },
          { field_name: "snapshot_id", field_schema: "keyword" },
          { field_name: "document_id", field_schema: "keyword" },
          { field_name: "category", field_schema: "keyword" },
          { field_name: "chunk_index", field_schema: "integer" },
        ];
        for (const idx of indexes) {
          try {
            const idxRes = await fetch(`${baseUrl}/collections/${collection}/index`, {
              method: "PUT",
              headers,
              body: JSON.stringify(idx),
            });
            // 409 = index already exists; anything else non-OK is logged.
            if (!idxRes.ok && idxRes.status !== 409) {
              const errText = await idxRes.text().catch(() => "");
              console.warn(
                `[QDRANT] Payload index '${idx.field_name}' creation returned HTTP ${idxRes.status}: ${errText}`
              );
            }
          } catch (err: any) {
            console.warn(`[QDRANT] Payload index '${idx.field_name}' creation failed: ${err?.message || "unknown"}`);
          }
        }
      }
    }
  } catch (err: any) {
    // Preserve explicit creation failures; only the best-effort existence
    // check itself is non-blocking.
    if (err?.message?.startsWith("[QDRANT] Failed to create collection")) throw err;
  }
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

  for (const p of points) {
    if (!p.vector || p.vector.length !== QDRANT_VECTOR_DIMS) {
      throw new Error(
        `[QDRANT] Refusing upsert: point ${p.id} has dims=${p.vector?.length ?? 0}, expected ${QDRANT_VECTOR_DIMS}.`
      );
    }
  }
  await ensureQdrantCollection(collection, QDRANT_VECTOR_DIMS);

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

/**
 * Computes dot product (cosine similarity for unit-normalized vectors).
 */
export function dotProduct(a: number[], b: number[]): number {
  let dot = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

/**
 * Deterministic, local Maximal Marginal Relevance (MMR) diversification.
 * Balances query relevance and novelty relative to already selected items.
 *
 * Formula: argmax_{d in C \ S} [ lambda * Sim(d, q) - (1 - lambda) * max_{s in S} Sim(d, s) ]
 *
 * @param candidates List of items with id, vector, and score
 * @param queryVector Query vector (1536-dim unit-normalized)
 * @param lambda Trade-off factor (default 0.7 per Task 13)
 * @param limit Max items to select (default 6 per Task 13)
 */
export function mmrDiversify<T extends { id: string; vector?: number[]; score: number }>(
  candidates: T[],
  queryVector: number[],
  lambda = 0.7,
  limit = 6
): T[] {
  if (candidates.length <= limit) {
    return candidates;
  }

  const selected: T[] = [];
  const remaining = [...candidates];
  const maxSelections = Math.min(limit, candidates.length);

  while (selected.length < maxSelections && remaining.length > 0) {
    let bestIdx = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      const candVector = candidate.vector;

      // Relevance to query: either from Qdrant score or dot product
      const simToQuery =
        candVector && candVector.length === queryVector.length
          ? dotProduct(candVector, queryVector)
          : candidate.score;

      // Redundancy: max similarity to already selected candidates
      let maxSimToSelected = 0;
      if (selected.length > 0 && candVector) {
        for (const sel of selected) {
          if (sel.vector && sel.vector.length === candVector.length) {
            const sim = dotProduct(candVector, sel.vector);
            if (sim > maxSimToSelected) {
              maxSimToSelected = sim;
            }
          }
        }
      }

      const mmrScore = lambda * simToQuery - (1 - lambda) * maxSimToSelected;

      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0) {
      selected.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    } else {
      break;
    }
  }

  return selected;
}

