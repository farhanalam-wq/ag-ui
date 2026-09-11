import { logger } from "./logger";

export interface EmbeddingOptions {
  model?: string;
  apiKey?: string;
  batchSize?: number;
}

export interface EmbeddingResult {
  embedding: number[];
  index: number;
}

/**
 * Generates vector embeddings for an array of text strings using OpenAI text-embedding-3-small (1536 dimensions).
 */
export async function generateEmbeddings(
  texts: string[],
  options?: EmbeddingOptions
): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  const model = options?.model || "text-embedding-3-small";
  const batchSize = options?.batchSize || 64;

  if (!apiKey) {
    logger.warn("[EMBEDDINGS] OPENAI_API_KEY is not set. Generating deterministic pseudo-embeddings for testing.");
    return texts.map((t, idx) => generateFallbackEmbedding(t, 1536, idx));
  }

  const allEmbeddings: number[][] = new Array(texts.length);

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    logger.debug(`[EMBEDDINGS] Requesting embeddings for batch ${i / batchSize + 1} (${batch.length} items)...`);

    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        // @ts-ignore
        tls: { rejectUnauthorized: false },
        body: JSON.stringify({
          model,
          input: batch.map((t) => t.slice(0, 8000)), // prevent token limit overflow
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };

      data.data.forEach((item) => {
        allEmbeddings[i + item.index] = item.embedding;
      });
    } catch (err: any) {
      logger.error(`[EMBEDDINGS] Embedding batch failed: ${err.message}`);
      throw err;
    }
  }

  return allEmbeddings;
}

/**
 * Generates a unit-normalized deterministic pseudo-embedding (1536 dims) for offline/test environments.
 */
function generateFallbackEmbedding(text: string, dimensions = 1536, seed = 0): number[] {
  let hash = seed;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }

  const vec: number[] = new Array(dimensions);
  let norm = 0;

  for (let i = 0; i < dimensions; i++) {
    const val = Math.sin(hash + i);
    vec[i] = val;
    norm += val * val;
  }

  norm = Math.sqrt(norm);
  return vec.map((v) => v / norm);
}
