import { logger } from "./logger";
import { EmbedCache, embedCacheKey, getDefaultEmbedCache } from "./embed-cache";

export interface EmbeddingOptions {
  model?: string;
  apiKey?: string;
  batchSize?: number; // max items per request (default 100)
  tokensPerBatch?: number; // max estimated tokens per request (default 6000)
  concurrency?: number; // parallel batch streams (default 3)
  maxAttempts?: number; // attempts per batch (default 3)
  useCache?: boolean; // Redis embedding cache (default true)
  cache?: EmbedCache; // injected cache (tests); defaults to process singleton
}

export interface EmbeddingResult {
  embedding: number[];
  index: number;
}

export const EMBED_MODEL_DEFAULT = "text-embedding-3-small";
export const EMBED_DIMS = 1536;
const MAX_CHARS = 8000;

/** Rough token estimate: 4 chars per token on the truncated input. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(Math.min(text.length, MAX_CHARS) / 4));
}

export interface PackedBatch {
  items: { globalIndex: number; text: string }[];
  estTokens: number;
}

/**
 * Greedily packs texts into batches bounded by token budget and item cap.
 * Every batch holds at least one item. Global indexes survive intact so
 * parallel results map back to input order exactly.
 */
export function packBatches(texts: string[], tokensPerBatch: number, maxItems: number): PackedBatch[] {
  const batches: PackedBatch[] = [];
  let cur: PackedBatch = { items: [], estTokens: 0 };
  texts.forEach((t, globalIndex) => {
    const text = t.slice(0, MAX_CHARS);
    const tok = estimateTokens(text);
    if (cur.items.length > 0 && (cur.items.length >= maxItems || cur.estTokens + tok > tokensPerBatch)) {
      batches.push(cur);
      cur = { items: [], estTokens: 0 };
    }
    cur.items.push({ globalIndex, text });
    cur.estTokens += tok;
  });
  if (cur.items.length > 0) batches.push(cur);
  return batches;
}

export class EmbeddingBatchError extends Error {
  batchIndex: number;
  status: number | null;
  constructor(message: string, batchIndex: number, status: number | null = null) {
    super(message);
    this.name = "EmbeddingBatchError";
    this.batchIndex = batchIndex;
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseRetryAfterMs(value: string | null): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10) * 1000;
  const at = Date.parse(v);
  if (isNaN(at)) return null;
  return Math.max(0, at - Date.now());
}

/** 1s, 4s, 16s + uniform jitter 0-1000ms. Explicit Retry-After wins, capped at 30s. */
function batchRetryDelayMs(failedAttempt: number, retryAfterMs: number | null): number {
  const bases = [1000, 4000, 16000];
  const jitter = Math.floor(Math.random() * 1000);
  if (retryAfterMs !== null) return Math.min(retryAfterMs, 30000) + jitter;
  return bases[Math.min(failedAttempt - 1, bases.length - 1)] + jitter;
}

function isTransientFetchError(err: any): boolean {
  if (!err) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  return /timeout|aborted|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|connection reset|fetch failed|network/i.test(
    String(err?.message ?? err)
  );
}

interface BatchPostResult {
  globalIndex: number;
  embedding: number[];
}

async function postBatchWithRetry(
  batch: PackedBatch,
  batchIndex: number,
  opts: { model: string; apiKey: string; maxAttempts: number }
): Promise<BatchPostResult[]> {
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        // @ts-ignore
        tls: { rejectUnauthorized: false },
        body: JSON.stringify({
          model: opts.model,
          input: batch.items.map((i) => i.text),
        }),
      });
    } catch (err: any) {
      if (!isTransientFetchError(err) || attempt >= opts.maxAttempts) {
        throw new EmbeddingBatchError(
          `batch ${batchIndex}: network failure after ${attempt} attempts: ${String(err?.message ?? err).slice(0, 160)}`,
          batchIndex,
          null
        );
      }
      logger.debug(`[EMBEDDINGS] batch ${batchIndex} network error, retrying (attempt ${attempt})...`);
      await sleep(batchRetryDelayMs(attempt, null));
      continue;
    }

    if (res.ok) {
      const data = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      return data.data.map((item) => ({
        globalIndex: batch.items[item.index].globalIndex,
        embedding: item.embedding,
      }));
    }

    let errText = "";
    try {
      errText = await res.text();
    } catch {
      // ignore body read failures
    }
    const retryAfter = parseRetryAfterMs(res.headers.get("retry-after"));
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= opts.maxAttempts) {
      throw new EmbeddingBatchError(
        `batch ${batchIndex}: OpenAI error (${res.status}) after ${attempt} attempts: ${errText.slice(0, 200)}`,
        batchIndex,
        res.status
      );
    }
    logger.debug(`[EMBEDDINGS] batch ${batchIndex} got ${res.status}, retrying (attempt ${attempt})...`);
    await sleep(batchRetryDelayMs(attempt, retryAfter));
  }
  throw new EmbeddingBatchError(`batch ${batchIndex}: retry loop exited unexpectedly`, batchIndex, null);
}

/**
 * Generates vector embeddings using token-budgeted batches over parallel
 * streams. Order of the returned array always matches input order, even when
 * batches complete out of order or individual batches retry.
 */
export async function generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<number[][]> {
  if (!texts || texts.length === 0) {
    return [];
  }

  const apiKey = options?.apiKey || process.env.OPENAI_API_KEY;
  const model = options?.model || EMBED_MODEL_DEFAULT;
  const maxItems = options?.batchSize || 100;
  const tokensPerBatch = options?.tokensPerBatch || 6000;
  const concurrency = Math.min(6, Math.max(1, options?.concurrency ?? 3));
  const maxAttempts = options?.maxAttempts ?? 3;

  if (!apiKey) {
    logger.warn("[EMBEDDINGS] OPENAI_API_KEY is not set. Generating deterministic pseudo-embeddings for testing.");
    return texts.map((t, idx) => generateFallbackEmbedding(t, 1536, idx));
  }

  const batches = packBatches(texts, tokensPerBatch, maxItems);
  logger.debug(
    `[EMBEDDINGS] ${texts.length} texts in ${batches.length} batches (~${tokensPerBatch} tok each), ${concurrency} streams...`
  );

  const allEmbeddings: number[][] = new Array(texts.length);

  // Cache lookup first: partition into hits and misses on the exact truncated
  // input sent to OpenAI. Misses flow through the batch pipeline below, then
  // write back. Order is always reassembled by global index.
  const useCache = options?.useCache !== false;
  const cache = useCache ? options?.cache ?? getDefaultEmbedCache() : null;
  let missGlobals: number[] = texts.map((_, i) => i);
  if (cache) {
    const sliced = texts.map((t) => t.slice(0, MAX_CHARS));
    const keys = sliced.map((t) => embedCacheKey(model, EMBED_DIMS, t));
    const cached = await cache.getMany(keys, model);
    let hits = 0;
    const missTexts: string[] = [];
    missGlobals = [];
    cached.forEach((v, i) => {
      if (v !== null) {
        allEmbeddings[i] = v;
        hits++;
      } else {
        missGlobals.push(i);
        missTexts.push(texts[i]);
      }
    });
    logger.info(`[EMBEDDINGS] cache ${hits} hits / ${texts.length} total, embedding ${missTexts.length} misses...`);
    if (missTexts.length === 0) return allEmbeddings;
    const missBatches = packBatches(missTexts, tokensPerBatch, maxItems);
    const missVectors: number[][] = new Array(missTexts.length);
    await runBatches(missBatches, missVectors, { model, apiKey, maxAttempts, concurrency });
    const writeBack: { key: string; vector: number[]; model: string }[] = [];
    missVectors.forEach((vec, pos) => {
      const globalIndex = missGlobals[pos];
      allEmbeddings[globalIndex] = vec;
      writeBack.push({ key: keys[globalIndex], vector: vec, model });
    });
    await cache.setMany(writeBack);
    return allEmbeddings;
  }

  await runBatches(batches, allEmbeddings, { model, apiKey, maxAttempts, concurrency });

  return allEmbeddings;
}

async function runBatches(
  batches: PackedBatch[],
  out: number[][],
  opts: { model: string; apiKey: string; maxAttempts: number; concurrency: number }
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(opts.concurrency, batches.length) }, async () => {
    while (true) {
      const b = cursor++;
      if (b >= batches.length) return;
      const results = await postBatchWithRetry(batches[b], b, {
        model: opts.model,
        apiKey: opts.apiKey,
        maxAttempts: opts.maxAttempts,
      });
      for (const r of results) {
        out[r.globalIndex] = r.embedding;
      }
    }
  });
  await Promise.all(workers);
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
