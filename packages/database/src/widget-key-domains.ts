import { createHash } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "./index";
import { widgetKeyDomains, widgetKeys } from "./schema";
import { getRedisClient } from "./cache";

export const MAX_DOMAINS_PER_KEY = 50;
export const MAX_KEYS_PER_COMPANY = 20;
const ALLOWLIST_TTL_SECONDS = 60;

export class DomainValidationError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.field = field;
  }
}

/** Normalize to `scheme://host[:port]` (lowercased host, default ports stripped). */
export function normalizeOrigin(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new DomainValidationError("origin", "Origin is required");
  if (trimmed.length > 253) throw new DomainValidationError("origin", "Origin too long");
  if (trimmed.includes("*")) throw new DomainValidationError("origin", "Wildcards are not supported yet — add each origin exactly");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new DomainValidationError("origin", "Enter a valid origin like https://company.com");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new DomainValidationError("origin", "Only http(s) origins are allowed");
  }
  if (url.username || url.password) {
    throw new DomainValidationError("origin", "Origins must not include credentials");
  }
  if (!url.hostname) throw new DomainValidationError("origin", "Origin must include a host");
  const host = url.hostname.toLowerCase();
  const isDefaultPort =
    (url.protocol === "https:" && (url.port === "" || url.port === "443")) ||
    (url.protocol === "http:" && (url.port === "" || url.port === "80"));
  const port = isDefaultPort ? "" : url.port ? `:${url.port}` : "";
  if (host === "localhost" && !url.port) {
    throw new DomainValidationError("origin", "localhost needs an explicit port (e.g. http://localhost:3000)");
  }
  return `${url.protocol}//${host}${port}`;
}

/** Extract origin from an Origin or Referer header value. Null when absent/invalid. */
export function originFromHeader(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizePathList(paths: unknown, field: string): string[] {
  if (paths === undefined || paths === null) return field === "includePaths" ? ["/"] : [];
  if (!Array.isArray(paths)) throw new DomainValidationError(field, "Must be a JSON array of path prefixes");
  if (paths.length > 50) throw new DomainValidationError(field, "Max 50 entries");
  return paths.map((p) => {
    if (typeof p !== "string" || !p.startsWith("/") || p.includes("..")) {
      throw new DomainValidationError(field, "Each path must start with / and contain no ..");
    }
    return p;
  });
}

export interface DomainRow {
  id: string;
  keyId: string;
  origin: string;
  includePaths: string[];
  excludePaths: string[];
  createdAt: Date;
}

function toRow(r: typeof widgetKeyDomains.$inferSelect): DomainRow {
  return {
    id: r.id,
    keyId: r.keyId,
    origin: r.origin,
    includePaths: (r.includePaths as string[]) ?? ["/"],
    excludePaths: (r.excludePaths as string[]) ?? [],
    createdAt: r.createdAt,
  };
}

export async function getKeyCompanyId(keyId: string): Promise<string | null> {
  const [row] = await db.select({ companyId: widgetKeys.companyId }).from(widgetKeys).where(eq(widgetKeys.id, keyId)).limit(1);
  return row?.companyId ?? null;
}

export async function listDomainsByKey(keyId: string): Promise<DomainRow[]> {
  const rows = await db
    .select()
    .from(widgetKeyDomains)
    .where(eq(widgetKeyDomains.keyId, keyId))
    .orderBy(desc(widgetKeyDomains.createdAt))
    .limit(500);
  return rows.map(toRow);
}

export async function listDomainsByCompany(companyId: string): Promise<(DomainRow & { keyPrefix: string; label: string })[]> {
  const keys = await db
    .select({ id: widgetKeys.id, keyPrefix: widgetKeys.keyPrefix, label: widgetKeys.label })
    .from(widgetKeys)
    .where(eq(widgetKeys.companyId, companyId));
  if (keys.length === 0) return [];
  const rows = await db
    .select()
    .from(widgetKeyDomains)
    .where(
      inArray(
        widgetKeyDomains.keyId,
        keys.map((k) => k.id)
      )
    )
    .orderBy(desc(widgetKeyDomains.createdAt))
    .limit(500);
  const meta = new Map(keys.map((k) => [k.id, k]));
  return rows.map((r) => ({ ...toRow(r), keyPrefix: meta.get(r.keyId)?.keyPrefix ?? "", label: meta.get(r.keyId)?.label ?? "" }));
}

export async function addDomain(input: {
  keyId: string;
  origin: string;
  includePaths?: unknown;
  excludePaths?: unknown;
  createdBy?: string | null;
  createdIp?: string | null;
}): Promise<DomainRow> {
  const origin = normalizeOrigin(input.origin);
  const includePaths = normalizePathList(input.includePaths, "includePaths");
  const excludePaths = normalizePathList(input.excludePaths, "excludePaths");
  const existing = await db
    .select({ id: widgetKeyDomains.id })
    .from(widgetKeyDomains)
    .where(and(eq(widgetKeyDomains.keyId, input.keyId), eq(widgetKeyDomains.origin, origin)))
    .limit(1);
  if (existing.length > 0) {
    const dup: any = new Error("This origin is already allowlisted for this key");
    dup.code = "DUPLICATE";
    throw dup;
  }
  const count = await db
    .select({ id: widgetKeyDomains.id })
    .from(widgetKeyDomains)
    .where(eq(widgetKeyDomains.keyId, input.keyId));
  if (count.length >= MAX_DOMAINS_PER_KEY) {
    const err: any = new Error(`Max ${MAX_DOMAINS_PER_KEY} origins per key`);
    err.code = "LIMIT_REACHED";
    throw err;
  }
  let createdIp: string | null = null;
  if (input.createdIp) {
    createdIp = createHash("sha256").update(input.createdIp).digest("hex").slice(0, 32);
  }
  const [row] = await db
    .insert(widgetKeyDomains)
    .values({ keyId: input.keyId, origin, includePaths, excludePaths, createdBy: input.createdBy ?? null, createdIp })
    .returning();
  await invalidateAllowlistCache(input.keyId);
  return toRow(row);
}

export async function removeDomain(id: string): Promise<{ keyId: string } | null> {
  const [row] = await db.select().from(widgetKeyDomains).where(eq(widgetKeyDomains.id, id)).limit(1);
  if (!row) return null;
  await db.delete(widgetKeyDomains).where(eq(widgetKeyDomains.id, id));
  await invalidateAllowlistCache(row.keyId);
  return { keyId: row.keyId };
}

function allowlistCacheKey(keyId: string): string {
  return `allowlist:v1:${keyId}`;
}

export async function invalidateAllowlistCache(keyId: string): Promise<void> {
  try {
    const r = await getRedisClient();
    if (r) await r.del(allowlistCacheKey(keyId));
  } catch {
    // best-effort
  }
}

async function loadDomainsCached(keyId: string): Promise<DomainRow[] | null> {
  try {
    const r = await getRedisClient();
    if (!r) return null;
    const raw = await r.get(allowlistCacheKey(keyId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as DomainRow[];
  } catch {
    return null;
  }
}

async function saveDomainsCached(keyId: string, rows: DomainRow[]): Promise<void> {
  try {
    const r = await getRedisClient();
    if (!r) return;
    await r.set(allowlistCacheKey(keyId), JSON.stringify(rows), "EX", ALLOWLIST_TTL_SECONDS);
  } catch {
    // best-effort
  }
}

export type OriginCheck =
  | { allowed: true; mode: "open" | "listed" }
  | { allowed: false; reason: "forbidden_origin" | "forbidden_path" | "missing_origin" };

/**
 * Per-key origin gate. Zero rules = open. Mismatch never fails open;
 * DB errors propagate (500), never silent-allow.
 */
export async function assertOriginAllowed(
  keyId: string,
  request: Request,
  opts?: { enforcePaths?: boolean }
): Promise<OriginCheck> {
  const headerOrigin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const reqOrigin = originFromHeader(headerOrigin) ?? originFromHeader(referer);

  let domains = await loadDomainsCached(keyId);
  if (!domains) {
    domains = await listDomainsByKey(keyId);
    await saveDomainsCached(keyId, domains);
  }
  if (domains.length === 0) return { allowed: true, mode: "open" };
  if (!reqOrigin) return { allowed: false, reason: "missing_origin" };

  const match = domains.find((d) => d.origin === reqOrigin);
  if (!match) return { allowed: false, reason: "forbidden_origin" };

  if (opts?.enforcePaths !== false && referer) {
    try {
      const path = new URL(referer).pathname || "/";
      const included = match.includePaths.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`) || p === "/");
      const excluded = match.excludePaths.some((p) => p !== "" && (path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`)));
      if (!included || excluded) return { allowed: false, reason: "forbidden_path" };
    } catch {
      // unparseable referer path — origin already matched, allow
    }
  }
  return { allowed: true, mode: "listed" };
}

/** Strip query strings before logging referers (tokens/PII). */
export function safeRefererForLog(referer: string | null): string {
  if (!referer) return "-";
  try {
    const u = new URL(referer);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "-";
  }
}
