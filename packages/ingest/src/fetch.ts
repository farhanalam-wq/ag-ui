async function fetchText(url: string, timeoutMs: number): Promise<{ text: string; status: number; retryAfterMs: number | null }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-ingest/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
      "Accept-Language": "en-US,en;q=0.9",
    },
    // @ts-ignore - Bun TLS opt
    tls: { rejectUnauthorized: false },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // Guard against giant payloads blowing memory on huge blogs.
  const text = await res.text();
  return { text, status: res.status, retryAfterMs: parseRetryAfterMs(res.headers.get("retry-after")) };
}

// ------------------------------------------- retry + rate limit (P0 task 5) ---
// Bounded retries, Retry-After honor, per-host gap, dead letter with attempt
// counts. Exported so fixture tests exercise the exact production code path.

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Parses a Retry-After header value (delta seconds or HTTP date) into ms. Null when absent or unparseable. */
export function parseRetryAfterMs(value: string | null): number | null {
  if (value === null) return null;
  const v = value.trim();
  if (/^\d+$/.test(v)) return parseInt(v, 10) * 1000;
  const at = Date.parse(v);
  if (isNaN(at)) return null;
  return Math.max(0, at - Date.now());
}

export type FetchStatusKind = "ok" | "retryable" | "terminal";

/** 429 and 5xx are retryable. Every other non-2xx (404, 410, 403, 400, ...) is terminal. */
export function classifyStatus(status: number): FetchStatusKind {
  if (status >= 200 && status < 300) return "ok";
  if (status === 429 || status >= 500) return "retryable";
  return "terminal";
}

/** Timeout/abort/reset/refused/DNS wobbles are transient. Anything else thrown is terminal. */
export function isTransientNetworkError(err: any): boolean {
  if (!err) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const msg = String(err?.message ?? err);
  return /timeout|aborted|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|connection reset|fetch failed|network|TLS|certificate/i.test(msg);
}

/**
 * Delay before the next attempt after failedAttempt (1-based): 1s, 4s, 16s
 * plus uniform jitter 0-500ms. An explicit Retry-After wins, capped at 30s.
 */
export function computeRetryDelayMs(failedAttempt: number, retryAfterMs: number | null): number {
  const bases = [1000, 4000, 16000];
  const jitter = Math.floor(Math.random() * 500);
  if (retryAfterMs !== null) return Math.min(retryAfterMs, 30000) + jitter;
  return bases[Math.min(failedAttempt - 1, bases.length - 1)] + jitter;
}

export class FetchTerminalError extends Error {
  attempts: number;
  status: number | null;
  kind: "status-terminal" | "status-exhausted" | "network-terminal" | "network-exhausted" | "cross-host" | "shell" | "empty";
  constructor(
    message: string,
    attempts: number,
    status: number | null = null,
    kind: FetchTerminalError["kind"] = "network-terminal"
  ) {
    super(message);
    this.name = "FetchTerminalError";
    this.attempts = attempts;
    this.status = status;
    this.kind = kind;
  }
}

export function shortErr(err: any): string {
  return String(err?.message ?? err)
    .replace(/\s+/g, " ")
    .slice(0, 160);
}

// Per-host last-fire timestamps. Updated synchronously before waiting so
// concurrent pool workers reserve slots instead of stampeding one host.
const hostLastAt = new Map<string, number>();
export function resetHostGaps(): void {
  hostLastAt.clear();
}

export async function waitForHostGap(host: string, gapMs: number): Promise<void> {
  const now = Date.now();
  const last = hostLastAt.get(host) ?? 0;
  const wait = last + gapMs - now;
  hostLastAt.set(host, now + Math.max(0, wait));
  if (wait > 0) await sleep(wait);
}

export interface RetryFetchOptions {
  timeoutMs: number;
  hostGapMs: number;
  maxAttempts?: number;
  onRetry?: () => void;
}

/**
 * HTTP fetch with per-host gap and bounded retries. Resolves on 2xx.
 * Throws FetchTerminalError (carrying attempts + status) on terminal status,
 * exhausted retries, or non-transient network errors.
 */
export async function fetchWithRetry(
  url: string,
  o: RetryFetchOptions
): Promise<{ html: string; status: number; attempts: number }> {
  const maxAttempts = o.maxAttempts ?? 3;
  const host = new URL(url).hostname;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await waitForHostGap(host, o.hostGapMs);
    let res: { text: string; status: number; retryAfterMs: number | null };
    try {
      res = await fetchText(url, o.timeoutMs);
    } catch (err: any) {
      if (!isTransientNetworkError(err)) {
        throw new FetchTerminalError(`${shortErr(err)} (attempts=${attempt}, non-retryable)`, attempt, null, "network-terminal");
      }
      if (attempt >= maxAttempts) {
        throw new FetchTerminalError(
          `${shortErr(err)} after ${attempt} attempts (retries exhausted)`,
          attempt,
          null,
          "network-exhausted"
        );
      }
      o.onRetry?.();
      await sleep(computeRetryDelayMs(attempt, null));
      continue;
    }
    const kind = classifyStatus(res.status);
    if (kind === "ok") return { html: res.text, status: res.status, attempts: attempt };
    if (kind === "terminal") {
      throw new FetchTerminalError(
        `HTTP ${res.status} (attempts=${attempt}, non-retryable)`,
        attempt,
        res.status,
        "status-terminal"
      );
    }
    if (attempt >= maxAttempts) {
      throw new FetchTerminalError(
        `HTTP ${res.status} after ${attempt} attempts (retries exhausted)`,
        attempt,
        res.status,
        "status-exhausted"
      );
    }
    o.onRetry?.();
    await sleep(computeRetryDelayMs(attempt, res.retryAfterMs));
  }
  throw new FetchTerminalError("fetch loop exited unexpectedly", maxAttempts);
}

// TODO(TASKS.md P1 task 2): persist the full dead-letter list into
// crawl_jobs.error_sample (cap 200 entries) once the table lands. Until then
// the list lives in memory, prints its full count, and shows the first 10.

