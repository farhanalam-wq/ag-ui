/**
 * scripts/clean-url.ts
 *
 * Pre-test helper: check whether a URL is present in the DB, and if so
 * remove the data. Otherwise just inform the user.
 *
 * Scope (per user choice): Postgres + Qdrant + Redis, whole company/snapshot
 * delete, normalized URL matching, standalone script.
 *
 * Usage:
 *   bun scripts/clean-url.ts <url> [--yes] [--dry-run] [--verbose]
 *   bun scripts/clean-url.ts https://example.com/blog --dry-run
 *   bun scripts/clean-url.ts https://example.com --yes
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadDotEnv() {
  try {
    const p = join(process.cwd(), ".env");
    if (!existsSync(p)) return;
    const raw = readFileSync(p, "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const idx = t.indexOf("=");
      const k = t.slice(0, idx).trim();
      let v = t.slice(idx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // best-effort only
  }
}
loadDotEnv();

import { normalizeUrl } from "../packages/crawler/src/discovery";
import {
  db,
  client as pgClient,
  companies,
  companySnapshots,
  documents,
  chunks,
  facts,
  crawlJobs,
  brands,
  eq,
  or,
  inArray,
  getRedisClient,
  closeRedisConnection,
  invalidateCompanyContextCache,
} from "../packages/database/src/index";

interface CleanOpts {
  url: string;
  yes: boolean;
  dryRun: boolean;
  verbose: boolean;
}

function printHelp() {
  console.log(`
clean-url — check if a test URL is present in the DB, delete if so.

Usage:
  bun scripts/clean-url.ts <url> [--yes] [--dry-run] [--verbose]

What it does:
  1. Normalizes the URL (strips hash, tracking params, trailing slash).
  2. Checks Postgres (companies by domain/origin + documents by URL variants),
     Qdrant (company_chunks points by company_id / url payload),
     Redis (qctx + frontier keys for the owning company/jobs).
  3. If present anywhere: deletes the WHOLE company + snapshots/documents/
     chunks/vectors/cache for that domain (cascade). Otherwise just informs.

Options:
  --yes        Skip confirmation prompt, delete immediately
  --dry-run    Only report what would be deleted, change nothing
  --verbose    Print sample matching document URLs/titles
  --help       Show this help

Examples:
  bun scripts/clean-url.ts https://example.com --dry-run
  bun scripts/clean-url.ts https://example.com/blog/post --yes
`);
}

function parseArgs(argv: string[]): { url: string | null; opts: CleanOpts } {
  const args = argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }
  const has = (n: string) => args.includes(n);
  const positional = args.find((a) => !a.startsWith("--")) ?? null;
  return {
    url: positional,
    opts: {
      url: positional ?? "",
      yes: has("--yes"),
      dryRun: has("--dry-run"),
      verbose: has("--verbose"),
    },
  };
}

/** Build normalized URL variants so stored forms all match. */
function buildUrlVariants(rawInput: string): { domain: string; origin: string; normalized: string; variants: string[] } {
  let target = rawInput.trim();
  if (!target.startsWith("http://") && !target.startsWith("https://")) target = "https://" + target;
  const base = new URL(target);
  const domain = base.hostname.replace(/^www\./, "").toLowerCase();
  const origin = `${base.protocol}//${base.hostname}`;
  const norm = normalizeUrl(target, base) ?? target.replace(/#.*$/, "").replace(/\/$/, "");
  const set = new Set<string>();
  set.add(norm);
  set.add(norm.replace(/\/$/, ""));
  set.add(norm + (norm.endsWith("/") ? "" : "/"));
  // www / non-www twin of the normalized URL
  try {
    const u = new URL(norm);
    const twinHost = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    const twin = new URL(u.toString());
    twin.hostname = twinHost;
    set.add(twin.toString().replace(/\/$/, ""));
  } catch {
    // ignore
  }
  set.add(origin);
  set.add(origin + "/");
  return { domain, origin, normalized: norm, variants: [...set].filter(Boolean) };
}

// ---------------------------------------------------------- qdrant ---

function qdrantBase(): string {
  return (process.env.QDRANT_URL || "http://localhost:6333").replace(/\/+$/, "");
}
function qdrantHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.QDRANT_API_KEY) h["api-key"] = process.env.QDRANT_API_KEY;
  return h;
}

async function qdrantCount(filter: unknown): Promise<number | null> {
  try {
    const res = await fetch(`${qdrantBase()}/collections/company_chunks/points/count`, {
      method: "POST",
      headers: qdrantHeaders(),
      body: JSON.stringify({ filter, exact: true }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any;
    return typeof data?.result?.count === "number" ? data.result.count : null;
  } catch {
    return null;
  }
}

async function qdrantScrollSample(filter: unknown, limit = 5): Promise<string[]> {
  try {
    const res = await fetch(`${qdrantBase()}/collections/company_chunks/points/scroll`, {
      method: "POST",
      headers: qdrantHeaders(),
      body: JSON.stringify({ filter, limit, with_payload: true, with_vector: false }),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const pts: any[] = data?.result?.points ?? [];
    return pts.map((p) => String(p?.payload?.url ?? p?.id ?? "?"));
  } catch {
    return [];
  }
}

async function qdrantDelete(filter: unknown): Promise<boolean> {
  const res = await fetch(`${qdrantBase()}/collections/company_chunks/points/delete?wait=true`, {
    method: "POST",
    headers: qdrantHeaders(),
    body: JSON.stringify({ filter }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Qdrant delete failed (HTTP ${res.status}): ${t.slice(0, 300)}`);
  }
  return true;
}

// ------------------------------------------------------------ redis ---

async function scanKeys(pattern: string): Promise<string[]> {
  const r = await getRedisClient();
  if (!r) return [];
  const out: string[] = [];
  let cursor = "0";
  do {
    const [next, keys] = await r.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = next;
    if (keys?.length) out.push(...keys);
  } while (cursor !== "0");
  return out;
}

async function delKeys(keys: string[]): Promise<number> {
  if (keys.length === 0) return 0;
  const r = await getRedisClient();
  if (!r) return 0;
  for (let i = 0; i < keys.length; i += 500) {
    await r.del(...keys.slice(i, i + 500));
  }
  return keys.length;
}

function describeDbError(err: any): string {
  if (!err) return "unknown error";
  // postgres-js raises AggregateError wrapping connection failures.
  const inner = Array.isArray(err?.errors) ? err.errors.map((e: any) => e?.message || String(e)).join("; ") : null;
  if (inner) return inner.slice(0, 400);
  if (err?.message) return String(err.message).slice(0, 400);
  try {
    return JSON.stringify(err).slice(0, 400);
  } catch {
    return String(err).slice(0, 400);
  }
}

async function main() {
  const { url, opts } = parseArgs(process.argv);
  if (!url) {
    printHelp();
    process.exit(1);
  }
  const { domain, origin, normalized, variants } = buildUrlVariants(url);
  console.log(`[CLEAN] input=${url}`);
  console.log(`[CLEAN] domain=${domain} origin=${origin}`);
  console.log(`[CLEAN] normalized=${normalized}`);

  if (process.env.RUNTIME_ENV === "production" && !opts.dryRun) {
    console.log("[CLEAN] WARNING: RUNTIME_ENV=production — whole-company delete. Use --dry-run first or confirm carefully.");
  }

  // ---- Postgres presence ----
  let companyRows: typeof companies.$inferSelect[] = [];
  try {
    companyRows = await db
      .select()
      .from(companies)
      .where(or(eq(companies.domain, domain), eq(companies.url, origin), eq(companies.url, origin + "/")));
  } catch (err: any) {
    throw new Error(
      `[CLEAN] Cannot reach Postgres at ${process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/ag_ui"}. Start it with 'docker compose up -d postgres' then retry. (${describeDbError(err)})`
    );
  }
  const companyIds = companyRows.map((c) => c.id);

  let snapshotIds: string[] = [];
  let docCount = 0;
  let chunkCount = 0;
  let factCount = 0;
  let jobCount = 0;
  let brandCount = 0;
  let docSamples: { url: string; title: string }[] = [];
  let docUrlHits = 0;

  if (companyIds.length > 0) {
    const snaps = await db.select().from(companySnapshots).where(inArray(companySnapshots.companyId, companyIds));
    snapshotIds = snaps.map((s) => s.id);
    if (snapshotIds.length > 0) {
      const docs = await db.select().from(documents).where(inArray(documents.snapshotId, snapshotIds));
      docCount = docs.length;
      docUrlHits = docs.filter((d) => variants.includes(d.url)).length;
      docSamples = docs.slice(0, 10).map((d) => ({ url: d.url, title: d.title }));
      if (docs.length > 0) {
        const docIds = docs.map((d) => d.id);
        for (let i = 0; i < docIds.length; i += 500) {
          const slice = docIds.slice(i, i + 500);
          const ch = await db.select({ id: chunks.id }).from(chunks).where(inArray(chunks.documentId, slice));
          chunkCount += ch.length;
        }
      }
      const f = await db.select({ id: facts.id }).from(facts).where(inArray(facts.snapshotId, snapshotIds));
      factCount = f.length;
    }
    const jobs = await db.select().from(crawlJobs).where(inArray(crawlJobs.companyId, companyIds));
    jobCount = jobs.length;
    const br = await db.select().from(brands).where(inArray(brands.companyId, companyIds));
    brandCount = br.length;
  }

  // Orphan page-URL check (documents stored without matching company domain row).
  if (docUrlHits === 0 && variants.length > 0) {
    try {
      const hits = await db.select().from(documents).where(inArray(documents.url, variants));
      if (hits.length > 0) {
        docUrlHits = hits.length;
        docCount += hits.length;
        if (docSamples.length === 0) docSamples = hits.slice(0, 10).map((d) => ({ url: d.url, title: d.title }));
      }
    } catch {
      // ignore — inArray on large variant list is best-effort
    }
  }

  // ---- Qdrant presence ----
  let qdrantByCompany: number | null = null;
  let qdrantByUrl: number | null = null;
  let qdrantSample: string[] = [];
  if (companyIds.length > 0) {
    qdrantByCompany = await qdrantCount({ must: [{ key: "company_id", match: { value: companyIds[0] } }] });
    if ((qdrantByCompany ?? 0) > 0) qdrantSample = await qdrantScrollSample({ must: [{ key: "company_id", match: { value: companyIds[0] } }] });
  }
  qdrantByUrl = await qdrantCount({ should: variants.slice(0, 10).map((v) => ({ key: "url", match: { value: v } })) });
  if ((qdrantByUrl ?? 0) > 0 && qdrantSample.length === 0) {
    qdrantSample = await qdrantScrollSample({ should: variants.slice(0, 10).map((v) => ({ key: "url", match: { value: v } })) });
  }
  const qdrantReachable = qdrantByCompany !== null || qdrantByUrl !== null;

  // ---- Redis presence ----
  const redisAvailable = (await getRedisClient()) !== null;
  let ctxKeys: string[] = [];
  let frontierKeys: string[] = [];
  if (redisAvailable && companyIds.length > 0) {
    for (const cid of companyIds) ctxKeys.push(...(await scanKeys(`qctx:v1:${cid}:*`)));
    const jobs = await db.select({ id: crawlJobs.id }).from(crawlJobs).where(inArray(crawlJobs.companyId, companyIds));
    for (const j of jobs) frontierKeys.push(...(await scanKeys(`frontier:${j.id}:*`)));
  }

  const pgPresent = companyIds.length > 0 || docCount > 0 || docUrlHits > 0;
  const qdrantPresent = (qdrantByCompany ?? 0) > 0 || (qdrantByUrl ?? 0) > 0;
  const redisPresent = ctxKeys.length > 0 || frontierKeys.length > 0;
  const presentAnywhere = pgPresent || qdrantPresent || redisPresent;

  console.log(`
[CLEAN] presence report for ${normalized}:
  Postgres: ${pgPresent ? "FOUND" : "not present"} (companies=${companyIds.length} snapshots=${snapshotIds.length} docs=${docCount} urlHits=${docUrlHits} chunks=${chunkCount} facts=${factCount} jobs=${jobCount} brands=${brandCount})
  Qdrant:   ${!qdrantReachable ? "unreachable" : qdrantPresent ? "FOUND" : "not present"} (byCompany=${qdrantByCompany ?? "?"} byUrl=${qdrantByUrl ?? "?"})
  Redis:    ${!redisAvailable ? "unavailable" : redisPresent ? "FOUND" : "not present"} (qctxKeys=${ctxKeys.length} frontierKeys=${frontierKeys.length})`);
  if (opts.verbose && docSamples.length > 0) {
    console.log("  Sample documents:");
    for (const s of docSamples) console.log(`    - ${s.title} ${s.url}`);
  }
  if (opts.verbose && qdrantSample.length > 0) {
    console.log("  Sample Qdrant urls:");
    for (const s of qdrantSample) console.log(`    - ${s}`);
  }

  if (!presentAnywhere) {
    console.log(`\n[CLEAN] URL not present in DB — nothing to remove. Safe to run your test for ${normalized}.`);
    return;
  }

  console.log(`\n[CLEAN] URL IS present — whole company/snapshot data exists for domain ${domain}.`);

  if (opts.dryRun) {
    console.log("[CLEAN] --dry-run: no changes made. Re-run without --dry-run to delete.");
    return;
  }

  if (!opts.yes) {
    const rl = readline.createInterface({ input, output });
    const ans = await rl.question(`Delete ALL data for domain ${domain} (companies=${companyIds.length} docs=${docCount} qdrant~${qdrantByCompany ?? qdrantByUrl ?? "?"} redisKeys=${ctxKeys.length + frontierKeys.length})? [y/N]: `);
    rl.close();
    if (ans.trim().toLowerCase() !== "y" && ans.trim().toLowerCase() !== "yes") {
      console.log("[CLEAN] Aborted by user — nothing deleted.");
      process.exit(2);
    }
  }

  // ---- Delete: Qdrant first (vectors), then Postgres (cascade), then Redis ----
  if (qdrantReachable && (companyIds.length > 0 || qdrantPresent)) {
    try {
      for (const cid of companyIds) {
        await qdrantDelete({ must: [{ key: "company_id", match: { value: cid } }] });
        console.log(`[CLEAN] Qdrant: deleted points for company_id=${cid}`);
      }
      if (companyIds.length === 0 && qdrantPresent) {
        await qdrantDelete({ should: variants.slice(0, 10).map((v) => ({ key: "url", match: { value: v } })) });
        console.log("[CLEAN] Qdrant: deleted orphan points by url filter");
      }
    } catch (err: any) {
      console.error(`[CLEAN] Qdrant delete failed (continuing with Postgres): ${err.message}`);
    }
  }

  if (companyIds.length > 0) {
    await db.delete(companies).where(inArray(companies.id, companyIds));
    console.log(`[CLEAN] Postgres: deleted ${companyIds.length} companie(s) for domain ${domain} (snapshots/documents/chunks cascade)`);
  } else if (docUrlHits > 0) {
    await db.delete(documents).where(inArray(documents.url, variants));
    console.log(`[CLEAN] Postgres: deleted ${docUrlHits} orphan document(s) by URL (chunks cascade)`);
  }

  if (redisAvailable) {
    let removed = 0;
    for (const cid of companyIds) removed += await invalidateCompanyContextCache(cid);
    removed += await delKeys([...ctxKeys, ...frontierKeys].filter((k, i, a) => a.indexOf(k) === i));
    // invalidateCompanyContextCache already deleted ctxKeys; delKeys covers leftovers + frontier
    console.log(`[CLEAN] Redis: cleared ~${removed} cached key(s)`);
  }

  console.log(`\n[CLEAN] Done — data for ${normalized} removed. Safe to re-run your test.`);
}

try {
  await main();
  process.exit(0);
} catch (err: any) {
  console.error("[CLEAN:FATAL]", describeDbError(err));
  process.exit(1);
} finally {
  try {
    await closeRedisConnection();
  } catch {
    // ignore
  }
  try {
    await (pgClient as any).end?.();
  } catch {
    // ignore
  }
}
