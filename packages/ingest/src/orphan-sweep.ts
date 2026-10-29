import {
  db,
  companySnapshots,
  crawlJobs,
  inArray,
  notInArray,
  and,
  recordError,
} from "@ag-ui/database";
import { logger } from "@ag-ui/shared";
import { LIVE_JOB_STATUSES } from "./pipeline";

/** Terminal statuses — never overwritten by the sweep. */
const TERMINAL_JOB_STATUSES = ["READY", "FAILED", "CANCELLED"];
const TERMINAL_SNAPSHOT_STATUSES = ["READY", "FAILED", "CANCELLED"];

/** error_sample for the job row, mirroring the API cancel route's shape. */
const ORPHANED_SAMPLE = { operator: "orphaned by API restart" };

/**
 * Boot-time orphan sweeper: flip live crawl jobs (and their snapshots) that no
 * process will ever advance to a terminal status. runIngestPipeline runs
 * in-process inside the API, so every live job found at startup is a zombie
 * from a previous process — restart, crash, or service swap. Left alone it
 * holds the max_concurrent_jobs cap forever and refuses all new ingests.
 *
 * Idempotent and non-fatal: a DB hiccup here must never block the server from
 * listening, so every phase is wrapped and failures are recorded, not thrown.
 */
export async function sweepOrphanedCrawlJobs(): Promise<void> {
  let zombieJobs: {
    id: string;
    status: string;
    snapshotId: string | null;
  }[] = [];

  try {
    zombieJobs = await db
      .select({
        id: crawlJobs.id,
        status: crawlJobs.status,
        snapshotId: crawlJobs.snapshotId,
      })
      .from(crawlJobs)
      .where(inArray(crawlJobs.status, LIVE_JOB_STATUSES));
  } catch (err) {
    logger.warn(
      `[ORPHAN-SWEEP] could not list live crawl jobs — skipping: ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (zombieJobs.length === 0) {
    return;
  }

  const ids = zombieJobs.map((j) => j.id);
  try {
    await db
      .update(crawlJobs)
      .set({
        status: "FAILED",
        errorSample: ORPHANED_SAMPLE as any,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(crawlJobs.id, ids),
          notInArray(crawlJobs.status, TERMINAL_JOB_STATUSES)
        )
      );
  } catch (err) {
    logger.warn(
      `[ORPHAN-SWEEP] failed to mark ${ids.length} job(s) FAILED: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const snapshotIds = [...new Set(zombieJobs.map((j) => j.snapshotId).filter((s): s is string => Boolean(s)))];
  if (snapshotIds.length > 0) {
    try {
      await db
        .update(companySnapshots)
        .set({ status: "FAILED" })
        .where(
          and(
            inArray(companySnapshots.id, snapshotIds),
            notInArray(companySnapshots.status, TERMINAL_SNAPSHOT_STATUSES)
          )
        );
    } catch (err) {
      logger.warn(
        `[ORPHAN-SWEEP] failed to mark ${snapshotIds.length} snapshot(s) FAILED: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  logger.info(
    `[ORPHAN-SWEEP] reaped ${zombieJobs.length} orphaned crawl job(s): ${ids.join(", ")}`
  );

  void recordError({
    level: "warn",
    source: "crawler",
    message: `[ORPHAN-SWEEP] marked ${zombieJobs.length} orphaned crawl job(s) FAILED at boot: ${ids.join(", ")}`,
  });
}
