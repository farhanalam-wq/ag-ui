import { and, count, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { logger } from "@ag-ui/shared";
import { db } from "./index";
import { companies, companySnapshots, crawlJobs, errorEvents } from "./schema";

/**
 * Operations error sink — the single write path for captured failures.
 *
 * `recordError()` is deliberately total: it never throws and never changes the
 * caller's control flow. A failed sink write logs once and is dropped; the
 * product keeps serving. Reads (`listErrorEvents`) back the Operations/Errors
 * page; `listActivity` derives the Operations/Activity trail from the existing
 * crawl-job and snapshot tables (no audit table).
 */

export type ErrorSource =
  | "api"
  | "crawler"
  | "worker"
  | "embed"
  | "retrieval"
  | "chat"
  | "voice";

export type ErrorLevel = "error" | "warn";

export interface RecordErrorInput {
  level?: ErrorLevel;
  source: ErrorSource;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  companyId?: string | null;
}

export interface ErrorFilters {
  companyId?: string;
  source?: ErrorSource;
  level?: ErrorLevel;
  since?: Date;
  /** Message or `context.path` substring, case-insensitive. */
  q?: string;
  /** Matches `context.jobId`. */
  jobId?: string;
  /** Defaults to 50, capped at 200. */
  limit?: number;
  /** Defaults to 0. */
  offset?: number;
}

export interface ErrorEventRow {
  id: string;
  level: ErrorLevel;
  source: ErrorSource;
  message: string;
  stack: string | null;
  context: Record<string, unknown> | null;
  companyId: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

export interface ErrorListResult {
  events: ErrorEventRow[];
  total: number;
  limit: number;
  offset: number;
}

export type ActivityKind = "crawl_job" | "snapshot";

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  companyId: string;
  companyName: string;
  status: string;
  /** ISO timestamp of the state transition. */
  at: string;
  detail: Record<string, unknown>;
}

export interface ActivityFilters {
  companyId?: string;
  status?: string;
  kind?: ActivityKind;
  since?: Date;
  /** Company-name substring, case-insensitive. */
  q?: string;
  /** Defaults to 50, capped at 200. */
  limit?: number;
  /** Defaults to 0. */
  offset?: number;
}

export interface ActivityListResult {
  events: ActivityEvent[];
  total: number;
  limit: number;
  offset: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_MESSAGE = 2_000;
const MAX_STACK = 8_000;
const MAX_CONTEXT_BYTES = 8 * 1024;

/** Anything that looks like a credential is masked, at any nesting depth. */
const SENSITIVE_KEY = /token|secret|password|authorization|cookie|api[-_]?key/i;

const REDACTED = "[REDACTED]";

/** Escape `LIKE` wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function clipText(value: string, max: number): string {
  if (value.length <= max) return value;
  const suffix = "…[truncated]";
  return `${value.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 6) return "[depth limit]";
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return clipText(value, 1_000);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: clipText(value.message, 1_000) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactValue(item, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(item, depth + 1);
  }
  return out;
}

/** Second pass for oversized contexts: preserve shape, drop volume. */
function compactValue(value: unknown, depth: number): unknown {
  if (depth >= 3) return "[clipped]";
  if (typeof value === "string") return clipText(value, 120);
  if (Array.isArray(value)) {
    return value.slice(0, 5).map((item) => compactValue(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 10)) {
      out[key] = compactValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

function byteLength(value: unknown): number | null {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return null;
  }
}

/**
 * Redact credentials, normalise non-JSON values, and clip to 8 KB serialised.
 * Never throws: an unserialisable context is replaced with a marker.
 */
export function sanitizeContext(
  context: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!context) return null;

  try {
    const redacted = redactValue(context, 0);
    if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) {
      return { value: redacted };
    }

    const asRecord = redacted as Record<string, unknown>;
    const size = byteLength(asRecord);
    if (size === null) return { note: "unserialisable context" };
    if (size <= MAX_CONTEXT_BYTES) return asRecord;

    const compacted = {
      ...(compactValue(asRecord, 0) as Record<string, unknown>),
      _truncated: true,
    };
    const compactedSize = byteLength(compacted);
    if (compactedSize !== null && compactedSize <= MAX_CONTEXT_BYTES) return compacted;

    return {
      note: "context exceeded 8 KB and was clipped",
      keys: Object.keys(asRecord).slice(0, 20),
    };
  } catch {
    return { note: "unserialisable context" };
  }
}

/**
 * Persist one error. Best-effort by contract: swallows every failure (including
 * FK violations for stale/deleted companies) after a single warning.
 */
export async function recordError(input: RecordErrorInput): Promise<void> {
  try {
    const rawMessage = typeof input.message === "string" ? input.message.trim() : "";
    const message = clipText(rawMessage || "Unknown error", MAX_MESSAGE);
    const stack = input.stack ? clipText(input.stack, MAX_STACK) : null;

    await db.insert(errorEvents).values({
      level: input.level ?? "error",
      source: input.source,
      message,
      stack,
      context: sanitizeContext(input.context),
      companyId: input.companyId ?? null,
    });
  } catch (err) {
    logger.warn(
      `[ERROR-SINK] persist failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function clampOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset)) return 0;
  return Math.max(0, Math.trunc(offset));
}

function errorWhere(f: ErrorFilters): SQL | undefined {
  const conditions: (SQL | undefined)[] = [];

  if (f.companyId) conditions.push(eq(errorEvents.companyId, f.companyId));
  if (f.source) conditions.push(eq(errorEvents.source, f.source));
  if (f.level) conditions.push(eq(errorEvents.level, f.level));
  if (f.since) conditions.push(gte(errorEvents.createdAt, f.since));
  if (f.jobId) conditions.push(sql`${errorEvents.context}->>'jobId' = ${f.jobId}`);

  const q = f.q?.trim();
  if (q) {
    const pattern = `%${escapeLike(q)}%`;
    conditions.push(
      or(
        ilike(errorEvents.message, pattern),
        sql`${errorEvents.context}->>'path' ILIKE ${pattern}`
      )
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listErrorEvents(f: ErrorFilters = {}): Promise<ErrorListResult> {
  const limit = clampLimit(f.limit);
  const offset = clampOffset(f.offset);
  const where = errorWhere(f);

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: errorEvents.id,
        level: errorEvents.level,
        source: errorEvents.source,
        message: errorEvents.message,
        stack: errorEvents.stack,
        context: errorEvents.context,
        companyId: errorEvents.companyId,
        createdAt: errorEvents.createdAt,
      })
      .from(errorEvents)
      .where(where)
      .orderBy(desc(errorEvents.createdAt), desc(errorEvents.id))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(errorEvents).where(where),
  ]);

  return {
    events: rows.map((row) => ({
      id: row.id,
      level: row.level as ErrorLevel,
      source: row.source as ErrorSource,
      message: row.message,
      stack: row.stack,
      context:
        row.context && typeof row.context === "object" && !Array.isArray(row.context)
          ? (row.context as Record<string, unknown>)
          : null,
      companyId: row.companyId,
      createdAt: row.createdAt.toISOString(),
    })),
    total: Number(totals[0]?.n ?? 0),
    limit,
    offset,
  };
}

interface CrawlJobActivityRow {
  id: string;
  companyId: string;
  companyName: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  selected: number;
  crawled: number;
  docs: number;
  failed: number;
  snapshotId: string | null;
}

interface SnapshotActivityRow {
  id: string;
  companyId: string;
  companyName: string;
  status: string;
  createdAt: Date;
  version: number;
  pageCount: number | null;
}

/**
 * Derived activity trail: crawl jobs + snapshots, newest first.
 *
 * Merge-based paging is exact because both inputs are fully filtered and sorted
 * before merging, then the window is sliced. Each input is capped at
 * `offset + limit + 1`, which is enough for any element in the merged window.
 */
export async function listActivity(f: ActivityFilters = {}): Promise<ActivityListResult> {
  const limit = clampLimit(f.limit);
  const offset = clampOffset(f.offset);
  const cap = offset + limit + 1;

  const q = f.q?.trim();
  const pattern = q ? `%${escapeLike(q)}%` : null;

  const wantJobs = f.kind !== "snapshot";
  const wantSnapshots = f.kind !== "crawl_job";

  const jobsWhere = and(
    f.companyId ? eq(crawlJobs.companyId, f.companyId) : undefined,
    f.status ? eq(crawlJobs.status, f.status) : undefined,
    f.since ? gte(crawlJobs.createdAt, f.since) : undefined,
    pattern ? ilike(companies.name, pattern) : undefined
  );

  const snapshotsWhere = and(
    f.companyId ? eq(companySnapshots.companyId, f.companyId) : undefined,
    f.status ? eq(companySnapshots.status, f.status) : undefined,
    f.since ? gte(companySnapshots.createdAt, f.since) : undefined,
    pattern ? ilike(companies.name, pattern) : undefined
  );

  const [jobRows, snapshotRows, jobTotals, snapshotTotals] = await Promise.all([
    wantJobs
      ? db
          .select({
            id: crawlJobs.id,
            companyId: crawlJobs.companyId,
            companyName: companies.name,
            status: crawlJobs.status,
            createdAt: crawlJobs.createdAt,
            updatedAt: crawlJobs.updatedAt,
            selected: crawlJobs.selected,
            crawled: crawlJobs.crawled,
            docs: crawlJobs.docs,
            failed: crawlJobs.failed,
            snapshotId: crawlJobs.snapshotId,
          })
          .from(crawlJobs)
          .innerJoin(companies, eq(crawlJobs.companyId, companies.id))
          .where(jobsWhere)
          .orderBy(desc(crawlJobs.createdAt), desc(crawlJobs.id))
          .limit(cap)
      : Promise.resolve([] as CrawlJobActivityRow[]),
    wantSnapshots
      ? db
          .select({
            id: companySnapshots.id,
            companyId: companySnapshots.companyId,
            companyName: companies.name,
            status: companySnapshots.status,
            createdAt: companySnapshots.createdAt,
            version: companySnapshots.version,
            pageCount: companySnapshots.pageCount,
          })
          .from(companySnapshots)
          .innerJoin(companies, eq(companySnapshots.companyId, companies.id))
          .where(snapshotsWhere)
          .orderBy(desc(companySnapshots.createdAt), desc(companySnapshots.id))
          .limit(cap)
      : Promise.resolve([] as SnapshotActivityRow[]),
    wantJobs
      ? db
          .select({ n: count() })
          .from(crawlJobs)
          .innerJoin(companies, eq(crawlJobs.companyId, companies.id))
          .where(jobsWhere)
      : Promise.resolve([{ n: 0 }]),
    wantSnapshots
      ? db
          .select({ n: count() })
          .from(companySnapshots)
          .innerJoin(companies, eq(companySnapshots.companyId, companies.id))
          .where(snapshotsWhere)
      : Promise.resolve([{ n: 0 }]),
  ]);

  const jobs: ActivityEvent[] = jobRows.map((row) => ({
    id: row.id,
    kind: "crawl_job",
    companyId: row.companyId,
    companyName: row.companyName,
    status: row.status,
    at: row.createdAt.toISOString(),
    detail: {
      selected: row.selected,
      crawled: row.crawled,
      docs: row.docs,
      failed: row.failed,
      snapshotId: row.snapshotId,
      updatedAt: row.updatedAt.toISOString(),
    },
  }));

  const snapshots: ActivityEvent[] = snapshotRows.map((row) => ({
    id: row.id,
    kind: "snapshot",
    companyId: row.companyId,
    companyName: row.companyName,
    status: row.status,
    at: row.createdAt.toISOString(),
    detail: {
      version: row.version,
      pageCount: row.pageCount,
    },
  }));

  const merged = [...jobs, ...snapshots].sort(
    (a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)
  );

  return {
    events: merged.slice(offset, offset + limit),
    total: Number(jobTotals[0]?.n ?? 0) + Number(snapshotTotals[0]?.n ?? 0),
    limit,
    offset,
  };
}
