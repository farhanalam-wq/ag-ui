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
 *   5. voice: create a channel-marked conversation, save a transcript through
 *      the same gate, verify docket visibility + one-save idempotency
 *   6. leads: real enrich passes over seeded conversations (offered-contact
 *      capture, same-email merge, phone-only), pipeline PATCH walk + illegal
 *      back-edge, capture events recorded exactly once
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
  widgetKeyDomains,
  leads,
  webhookEvents,
  normalizeOrigin,
  and,
  eq,
  desc,
  sql,
} from "../packages/database/src/index";
import { generateWidgetKey } from "../packages/shared/src/widget-key";
// The identical enrichment pass the queue handler runs — Bun resolves its
// bare imports by file location (workers/worker/node_modules), so this is
// safe from a root script.
import { enrichConversation } from "../workers/worker/src/chat-enrich-worker";
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
  .where(sql`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id})`)
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
const [keyRow] = await db
  .insert(widgetKeys)
  .values({
    companyId: conv.companyId,
    keyHash: generated.hash,
    keyPrefix: generated.prefix,
    label: "smoke-visitors",
  })
  .returning();
check("minted widget key", true, generated.prefix);

// 1b. Allowlist the dev origin so gated routes (voice) accept us — the
// deny-by-default gate is itself part of the behavior under test.
await db.insert(widgetKeyDomains).values({
  keyId: keyRow.id,
  origin: normalizeOrigin(new URL(API).origin),
});
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

// ---- Voice: channel-marked conversations + transcript persistence ----

// 1. The server creates this anyway at token mint; the smoke creates it
// directly so the gate does not depend on a VoiceKit provider being live.
const [voiceConv] = await db
  .insert(conversations)
  .values({
    companyId: conv.companyId,
    channel: "voice",
    path: "/pricing",
    sessionHash: conv.sessionHash,
    visitorHash: conv.visitorHash,
  })
  .returning();
const voiceLines = [
  { speaker: "user" as const, text: "how much for the plus plan?" },
  { speaker: "agent" as const, text: "the plus plan renews monthly — I don't have pricing grounded to quote." },
  { speaker: "user" as const, text: "just email me at voice-visitor@example.com when sales is in." },
];
const saveRes = await fetch(`${API}/api/voice/transcript`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(API).origin },
  body: JSON.stringify({
    widgetKey: generated.raw,
    conversation_id: voiceConv.id,
    lines: voiceLines,
  }),
});
check("voice transcript save", saveRes.ok, `status ${saveRes.status}`);
const voiceDetail = await (await fetch(`${API}/api/visitors/conversations/${voiceConv.id}`, {
  headers: { cookie },
})).json();
check(
  "voice transcript in detail",
  voiceDetail.messages?.length === voiceLines.length &&
    voiceDetail.conversation?.channel === "voice" &&
    voiceDetail.conversation?.title === "how much for the plus plan?",
  `channel ${voiceDetail.conversation?.channel}, title "${voiceDetail.conversation?.title}", lines ${voiceDetail.messages?.length}`
);
const voiceMsg = voiceDetail.messages?.[0];
check(
  "voice messages carry no evidence, engine meta",
  voiceMsg.evidence === null && voiceMsg.meta?.engine === "voice",
  JSON.stringify({ evidence: voiceMsg.evidence, engine: voiceMsg.meta?.engine })
);

// 2. Exactly one transcript per conversation.
const saveAgain = await fetch(`${API}/api/voice/transcript`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(API).origin },
  body: JSON.stringify({
    widgetKey: generated.raw,
    conversation_id: voiceConv.id,
    lines: voiceLines.slice(0, 1),
  }),
});
check("duplicate transcript rejected", saveAgain.status === 409, `status ${saveAgain.status}`);

// 3. A text conversation must not accept a transcript.
const textTranscript = await fetch(`${API}/api/voice/transcript`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: new URL(API).origin },
  body: JSON.stringify({
    widgetKey: generated.raw,
    conversation_id: conv.id,
    lines: voiceLines.slice(0, 1),
  }),
});
check("text conversation rejects transcript", textTranscript.status === 409, `status ${textTranscript.status}`);

// ---- Leads: capture via the real enrich pass, dedupe, pipeline PATCHes ----

const smokeEmail = `smoke-lead-${Date.now()}@example.com`;

/** Fresh conversation with a full turn; assistant reply satisfies the
 * two-message minimum the enrich pass requires. */
const seedLeadConversation = async (userText: string) => {
  const [c] = await db
    .insert(conversations)
    .values({ companyId: conv.companyId, title: "smoke lead seed" })
    .returning();
  await db.insert(messages).values([
    { conversationId: c.id, role: "user", content: userText },
    {
      conversationId: c.id,
      role: "assistant",
      content: "Thanks — our team will follow up with you shortly.",
    },
  ]);
  return c;
};

// 1. The visitor *offers* contact details to be contacted — the extractor's
// consent judgment is exactly what is under test here.
const emailConv = await seedLeadConversation(
  `Hi, I'm Dana — CTO at a small fintech. We're evaluating assistant tooling this quarter; contact me at ${smokeEmail} and I'll set up a call.`
);
const firstPass = await enrichConversation({ companyId: conv.companyId, conversationId: emailConv.id });
check("extraction pass ran", firstPass.status === "enriched", JSON.stringify(firstPass).slice(0, 120));

const [emailLead] = await db
  .select()
  .from(leads)
  .where(
    and(
      eq(leads.companyId, conv.companyId),
      sql`lower(${leads.email}) = ${smokeEmail}`
    )
  )
  .limit(1);
check(
  "lead captured from offered contact",
  Boolean(emailLead) && emailLead.status === "NEW" && Boolean(emailLead.id),
  JSON.stringify({ id: emailLead?.id, status: emailLead?.status })
);

// 1b. The capture moment was recorded exactly once.
const captureCountFor = async (leadId: string) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.eventType, "lead.captured"),
        sql`${webhookEvents.payload}->>'lead_id' = ${leadId}`
      )
    );
  return row?.count ?? 0;
};
check(
  "lead.captured recorded exactly once",
  emailLead && (await captureCountFor(emailLead.id)) === 1,
  emailLead ? String(await captureCountFor(emailLead.id)) : "no lead"
);

// 2. The same email offered again from a later conversation merges into the
// same row — no new lead, no second capture event. (Whatever the second pass
// decides about confidence, the row count may not grow.)
const mergeConv = await seedLeadConversation(
  `It's me again — anything sent to ${smokeEmail} reaches me, please use that address going forward.`
);
await enrichConversation({ companyId: conv.companyId, conversationId: mergeConv.id });
const [mergeRowcount] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(leads)
  .where(
    and(
      eq(leads.companyId, conv.companyId),
      sql`lower(${leads.email}) = ${smokeEmail}`
    )
  );
check(
  "same-email merge, no new lead row",
  emailLead && mergeRowcount?.count === 1 && (await captureCountFor(emailLead.id)) === 1,
  `rows ${mergeRowcount?.count}, events ${emailLead ? await captureCountFor(emailLead.id) : "n/a"}`
);

// 3. Phone-only lead: no email offered, phone offered. The email is the merge
// key, so a phone-only lead rows down per-conversation instead.
const phoneConv = await seedLeadConversation(
  "Call me on +1 (555) 010-2030 — I'm the one who signs off on tooling, and we need something live by February."
);
await enrichConversation({ companyId: conv.companyId, conversationId: phoneConv.id });
const [phoneLead] = await db
  .select()
  .from(leads)
  .where(
    and(
      eq(leads.companyId, conv.companyId),
      eq(leads.conversationId, phoneConv.id)
    )
  )
  .limit(1);
check(
  "phone-only lead captured",
  Boolean(phoneLead?.phone) && phoneLead?.email === null,
  JSON.stringify({ phone: phoneLead?.phone, email: phoneLead?.email })
);

// 3b. Re-running the identical pass is a no-op (the backfill idempotency).
const rerun = await enrichConversation({ companyId: conv.companyId, conversationId: phoneConv.id });
const [phoneRowCount] = await db
  .select({ count: sql<number>`count(*)::int` })
  .from(leads)
  .where(
    and(
      eq(leads.companyId, conv.companyId),
      eq(leads.conversationId, phoneConv.id)
    )
  );
check(
  "re-enrich is a no-op",
  rerun.status === "skipped" && phoneRowCount?.count === 1,
  `pass ${JSON.stringify(rerun)}, rows ${phoneRowCount?.count}`
);

// 4. Pipeline PATCHes over HTTP: the legal ladder walk end to end.
const appOrigin = process.env.APP_URL ?? "http://localhost:3000";
const patchLead = (status: string) =>
  fetch(`${API}/api/visitors/leads/${emailLead.id}`, {
    method: "PATCH",
    headers: {
      cookie,
      "Content-Type": "application/json",
      Origin: appOrigin,
    },
    body: JSON.stringify({ status }),
  });

if (!emailLead) throw new Error("cannot exercise pipeline without a lead");
const walk: Array<[string, number]> = [
  ["QUALIFIED", 200],
  ["CONTACTED", 200],
  ["DISMISSED", 200],
];
for (const [status, expected] of walk) {
  const res = await patchLead(status);
  const body = await res.json();
  check(
    `legal move -> ${status}`,
    res.status === expected && body.lead?.status === status,
    `status ${res.status}, lead ${body.lead?.status}, ${body.error ?? ""}`
  );
}

// 4b. The terminal state bites back: DISMISSED accepts nothing.
const backEdge = await patchLead("NEW");
check(
  "illegal back-edge 422s",
  backEdge.status === 422,
  `status ${backEdge.status}, ${JSON.stringify(await backEdge.json())}`
);

// 5. Detail route + list visibility.
const leadDetail = await fetch(`${API}/api/visitors/leads/${emailLead.id}`, {
  headers: { cookie },
});
const leadDetailBody = await leadDetail.json();
check(
  "lead detail route",
  leadDetail.ok &&
    leadDetailBody.lead?.status === "DISMISSED" &&
    Boolean(leadDetailBody.company),
  `status ${leadDetail.status}, company ${Boolean(leadDetailBody.company)}`
);
const leadsList = await fetch(
  `${API}/api/visitors/leads?companyId=${conv.companyId}&status=DISMISSED`,
  { headers: { cookie } }
);
const leadsListBody = await leadsList.json();
check(
  "leads list filters by status",
  leadsList.ok &&
    leadsListBody.leads?.some((l: any) => l.id === emailLead.id) &&
    leadsListBody.leads?.every((l: any) => l.status === "DISMISSED"),
    `status ${leadsList.status}, total ${leadsListBody.total}`
);

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
