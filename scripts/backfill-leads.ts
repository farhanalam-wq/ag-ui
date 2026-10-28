/**
 * Dev-only backfill: runs the identical enrichment pass the chat-enrich
 * worker runs over existing conversations, so the leads docket and competitor
 * tags can be populated from history without waiting for fresh chats.
 *
 * Idempotent by construction: the worker's `extraction_ran` meta flags skip
 * already-enriched conversations, so re-running is a no-op. Dev/local only.
 *
 *   cd workers/worker && bun --env-file=../../.env ../../scripts/backfill-leads.ts
 *
 * Scope one company:  REQUIRED_COMPANY_ID=<uuid> before the command.
 */

import { db, conversations, sql } from "../packages/database/src/index";
// Bun resolves imports by file location: the worker file's own bare imports
// resolve through workers/worker/node_modules, so this import is safe here.
import { enrichConversation } from "../workers/worker/src/chat-enrich-worker";

const buckets = new Map<
  string,
  { created: number; enriched: number; skipped: number; failed: number }
>();
const bump = (companyId: string, key: "created" | "enriched" | "skipped" | "failed") => {
  const row = buckets.get(companyId) ?? { created: 0, enriched: 0, skipped: 0, failed: 0 };
  row[key] += 1;
  buckets.set(companyId, row);
};

// Optional scope: REQUIRED_COMPANY_ID to backfill one company only.
const scopedCompanyId = process.env.REQUIRED_COMPANY_ID || null;

const convs = await db
  .select({ id: conversations.id, companyId: conversations.companyId })
  .from(conversations)
  .where(
    // Conversations with at least one user turn; enrichConversation skips the
    // rest anyway — this keeps the candidate list small.
    sql`exists (
      select 1 from messages m
      where m.conversation_id = ${conversations.id} and m.role = 'user'
    )`
  )
  .orderBy(conversations.createdAt);
const scoped = scopedCompanyId
  ? convs.filter((c) => c.companyId === scopedCompanyId)
  : convs;

console.log(
  `backfill: ${scoped.length} conversation(s)${
    scopedCompanyId ? ` (company ${scopedCompanyId} scoped from ${convs.length})` : ""
  }`
);

for (const c of scoped) {
  try {
    const result = await enrichConversation({ companyId: c.companyId, conversationId: c.id });
    if (result.status === "enriched") {
      bump(c.companyId, result.lead?.action === "created" ? "created" : "enriched");
    } else {
      bump(c.companyId, "skipped");
    }
  } catch (err) {
    bump(c.companyId, "failed");
    console.error(`  ✗ ${c.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

for (const [companyIdKey, row] of buckets) {
  console.log(
    `company ${companyIdKey}: ${row.created} leads created, ${row.enriched} enriched, ${row.skipped} skipped, ${row.failed} failed`
  );
}
console.log("backfill done");
process.exit(0);
