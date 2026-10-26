/**
 * Dev-only smoke for the rating + conversation read endpoints, run against a
 * live API on :3001 (dev DB). Relative imports on purpose — bun resolves
 * workspace deps by file location, so workspace-style imports only work from
 * inside a workspace's own files.
 *
 * Flow:
 *   1. pick the newest conversation + its latest message
 *   2. mint a throwaway widget key for that company
 *   3. POST /api/embed/:key/rate  (rate, re-rate replacing it, cross-company
 *      scoped id must 404)
 *   4. owner session -> GET /api/visitors/conversations + /:id
 *
 *   cd apps/api && bun --env-file=../../.env ../../scripts/smoke-visitors.ts
 */

import {
  db,
  companies,
  conversations,
  messageFeedback,
  messages,
  authSessions,
  widgetKeys,
  eq,
  desc,
} from "../packages/database/src/index";
import { generateWidgetKey } from "../packages/shared/src/widget-key";
import { createHash, randomBytes } from "node:crypto";

const API = process.env.API_ORIGIN ?? "http://localhost:3001";
let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

const [conv] = await db
  .select()
  .from(conversations)
  .orderBy(desc(conversations.createdAt))
  .limit(1);
if (!conv) throw new Error("no conversations exist");
check("seed conversation", true, conv.id);

const [msg] = await db
  .select()
  .from(messages)
  .where(eq(messages.conversationId, conv.id))
  .orderBy(desc(messages.createdAt))
  .limit(1);
if (!msg) throw new Error("conversation has no messages");

// 1. Mint a throwaway key for the conversation's company.
const generated = generateWidgetKey();
await db.insert(widgetKeys).values({
  companyId: conv.companyId,
  keyHash: generated.hash,
  keyPrefix: generated.prefix,
  label: "smoke-visitors",
});
check("minted widget key", true, generated.prefix);

// 2. Rate it.
const rate = async (conversationId: string, rating: 1 | -1) =>
  (
    await fetch(`${API}/api/embed/${generated.raw}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: conversationId,
        message_id: msg.id,
        rating,
      }),
    })
  ).json();

const first = await rate(conv.id, 1);
check("rate up", Boolean(first.rated), JSON.stringify(first));
const second = await rate(conv.id, -1);
check("re-rate replaces", second.rated === true && second.rating === -1, JSON.stringify(second));
const foreign = await rate("00000000-0000-4000-8000-000000000000", 1);
check("foreign conversation 404s", Boolean((foreign as any).error), JSON.stringify(foreign));

const [stored] = await db
  .select()
  .from(messageFeedback)
  .where(eq(messageFeedback.messageId, msg.id))
  .orderBy(desc(messageFeedback.createdAt))
  .limit(1);
check("feedback row stored", stored?.rating === -1, String(stored?.rating));

// 3. Owner session.
const [company] = await db
  .select()
  .from(companies)
  .where(eq(companies.id, conv.companyId))
  .limit(1);
if (!company) throw new Error("conversation company missing");
const token = randomBytes(32).toString("base64url");
await db.insert(authSessions).values({
  userId: company.ownerId,
  tokenHash: createHash("sha256").update(token).digest("hex"),
  expiresAt: new Date(Date.now() + 24 * 3600_000),
  ip: "127.0.0.1",
  userAgent: "smoke",
});
const cookie = `ag_session=${token}`;

const listRes = await fetch(
  `${API}/api/visitors/conversations?companyId=${conv.companyId}`,
  { headers: { cookie } }
);
const listBody = await listRes.json();
check(
  "list route",
  listRes.ok && Array.isArray(listBody.conversations),
  `status ${listRes.status}, total ${listBody.total ?? "?"}`
);
const listed = listBody.conversations?.find((r: any) => r.id === conv.id);
check(
  "list row aggregates",
  Boolean(listed && listed.ratingDown >= 1 && listed.messageCount >= 1),
  JSON.stringify({ ratingDown: listed?.ratingDown, messageCount: listed?.messageCount })
);

const detailRes = await fetch(`${API}/api/visitors/conversations/${conv.id}`, {
  headers: { cookie },
});
const detailBody = await detailRes.json();
check(
  "detail route",
  detailRes.ok && Array.isArray(detailBody.messages) && detailBody.company,
  `status ${detailRes.status}, messages ${detailBody.messages?.length ?? "?"}`
);
const ratedMsg = detailBody.messages?.find((m: any) => m.id === msg.id);
check("detail rating joins", ratedMsg?.rating === -1, String(ratedMsg?.rating));

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
