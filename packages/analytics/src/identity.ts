/**
 * packages/analytics/src/identity.ts
 *
 * Cookieless visitor identity. Raw IPs must never leave the collector edge:
 * hash here, store only the hash. The daily salt rotation bounds linkability
 * to ~24h while keeping same-day unique counting exact-enough via HLL.
 */

import { createHash, randomUUID } from "node:crypto";

/** UTC date salt, e.g. "2026-10-15". Pass explicitly in tests for determinism. */
export function dailySalt(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Stable same-day visitor fingerprint. Inputs are the raw client IP and
 * user-agent; the raw IP must not be stored anywhere downstream.
 */
export function hashVisitor(ip: string, userAgent: string, salt: string): string {
  const ua = (userAgent || "").trim().slice(0, 300).toLowerCase();
  return createHash("sha256").update(`${salt}|${ip.trim()}|${ua}`).digest("hex");
}

/** Client-side session id helper (snippet generates one per tab session). */
export function newSessionHash(): string {
  return randomUUID();
}

/** Queue-level dedup key for exactly-once ingestion (Redis SET NX window). */
export function dedupeKey(eventId: string): string {
  return `adedupe:${eventId}`;
}

/** 24h dedup window — covers beacon retries without growing Redis forever. */
export const DEDUPE_TTL_SECONDS = 86_400;

/** Redis HyperLogLog key for daily uniques per company. */
export function dailyUniquesKey(companyId: string, day: string): string {
  return `ahll:${companyId}:${day}`;
}
