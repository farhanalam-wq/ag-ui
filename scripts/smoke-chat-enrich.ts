/**
 * End-to-end verification smoke for the chat-enrich pipeline (dev-only,
 * local-only).
 *
 *   bun scripts/smoke-chat-enrich.ts
 *
 * Inserts a synthetic conversation (with planted lead signals + competitor
 * mention) into an existing company, enqueues the enrichment job, and prints
 * the resulting `leads` row. Relative imports on purpose — bun resolves
 * workspace deps by file location, so workspace-style imports work here.
 */
import { randomUUID } from "node:crypto";
import { chatEnrichQueue } from "../packages/queues/src/index";
import {
  db,
  conversations,
  messages,
  leads,
  companies,
  eq,
  desc,
} from "../packages/database/src/index";

const [company] = await db.select().from(companies).limit(1);
if (!company) throw new Error("no companies");
console.log("smoke company:", company.id);

const template = "50 devs. budget around five thousand a month, roll out this quarter. use me as contact — %s or +1-555-010-2026. we are on Next.js and evaluating alongside Intercom.";

const [conv] = await db.insert(conversations).values({
  companyId: company.id,
  title: "enrich smoke " + randomUUID().slice(0, 8),
  path: "/pricing",
  sessionHash: "smoke-" + randomUUID(),
  visitorHash: "smoke-" + randomUUID(),
}).returning();

await db.insert(messages).values([
  { conversationId: conv.id, role: "user", content: "hey, what does your enterprise plan cost?" },
  { conversationId: conv.id, role: "assistant", content: "Our enterprise plan is custom priced. What's your team size?", meta: { top_similarity: 0.81, grounded: true, model: "gpt-4o-mini", latency_ms: 940, engine: "text", extraction_ran: true } },
  { conversationId: conv.id, role: "user", content: template.replace("%s", "priya+" + Date.now() + "@example-inc.com") },
]);

console.log("conversation:", conv.id);
await chatEnrichQueue.add("chat-enrich", {
  companyId: company.id,
  conversationId: conv.id,
  widgetKeyId: null,
  engine: "text",
});

for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const rows = await db.select().from(leads).where(eq(leads.companyId, company.id));
  const hit = rows.find((r) => r.conversationId === conv.id);
  if (hit) {
    console.log("LEAD:", JSON.stringify(hit, null, 2));
    const [lastUser] = await db.select().from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(desc(messages.createdAt)).limit(1);
    console.log("META:", JSON.stringify(lastUser.meta));
    process.exit(0);
  }
}
console.log("TIMEOUT: no lead row after 60s");
process.exit(1);
