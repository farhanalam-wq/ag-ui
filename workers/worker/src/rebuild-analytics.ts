/**
 * workers/worker/src/rebuild-analytics.ts
 *
 * Rebuilds the analytics rollups for a date range from the raw events.
 *
 * Why this exists: the daily rollup upserts, which is right for day-to-day
 * operation but not for repair. Session rows written by the old
 * hourly-window logic are orphans — a visit crossing an hour boundary
 * produced two rows under two keys — and an upsert cannot remove them.
 * The unique-visitor HLL has the same problem: PFADD cannot subtract the
 * bot hashes that were added before the rollup filtered them out.
 *
 * Usage:
 *   bun src/rebuild-analytics.ts                  # last 30 days
 *   bun src/rebuild-analytics.ts 2026-10-01 2026-10-07
 *
 * Every day is derived from the raw events, so this is safe to rerun.
 */

import Redis from "ioredis";
import { rebuildDays } from "@ag-ui/analytics";
import { redisConnectionOptions } from "@ag-ui/shared";

const DAY = 86_400_000;

function arg(i: number): string | undefined {
  return process.argv[i + 2];
}

async function main() {
  const redis = new Redis({
    ...redisConnectionOptions(),
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  const to = arg(1) ?? new Date().toISOString().slice(0, 10);
  const from = arg(0) ?? new Date(Date.now() - 30 * DAY).toISOString().slice(0, 10);
  console.log(`[REBUILD] analytics rollups ${from} .. ${to}`);

  await rebuildDays(redis, from, to);
  console.log("[REBUILD] done");

  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  console.error(`[REBUILD] failed: ${err?.message ?? err}`);
  process.exit(1);
});
