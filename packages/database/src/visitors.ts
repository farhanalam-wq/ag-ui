/**
 * Visitors module read queries (spec §9.1): the conversations list, the
 * transcript bundle, and rating intake. Owned-company scoping is the caller's
 * responsibility (route-policy + requireCompany); every query here filters by
 * companyId. No PII: visitor identity is the cookieless session/visitor hash.
 */

import { and, asc, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { db, conversations, messages, sessions, messageFeedback, leads } from "./index";

export interface ConversationListFilters {
  companyId: string;
  limit: number;
  offset: number;
  since?: Date;
  until?: Date;
  /** Host page path prefix match, like page_views.path. */
  path?: string;
  /** ILIKE over message content. */
  search?: string;
  /** Only conversations containing at least one rating of this kind. */
  rating?: number; // 1 | -1
}

export interface ConversationListRow {
  id: string;
  title: string;
  path: string | null;
  /** "text" chat or "voice" call transcript. */
  channel: string;
  createdAt: Date;
  messageCount: number;
  lastMessageAt: Date | null;
  ratingUp: number;
  ratingDown: number;
  device: string | null;
  browser: string | null;
  os: string | null;
}

/**
 * Paged conversation index for the Visitors list. Correlated scalar subqueries
 * keep one filter definition for both count and rows; feedback is sparse (one
 * row per rated message) so per-row subqueries stay cheap at page size.
 */
export async function listVisitorConversations(
  filters: ConversationListFilters
): Promise<{ rows: ConversationListRow[]; total: number }> {
  const conds = [eq(conversations.companyId, filters.companyId)];
  if (filters.since) conds.push(gte(conversations.createdAt, filters.since));
  if (filters.until) conds.push(lte(conversations.createdAt, filters.until));
  if (filters.path) conds.push(ilike(conversations.path, `${filters.path}%`));
  if (filters.search) {
    conds.push(
      sql`exists (
        select 1 from ${messages}
        where ${messages.conversationId} = ${conversations.id}
          and ${messages.content} ilike ${`%${filters.search}%`}
      )`
    );
  }
  if (filters.rating !== undefined) {
    conds.push(
      sql`exists (
        select 1 from ${messageFeedback}
        where ${messageFeedback.conversationId} = ${conversations.id}
          and ${messageFeedback.rating} = ${filters.rating}
      )`
    );
  }
  const where = and(...conds);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(where);
  const total = totalRow?.count ?? 0;
  if (total === 0) return { rows: [], total: 0 };

  const rows = (await db
    .select({
      id: conversations.id,
      title: conversations.title,
      path: conversations.path,
      channel: conversations.channel,
      createdAt: conversations.createdAt,
      messageCount: sql<number>`(select count(*)::int from ${messages}
        where ${messages.conversationId} = ${conversations.id})`,
      lastMessageAt: sql<Date | null>`(select max(${messages.createdAt}) from ${messages}
        where ${messages.conversationId} = ${conversations.id})`,
      ratingUp: sql<number>`(select count(*)::int from ${messageFeedback}
        where ${messageFeedback.conversationId} = ${conversations.id}
          and ${messageFeedback.rating} = 1)`,
      ratingDown: sql<number>`(select count(*)::int from ${messageFeedback}
        where ${messageFeedback.conversationId} = ${conversations.id}
          and ${messageFeedback.rating} = -1)`,
      device: sql<string | null>`max(${sessions.device})`,
      browser: sql<string | null>`max(${sessions.browser})`,
      os: sql<string | null>`max(${sessions.os})`,
    })
    .from(conversations)
    .leftJoin(
      sessions,
      and(
        eq(sessions.companyId, conversations.companyId),
        eq(sessions.sessionHash, conversations.sessionHash)
      )
    )
    .where(where)
    .groupBy(conversations.id)
    .orderBy(desc(conversations.createdAt))
    .limit(Math.min(filters.limit, 200))
    .offset(filters.offset)) as ConversationListRow[];

  return { rows, total };
}

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  evidence: Array<{
    sourceId?: string;
    url?: string;
    pageTitle?: string;
    snippet?: string;
    type?: string;
    score?: number | null;
  }> | null;
  meta: Record<string, unknown> | null;
  rating: number | null;
}

export interface TranscriptBundle {
  conversation: {
    id: string;
    title: string;
    path: string | null;
    channel: string;
    createdAt: Date;
    sessionHash: string | null;
    visitorHash: string | null;
  };
  session: {
    startedAt: Date | null;
    endedAt: Date | null;
    pageviewCount: number | null;
    device: string | null;
    browser: string | null;
    os: string | null;
    tzOffset: number | null;
    converted: boolean | null;
    revenue: string | null;
  } | null;
  messages: TranscriptMessage[];
}

/**
 * One conversation, fully resolved: ordered transcript with evidence and
 * ratings, plus the visit context resolved through the cookieless session
 * hash.
 */
export async function getVisitorTranscriptBundle(
  companyId: string,
  conversationId: string
): Promise<TranscriptBundle | null> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.companyId, companyId)))
    .limit(1);
  if (!conversation) return null;

  let session: TranscriptBundle["session"] = null;
  if (conversation.sessionHash) {
    const [row] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.companyId, companyId),
          eq(sessions.sessionHash, conversation.sessionHash)
        )
      )
      .orderBy(desc(sessions.startedAt))
      .limit(1);
    session = row
      ? {
          startedAt: row.startedAt,
          endedAt: row.endedAt,
          pageviewCount: row.pageviewCount,
          device: row.device,
          browser: row.browser,
          os: row.os,
          tzOffset: row.tzOffset,
          converted: row.converted,
          revenue: row.revenue,
        }
      : null;
  }

  const msgRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt), asc(messages.id));

  const ratingsById = new Map<string, number>();
  if (msgRows.length > 0) {
    const feedback = await db
      .select({ messageId: messageFeedback.messageId, rating: messageFeedback.rating })
      .from(messageFeedback)
      .where(
        and(
          eq(messageFeedback.conversationId, conversationId),
          inArray(
            messageFeedback.messageId,
            msgRows.map((m) => m.id)
          )
        )
      );
    for (const f of feedback) ratingsById.set(f.messageId, f.rating);
  }

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
      path: conversation.path,
      channel: conversation.channel,
      createdAt: conversation.createdAt,
      sessionHash: conversation.sessionHash,
      visitorHash: conversation.visitorHash,
    },
    session,
    messages: msgRows.map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt,
      evidence: (m.evidence as TranscriptMessage["evidence"]) ?? null,
      meta: (m.meta as Record<string, unknown>) ?? null,
      rating: ratingsById.get(m.id) ?? null,
    })),
  };
}

const RATING_VALUES = new Set([1, -1]);

/**
 * Rate (or explicitly re-rate) one message. Returns the stored rating, or
 * null when the message/conversation do not exist or fall outside the
 * company scope. Ratings replace, never stack.
 */export async function rateVisitorMessage(opts: {
  companyId: string;
  conversationId: string;
  messageId: string;
  rating: number; // 1 | -1
}): Promise<number | null> {
  if (!RATING_VALUES.has(opts.rating)) return null;

  const [conv] = await db
    .select({ companyId: conversations.companyId })
    .from(conversations)
    .where(eq(conversations.id, opts.conversationId))
    .limit(1);
  if (!conv || conv.companyId !== opts.companyId) return null;

  const [msg] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(eq(messages.id, opts.messageId), eq(messages.conversationId, opts.conversationId))
    )
    .limit(1);
  if (!msg) return null;

  await db
    .insert(messageFeedback)
    .values({
      messageId: opts.messageId,
      companyId: opts.companyId,
      conversationId: opts.conversationId,
      rating: opts.rating,
    })
    .onConflictDoUpdate({
      target: messageFeedback.messageId,
      set: { rating: opts.rating },
    });
  return opts.rating;
}

// ---------------------------------------------------------------------------
// Leads (spec §9.2): the docket list, the status pipeline, the drawer detail.
// Owner scope is the caller's responsibility; every query filters companyId.

export interface VisitorLeadFilters {
  companyId: string;
  limit: number;
  offset: number;
  status?: string; // "NEW" | "QUALIFIED" | "CONTACTED" | "DISMISSED"
  /** ILIKE over contact name/email/phone/first message. */
  search?: string;
  /** Value present in tech_stack or extra_tags (jsonb containment). */
  tag?: string;
  since?: Date;
  until?: Date;
}

/** Legal status transitions for the docket pipeline. DISMISSED is terminal. */
export const LEAD_STATUS_TRANSITIONS: Record<string, string[]> = {
  NEW: ["QUALIFIED", "CONTACTED", "DISMISSED"],
  QUALIFIED: ["CONTACTED", "DISMISSED"],
  CONTACTED: ["DISMISSED"],
  DISMISSED: [],
};

const LEAD_STATUSES = Object.keys(LEAD_STATUS_TRANSITIONS);

export interface VisitorLeadRow {
  id: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  bant: Record<string, string | null>;
  techStack: string[];
  extraTags: string[];
  status: string;
  confidence: number | null;
  firstMessage: string | null;
  conversationId: string | null;
  conversationTitle: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Paged lead docket for the Visitors list. */
export async function listVisitorLeads(
  filters: VisitorLeadFilters
): Promise<{ rows: VisitorLeadRow[]; total: number }> {
  const conds = [eq(leads.companyId, filters.companyId)];
  if (filters.status && LEAD_STATUSES.includes(filters.status)) {
    conds.push(eq(leads.status, filters.status));
  }
  if (filters.since) conds.push(gte(leads.createdAt, filters.since));
  if (filters.until) conds.push(lte(leads.createdAt, filters.until));
  if (filters.search) {
    const needle = `%${filters.search}%`;
    const predicate = or(
      ilike(leads.contactName, needle),
      ilike(leads.email, needle),
      ilike(leads.phone, needle),
      ilike(leads.firstMessage, needle)
    );
    if (predicate) conds.push(predicate);
  }
  if (filters.tag) {
    // jsonb containment: the tag may sit in the tech stack or the extractor
    // tags (competitors etc). Postgres `@>` with the string as both sides.
    conds.push(
      sql`(
        ${leads.techStack} @> ${JSON.stringify([filters.tag])}::jsonb
        or ${leads.extraTags} @> ${JSON.stringify([filters.tag])}::jsonb
      )`
    );
  }
  const where = and(...conds);

  const [totalRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(leads)
    .where(where);
  const total = totalRow?.count ?? 0;
  if (total === 0) return { rows: [], total: 0 };

  const rows = (await db
    .select({
      id: leads.id,
      contactName: leads.contactName,
      email: leads.email,
      phone: leads.phone,
      bant: leads.bant,
      techStack: leads.techStack,
      extraTags: leads.extraTags,
      status: leads.status,
      confidence: leads.confidence,
      firstMessage: leads.firstMessage,
      conversationId: leads.conversationId,
      conversationTitle: conversations.title,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .leftJoin(conversations, eq(conversations.id, leads.conversationId))
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(Math.min(filters.limit, 200))
    .offset(filters.offset)) as VisitorLeadRow[];

  return {
    rows: rows.map((r) => ({
      ...r,
      // numeric comes back as string over the wire
      confidence: r.confidence === null ? null : Number(r.confidence),
      bant: (r.bant ?? {}) as Record<string, string | null>,
      techStack: (r.techStack ?? []) as string[],
      extraTags: (r.extraTags ?? []) as string[],
    })),
    total,
  };
}

export type LeadStatusUpdateResult =
  | { kind: "updated"; lead: VisitorLeadRow }
  | { kind: "invalid"; message: string }
  | { kind: "not-found" };

/**
 * Move one lead through the docket pipeline. Transitions are validated
 * against LEAD_STATUS_TRANSITIONS (a same-status write is a no-op update,
 * not a rejection — double-saves read as idempotent).
 */
export async function updateVisitorLeadStatus(opts: {
  companyId: string;
  leadId: string;
  status: string;
}): Promise<LeadStatusUpdateResult> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, opts.leadId), eq(leads.companyId, opts.companyId)))
    .limit(1);
  if (!lead) return { kind: "not-found" };

  const allowed = LEAD_STATUS_TRANSITIONS[lead.status] ?? [];
  if (opts.status === lead.status) {
    return { kind: "updated", lead: toLeadRow(lead) };
  }
  if (!LEAD_STATUSES.includes(opts.status)) {
    return { kind: "invalid", message: `Unknown status ${opts.status}` };
  }
  if (!allowed.includes(opts.status)) {
    return {
      kind: "invalid",
      message: `Cannot move a lead from ${lead.status} to ${opts.status}`,
    };
  }

  const [updated] = await db
    .update(leads)
    .set({ status: opts.status, updatedAt: new Date() })
    .where(eq(leads.id, opts.leadId))
    .returning();
  return { kind: "updated", lead: toLeadRow(updated) };
}

function toLeadRow(row: typeof leads.$inferSelect): VisitorLeadRow {
  return {
    id: row.id,
    contactName: row.contactName,
    email: row.email,
    phone: row.phone,
    bant: (row.bant ?? {}) as Record<string, string | null>,
    techStack: (row.techStack ?? []) as string[],
    extraTags: (row.extraTags ?? []) as string[],
    status: row.status,
    // numeric comes back as string over the wire
    confidence: row.confidence === null ? null : Number(row.confidence),
    firstMessage: row.firstMessage,
    conversationId: row.conversationId,
    conversationTitle: null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface VisitorLeadDetail extends VisitorLeadRow {
  conversation: { id: string; title: string; path: string | null } | null;
}

/** The drawer payload: full lead plus the owning conversation for deep links. */
export async function getVisitorLeadDetail(
  companyId: string,
  leadId: string
): Promise<VisitorLeadDetail | null> {
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.companyId, companyId)))
    .limit(1);
  if (!lead) return null;

  let conversation: VisitorLeadDetail["conversation"] = null;
  if (lead.conversationId) {
    const [conv] = await db
      .select({ id: conversations.id, title: conversations.title, path: conversations.path })
      .from(conversations)
      .where(eq(conversations.id, lead.conversationId))
      .limit(1);
    conversation = conv ?? null;
  }

  return { ...toLeadRow(lead), conversation };
}
