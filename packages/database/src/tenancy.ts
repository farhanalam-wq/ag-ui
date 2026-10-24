/**
 * Tenant ownership resolution.
 *
 * This is the only module allowed to decide whether a user owns a row. Route
 * handlers must call these helpers instead of hand-rolling
 * `eq(companies.ownerId, ...)`, so a missing owner filter has one obvious place
 * to be fixed and one obvious place to review.
 *
 * Every helper validates ids before touching Postgres: a malformed uuid is a
 * `null` (the route layer maps that to 422/404), never a database error.
 *
 * See docs/auth-tenancy.md §5.5 and §10.2.
 */

import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { companies, conversations, crawlJobs, widgetKeys } from "./schema";

/** Loose Postgres uuid shape. Version/variant bits are not constrained. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Normalise a domain the way `POST /api/companies` stores it. */
export function normalizeCompanyDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

export type CompanyRow = typeof companies.$inferSelect;
export type ConversationRow = typeof conversations.$inferSelect;
export type CrawlJobRow = typeof crawlJobs.$inferSelect;
export type TenantWidgetKeyRow = typeof widgetKeys.$inferSelect;

export interface OwnedConversation {
  conversation: ConversationRow;
  company: CompanyRow;
}

export interface OwnedCrawlJob {
  job: CrawlJobRow;
  company: CompanyRow;
}

export interface OwnedWidgetKey {
  key: TenantWidgetKeyRow;
  company: CompanyRow;
}

/**
 * Resolve a company only when `ownerId` matches. Returns the full row so the
 * caller does not have to re-query it (and cannot accidentally re-query it
 * without the owner predicate).
 */
export async function resolveOwnedCompany(
  userId: string,
  companyId: string
): Promise<CompanyRow | null> {
  if (!isUuid(userId) || !isUuid(companyId)) return null;

  const [row] = await db
    .select()
    .from(companies)
    .where(and(eq(companies.id, companyId), eq(companies.ownerId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Resolve `(ownerId, domain)`. Domains are unique per owner, never globally,
 * so two users may own the same domain without seeing each other's data.
 */
export async function resolveOwnedCompanyByDomain(
  userId: string,
  domain: string
): Promise<CompanyRow | null> {
  if (!isUuid(userId)) return null;

  const normalized = normalizeCompanyDomain(domain);
  if (!normalized) return null;

  const [row] = await db
    .select()
    .from(companies)
    .where(
      and(eq(companies.ownerId, userId), eq(companies.domain, normalized))
    )
    .limit(1);

  return row ?? null;
}

/** Conversation -> company -> owner. */
export async function resolveOwnedConversation(
  userId: string,
  conversationId: string
): Promise<OwnedConversation | null> {
  if (!isUuid(userId) || !isUuid(conversationId)) return null;

  const [row] = await db
    .select({ conversation: conversations, company: companies })
    .from(conversations)
    .innerJoin(companies, eq(companies.id, conversations.companyId))
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(companies.ownerId, userId)
      )
    )
    .limit(1);

  return row ?? null;
}

/** Crawl job -> company -> owner. */
export async function resolveOwnedCrawlJob(
  userId: string,
  jobId: string
): Promise<OwnedCrawlJob | null> {
  if (!isUuid(userId) || !isUuid(jobId)) return null;

  const [row] = await db
    .select({ job: crawlJobs, company: companies })
    .from(crawlJobs)
    .innerJoin(companies, eq(companies.id, crawlJobs.companyId))
    .where(and(eq(crawlJobs.id, jobId), eq(companies.ownerId, userId)))
    .limit(1);

  return row ?? null;
}

/** Widget key -> company -> owner. */
export async function resolveOwnedWidgetKey(
  userId: string,
  keyId: string
): Promise<OwnedWidgetKey | null> {
  if (!isUuid(userId) || !isUuid(keyId)) return null;

  const [row] = await db
    .select({ key: widgetKeys, company: companies })
    .from(widgetKeys)
    .innerJoin(companies, eq(companies.id, widgetKeys.companyId))
    .where(and(eq(widgetKeys.id, keyId), eq(companies.ownerId, userId)))
    .limit(1);

  return row ?? null;
}

/**
 * Key -> company without an ownership check. Only for surfaces that have
 * already authenticated the key itself (embed/voice) or for admin routes that
 * immediately follow up with `resolveOwnedCompany`.
 */
export async function companyIdForWidgetKey(
  keyId: string
): Promise<string | null> {
  if (!isUuid(keyId)) return null;

  const [row] = await db
    .select({ companyId: widgetKeys.companyId })
    .from(widgetKeys)
    .where(eq(widgetKeys.id, keyId))
    .limit(1);

  return row?.companyId ?? null;
}
