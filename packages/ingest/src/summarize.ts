// ------------------------------------------------------------ summarize ---

import type { DeadLetterEntry } from "./types";

/**
 * A crawl-failure summary in UI-ready shape (TASKS.md #24 — crawl-failure
 * visibility). Built purely from the dead letters the crawl phase already
 * produces; nothing is invented and no extra fetches happen.
 */
export interface FailureSummary {
  /** Total dead letters the summary was built from. */
  total: number;
  /** Distinct reasons sorted by count desc, then reason asc. */
  groups: { reason: string; count: number }[];
  /** The first `maxItems` dead letters, unmodified — the "top failures". */
  items: DeadLetterEntry[];
}

/**
 * Map one dead letter to a short, human reason. Classification uses the
 * dead letter's own fields first (`stage`, `status`) and falls back to
 * reading the error text we wrote ourselves in `crawl.ts` — so the buckets
 * track real failure modes, and unmatched errors land in "Other" with
 * their verbatim message rather than a guessed label.
 */
export function classifyDeadLetter(entry: DeadLetterEntry): string {
  if (entry.stage === "parse") return "Parse failure";

  const error = entry.error ?? "";
  if (error.startsWith("cross-host")) return "Cross-host skip";
  if (error.includes("robots.txt")) return "Robots.txt disallowed";
  // Before the playwright test: the JS-shell message itself recommends
  // "--playwright", which would otherwise classify as a render failure.
  if (error.includes("JS shell")) return "JS shell (no HTML body)";
  if (/playwright/i.test(error)) return "Playwright render failed";

  if (typeof entry.status === "number" && entry.status > 0) {
    return `HTTP ${entry.status}`;
  }

  // No status: network-class failures. The wording mirrors fetch.ts's
  // retryability test so the label agrees with how the fetcher treated it.
  if (
    /timeout|aborted/i.test(error) ||
    /ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|connection reset|fetch failed|network|TLS|certificate/i.test(
      error
    )
  ) {
    return "Network / timeout";
  }

  if (error.includes("fetch-fail")) return "Empty or bad response";

  return "Other";
}

/**
 * Group dead letters into a compact failure summary for progress events
 * and the done payload. `maxItems` caps the example list (default 5 per
 * the agreed UI scope); groups are always complete so counts stay honest.
 */
export function summarizeFailures(
  deadLetters: DeadLetterEntry[] | null | undefined,
  opts?: { maxItems?: number }
): FailureSummary {
  const list = deadLetters ?? [];
  const counts = new Map<string, number>();
  for (const entry of list) {
    const reason = classifyDeadLetter(entry);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const groups = [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
  return {
    total: list.length,
    groups,
    items: list.slice(0, opts?.maxItems ?? 5),
  };
}
