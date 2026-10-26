import { Worker } from "bullmq";
import { and, asc, desc, eq, sql } from "@ag-ui/database";
import { QUEUE_NAMES, redisConnection, type ConversationEnrichJobData } from "@ag-ui/queues";
import {
  db,
  conversations,
  leads,
  messages,
  recordError,
} from "@ag-ui/database";
import {
  extractLeadFromConversation,
  logger,
  type CompetitorMention,
  type LeadExtraction,
} from "@ag-ui/shared";

/**
 * Post-chat derived-data pass (fires after the SSE generator persists the
 * assistant message). One pass, two artifacts:
 *   1. Lead extraction → `leads` (upsert/merge on (company, lower(email)),
 *      or per-conversation when no email was shared).
 *   2. Competitor mention tagging → `messages.meta.competitors`.
 *
 * Never blocks the chat stream: the enqueue is fire-and-forget and every
 * failure lands in the error ledger under source "worker".
 */

/** Cap the transcript sent to extraction; long conversations tail off anyway. */
const MAX_TRANSCRIPT_MESSAGES = 40;

/** Below this, an extraction is considered empty and inserts nothing. */
const MIN_LEAD_CONFIDENCE = 0.5;

async function loadContext(companyId: string, conversationId: string) {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
    .limit(1);
  return conversation ?? null;
}

/** True when every user turn in the transcript has already been enriched. */
async function alreadyEnriched(conversationId: string): Promise<boolean> {
  const rows = await db
    .select({ meta: messages.meta, role: messages.role })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  const userTurns = rows.filter((r) => r.role === "user");
  return userTurns.length > 0 && userTurns.every((r) => {
    const meta = (r.meta ?? {}) as Record<string, unknown>;
    return meta["extraction_ran"] === true;
  });
}

function hasLeadSignals(e: LeadExtraction): boolean {
  const bant = Object.values(e.bant).some((v) => v !== null);
  return Boolean(e.email || e.phone || e.contact_name || bant);
}

function unionTags(a: unknown, b: string[]): string[] {
  const list = Array.isArray(a) ? (a as unknown[]).map(String) : [];
  return Array.from(new Set([...list, ...b])).slice(0, 20);
}

function unionCompetitors(a: unknown, b: CompetitorMention[]): CompetitorMention[] {
  const list = Array.isArray(a) ? (a as CompetitorMention[]) : [];
  const map = new Map<string, CompetitorMention>();
  for (const c of [...list, ...b]) {
    if (c?.name && !map.has(c.name.toLowerCase())) map.set(c.name.toLowerCase(), c);
  }
  return [...map.values()].slice(0, 10);
}

async function upsertLead(
  companyId: string,
  conversationId: string,
  firstMessage: string | null,
  extraction: LeadExtraction
) {
  // Dedupe priority: per-company email (functional index), else per conversation.
  let [existing] = extraction.email
    ? await db
        .select()
        .from(leads)
        .where(
          and(eq(leads.companyId, companyId), sql`lower(${leads.email}) = ${extraction.email.toLowerCase()}`)
        )
        .limit(1)
    : await db
        .select()
        .from(leads)
        .where(and(eq(leads.companyId, companyId), eq(leads.conversationId, conversationId)))
        .limit(1);

  const bant = { ...(existing?.bant ?? {}) } as Record<string, string | null>;
  for (const [k, v] of Object.entries(extraction.bant)) {
    if (v !== null && bant[k] == null) bant[k] = v;
  }

  if (existing) {
    await db
      .update(leads)
      .set({
        contactName: existing.contactName ?? extraction.contact_name,
        email: existing.email ?? extraction.email,
        phone: existing.phone ?? extraction.phone,
        bant,
        techStack: unionTags(existing.techStack, extraction.tech_stack),
        extraTags: unionTags(existing.extraTags, extraction.competitors.map((c) => c.name)),
        conversationId: existing.conversationId ?? conversationId,
        confidence:
          existing.confidence !== null && Number(existing.confidence) > extraction.confidence
            ? existing.confidence
            : String(extraction.confidence),
        updatedAt: new Date(),
      })
      .where(eq(leads.id, existing.id));
    return { action: "updated" as const, id: existing.id };
  }

  const [inserted] = await db
    .insert(leads)
    .values({
      companyId,
      conversationId,
      contactName: extraction.contact_name,
      email: extraction.email,
      phone: extraction.phone,
      bant: extraction.bant,
      techStack: extraction.tech_stack,
      extraTags: extraction.competitors.map((c) => c.name),
      firstMessage: firstMessage?.slice(0, 500) ?? null,
      confidence: String(extraction.confidence),
    })
    .returning();
  return { action: "created" as const, id: inserted.id };
}

async function tagCompetitors(conversationId: string, mentions: CompetitorMention[]): Promise<void> {
  if (mentions.length === 0) return;
  const [lastUser] = await db
    .select({ id: messages.id, meta: messages.meta })
    .from(messages)
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!lastUser) return;
  const meta = (lastUser.meta ?? {}) as Record<string, unknown>;
  await db
    .update(messages)
    .set({
      meta: {
        ...meta,
        competitors: unionCompetitors(meta["competitors"], mentions),
      },
    })
    .where(eq(messages.id, lastUser.id));
}

/** Mark all user turns of the conversation as extraction-processed. */
async function markEnriched(conversationId: string): Promise<void> {
  await db
    .update(messages)
    .set({ meta: sql`jsonb_set(coalesce(${messages.meta}, '{}'::jsonb), '{extraction_ran}', 'true'::jsonb)` })
    .where(and(eq(messages.conversationId, conversationId), eq(messages.role, "user")));
}

export const chatEnrichWorker = new Worker<ConversationEnrichJobData>(
  QUEUE_NAMES.CHAT_ENRICH,
  async (job) => {
    const { companyId, conversationId, widgetKeyId, engine } = job.data;
    logger.info(`[CHAT ENRICH WORKER] Starting conversation ${conversationId} (job ${job.id})`);

    const conversation = await loadContext(companyId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}`);

    if (await alreadyEnriched(conversationId)) {
      logger.info(`[CHAT ENRICH WORKER] ${conversationId} already enriched, skipping`);
      return { status: "skipped" };
    }

    const rows = await db
      .select({ role: messages.role, content: messages.content, meta: messages.meta })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt))
      .limit(MAX_TRANSCRIPT_MESSAGES);
    if (rows.length < 2) {
      logger.info(`[CHAT ENRICH WORKER] ${conversationId} has no full turn — skipping`);
      await markEnriched(conversationId);
      return { status: "skipped" };
    }

    // Extract (over the whole visible transcript so cumulative context builds
    // dossiers across turns). No OPENAI_API_KEY → null → code below treats the
    // conversation as processed without inserting anything.
    const firstUser = rows.find((r) => r.role === "user");
    const extraction = await extractLeadFromConversation(
      rows.map((r) => ({ role: r.role as "user" | "assistant", content: r.content }))
    );

    let leadResult: { action: "created" | "updated"; id: string } | null = null;
    if (extraction && hasLeadSignals(extraction) && extraction.confidence >= MIN_LEAD_CONFIDENCE) {
      leadResult = await upsertLead(companyId, conversationId, firstUser?.content ?? null, extraction);
      logger.info(
        `[CHAT ENRICH WORKER] Lead ${leadResult.action}: ${leadResult.id} (conv ${conversationId})`
      );
    }

    await tagCompetitors(conversationId, extraction?.competitors ?? []);
    await markEnriched(conversationId);

    logger.info(`[CHAT ENRICH WORKER] Completed ${conversationId}`);
    return {
      status: "enriched",
      lead: leadResult,
      competitors: extraction?.competitors.length ?? 0,
    };
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

chatEnrichWorker.on("failed", (job, err) => {
  logger.error(`[CHAT ENRICH WORKER] Job ${job?.id} failed: ${err.message}`);
  void recordError({
    source: "worker",
    message: err.message,
    stack: err instanceof Error ? err.stack : undefined,
    context: { jobId: job?.id, queue: QUEUE_NAMES.CHAT_ENRICH, stage: "chat-enrich" },
    companyId: null,
  });
});

logger.info(`Chat enrich worker listening on Redis queue: ${QUEUE_NAMES.CHAT_ENRICH}`);
