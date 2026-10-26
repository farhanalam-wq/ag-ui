/**
 * scripts/benchmark-retrieval.ts
 *
 * Benchmark tool for measuring Qdrant vector retrieval, PostgreSQL hydration,
 * MMR diversification, and Redis hot/cold cache performance.
 *
 * Usage:
 *   bun scripts/benchmark-retrieval.ts --owner <email|id> <domain> "<question>"
 *
 * Example:
 *   bun scripts/benchmark-retrieval.ts --owner demo@ag-ui.local resend.com "What are the pricing tiers?"
 */

import { retrieveCompanyContext, closeRedisConnection } from "../packages/database/src/index";
import { invalidateCompanyContextCache } from "../packages/database/src/cache";
import {
  CliOwnerError,
  findOwnedCompanyByDomain,
  positionalArgs,
  requireOwner,
} from "./cli-owner";

async function main() {
  const owner = await requireOwner(process.argv);
  const [domain, question] = positionalArgs(process.argv);
  const query = question || "What are the main products, services, and pricing?";

  if (!domain) {
    console.log("Usage: bun scripts/benchmark-retrieval.ts --owner <email|id> <domain> [\"question\"]");
    console.log("Example: bun scripts/benchmark-retrieval.ts --owner demo@ag-ui.local resend.com \"What are the pricing tiers?\"");
    process.exit(1);
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();

  console.log(`\n======================================================`);
  console.log(` RETRIEVAL & VECTOR SEARCH BENCHMARK`);
  console.log(` Owner:  ${owner.email} (${owner.id})`);
  console.log(` Domain: ${cleanDomain}`);
  console.log(` Query:  "${query}"`);
  console.log(`======================================================\n`);

  const company = await findOwnedCompanyByDomain(owner.id, cleanDomain);

  if (!company) {
    console.error(`[ERROR] Company '${cleanDomain}' not found for owner ${owner.email}.`);
    console.log(
      `Run ingestion first: bun ingest-cli.ts https://${cleanDomain} --owner ${owner.email} --limit 10 --yes`
    );
    process.exit(1);
  }

  // Step 1: Invalidate cache to guarantee true cold benchmark
  console.log(`[1/3] Flushing Redis context cache for ${company.name} to benchmark cold latency...`);
  await invalidateCompanyContextCache(company.id);

  // Step 2: Cold Retrieval
  console.log(`[2/3] Executing COLD retrieval (Embedding + Qdrant Top-20 + PG Hydration + MMR)...`);
  const t0 = performance.now();
  const coldCtx = await retrieveCompanyContext(company.id, query);
  const coldMs = (performance.now() - t0).toFixed(1);

  console.log(`  -> Cold Latency:   ${coldMs} ms`);
  console.log(`  -> Chunks Hydrated: ${coldCtx.chunks.length} (capped to top-6 via MMR)`);
  console.log(`  -> Evidence Items:  ${coldCtx.evidence.length}`);
  console.log(`  -> Prompt Length:   ${coldCtx.compiledPromptContext.length} characters\n`);

  // Step 3: Hot Retrieval
  console.log(`[3/3] Executing HOT retrieval (Redis qctx:v1 cache hit)...`);
  const t1 = performance.now();
  const hotCtx = await retrieveCompanyContext(company.id, query);
  const hotMs = (performance.now() - t1).toFixed(1);

  const speedup = (parseFloat(coldMs) / Math.max(0.1, parseFloat(hotMs))).toFixed(1);
  console.log(`  -> Hot Latency:    ${hotMs} ms`);
  console.log(`  -> Cache Speedup:   ${speedup}x faster\n`);

  console.log(`------------------------------------------------------`);
  console.log(`TOP DIVERSIFIED CHUNKS (MMR Lambda=0.7):`);
  console.log(`------------------------------------------------------`);
  coldCtx.chunks.forEach((chunk, idx) => {
    const sim = (chunk.similarity * 100).toFixed(1);
    console.log(`[${idx + 1}] (${sim}%) ${chunk.documentTitle}`);
    console.log(`    URL:     ${chunk.documentUrl}`);
    console.log(`    Content: ${chunk.content.slice(0, 140).replace(/\n/g, " ")}...\n`);
  });

  console.log(`======================================================`);
  console.log(`BENCHMARK SUMMARY:`);
  console.log(`  Cold: ${coldMs} ms | Hot: ${hotMs} ms | Speedup: ${speedup}x`);
  console.log(`======================================================\n`);

  await closeRedisConnection();
  process.exit(0);
}

main().catch(async (err) => {
  if (err instanceof CliOwnerError) {
    console.error(`[FATAL] ${err.message}`);
  } else {
    console.error("[FATAL BENCHMARK ERROR]:", err);
  }
  await closeRedisConnection();
  process.exit(1);
});
