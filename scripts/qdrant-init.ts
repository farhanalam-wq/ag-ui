/**
 * scripts/qdrant-init.ts
 *
 * Idempotent initialization script for Qdrant vector database.
 * - Asserts Qdrant is reachable via /readyz
 * - Creates collection 'company_chunks' (1536 Cosine, HNSW ef_construct 128, m 16) if missing
 * - Asserts collection vector dimension == EMBED_DIMS (1536) per Task 10
 * - Creates all 5 payload indexes: company_id, snapshot_id, document_id, category, chunk_index
 * - Idempotent: exit 0 whether created fresh or already present
 *
 * Usage: bun scripts/qdrant-init.ts
 */

import { EMBED_DIMS, EMBED_MODEL } from "../packages/shared/src/embeddings";

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || "";
const COLLECTION_NAME = "company_chunks";

const headers: Record<string, string> = {
  "Content-Type": "application/json",
};
if (QDRANT_API_KEY) {
  headers["api-key"] = QDRANT_API_KEY;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Polls /readyz until Qdrant is accepting traffic */
async function waitForQdrantReady(maxWaitMs = 30000): Promise<void> {
  const start = Date.now();
  const readyzUrl = `${QDRANT_URL.replace(/\/+$/, "")}/readyz`;

  process.stdout.write(`[QDRANT-INIT] Connecting to Qdrant at ${QDRANT_URL}... `);
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(readyzUrl, { headers });
      if (res.ok) {
        console.log("READY.");
        return;
      }
    } catch {
      // Waiting for container startup
    }
    await sleep(500);
    process.stdout.write(".");
  }

  console.log("\n");
  throw new Error(
    `[QDRANT-INIT] Could not connect to Qdrant at ${QDRANT_URL} after ${maxWaitMs / 1000}s. Ensure the container is running ('docker compose up -d qdrant').`
  );
}

/** Ensures collection 'company_chunks' exists and satisfies Task 10 dimension invariant */
async function ensureCollection(): Promise<{ created: boolean; dims: number; distance: string }> {
  const collectionUrl = `${QDRANT_URL.replace(/\/+$/, "")}/collections/${COLLECTION_NAME}`;

  const getRes = await fetch(collectionUrl, { headers });

  if (getRes.status === 404) {
    // Collection does not exist — create it fresh
    console.log(`[QDRANT-INIT] Creating collection '${COLLECTION_NAME}'...`);
    const createBody = {
      vectors: {
        size: EMBED_DIMS,
        distance: "Cosine",
      },
      hnsw_config: {
        ef_construct: 128,
        m: 16,
      },
    };

    const putRes = await fetch(collectionUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify(createBody),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`[QDRANT-INIT] Failed to create collection '${COLLECTION_NAME}': ${errText}`);
    }

    console.log(
      `[QDRANT-INIT] Collection '${COLLECTION_NAME}' created (vectors: { size: ${EMBED_DIMS}, distance: 'Cosine' }, hnsw: { ef_construct: 128, m: 16 }).`
    );
    return { created: true, dims: EMBED_DIMS, distance: "Cosine" };
  }

  if (!getRes.ok) {
    const errText = await getRes.text();
    throw new Error(`[QDRANT-INIT] Error querying collection '${COLLECTION_NAME}': ${errText}`);
  }

  const collData = (await getRes.json()) as any;
  const vectorsConfig = collData.result?.config?.params?.vectors;

  // Extract vector size & distance (handles unnamed single vector or named vectors)
  let actualDims: number;
  let actualDistance: string;

  if (typeof vectorsConfig?.size === "number") {
    actualDims = vectorsConfig.size;
    actualDistance = vectorsConfig.distance;
  } else if (typeof vectorsConfig === "object" && Object.values(vectorsConfig)[0]) {
    const first: any = Object.values(vectorsConfig)[0];
    actualDims = first.size;
    actualDistance = first.distance;
  } else {
    throw new Error(`[QDRANT-INIT] Unexpected vector configuration in '${COLLECTION_NAME}': ${JSON.stringify(vectorsConfig)}`);
  }

  // Task 10 Assertion: Startup self-check fails loudly if vector size is not 1536
  if (actualDims !== EMBED_DIMS) {
    throw new Error(
      `[QDRANT-INIT] STARTUP SELF-CHECK FAILED: Collection '${COLLECTION_NAME}' vector dimension is ${actualDims}, expected ${EMBED_DIMS} (${EMBED_MODEL})!`
    );
  }

  if (actualDistance !== "Cosine") {
    throw new Error(
      `[QDRANT-INIT] STARTUP SELF-CHECK FAILED: Collection '${COLLECTION_NAME}' vector distance is ${actualDistance}, expected Cosine!`
    );
  }

  console.log(
    `[QDRANT-INIT] Collection '${COLLECTION_NAME}' already exists and is valid (size: ${actualDims}, distance: ${actualDistance}).`
  );
  return { created: false, dims: actualDims, distance: actualDistance };
}

/** Idempotently creates the 5 required payload indexes */
async function ensurePayloadIndexes(): Promise<void> {
  const indexSpecs: { field: string; schema: "keyword" | "integer" }[] = [
    { field: "company_id", schema: "keyword" },
    { field: "snapshot_id", schema: "keyword" },
    { field: "document_id", schema: "keyword" },
    { field: "category", schema: "keyword" },
    { field: "chunk_index", schema: "integer" },
  ];

  const indexUrl = `${QDRANT_URL.replace(/\/+$/, "")}/collections/${COLLECTION_NAME}/index`;

  for (const idx of indexSpecs) {
    const res = await fetch(indexUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        field_name: idx.field,
        field_schema: idx.schema,
      }),
    });

    if (res.ok) {
      console.log(`[QDRANT-INIT] Payload index '${idx.field}' (${idx.schema}) created.`);
    } else {
      const errText = await res.text();
      // If index already exists, Qdrant returns 400 with a message like "already exists" or "already indexed"
      if (errText.includes("already exists") || errText.includes("already indexed") || errText.includes("already")) {
        console.log(`[QDRANT-INIT] Payload index '${idx.field}' (${idx.schema}) already exists.`);
      } else {
        throw new Error(`[QDRANT-INIT] Failed to create index '${idx.field}': ${errText}`);
      }
    }
  }
}

async function main() {
  console.log("=================================================");
  console.log("QDRANT VECTOR DB INITIALIZATION (TASK 11 & 10)");
  console.log("=================================================");

  await waitForQdrantReady();
  const coll = await ensureCollection();
  await ensurePayloadIndexes();

  console.log("-------------------------------------------------");
  console.log("INITIALIZATION COMPLETE");
  console.log(`  Target:       ${QDRANT_URL}`);
  console.log(`  Collection:   ${COLLECTION_NAME}`);
  console.log(`  Status:       ${coll.created ? "Created fresh" : "Already present & validated"}`);
  console.log(`  Vector Dims:  ${coll.dims} (Model: ${EMBED_MODEL})`);
  console.log(`  Metric:       ${coll.distance}`);
  console.log(`  Indexes:      company_id, snapshot_id, document_id, category, chunk_index`);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("\n[FATAL ERROR in qdrant-init]:", err.message || err);
  process.exit(1);
});
