import type { ComponentType } from "react";
import { SEMANTIC_ICON_MAP, type SemanticIconEntry } from "./semantic-map";
import { getCategoryFallback } from "./registry";

export interface ResolvedIcon {
  query: string;
  slug: string;
  displayName: string;
  category: string;
  hex?: string;
  svg?: string;
  variants?: Record<string, string>;
  isFallback: boolean;
  FallbackComponent: ComponentType<any>;
}

const NOISE_WORDS = [
  "sdk",
  "api",
  "client",
  "driver",
  "connector",
  "language",
  "database",
  "db",
  "cloud",
  "service",
  "services",
  "framework",
  "runtime",
  "library",
  "tool",
  "platform",
  "protocol",
  "integration",
  "container",
  "containers",
  "payment",
  "payments",
  "engine",
  "system",
  "suite",
  "app",
  "apps",
  "backend",
  "frontend",
  "inc",
  "corp",
  "llc",
  "ltd",
  "technologies",
  "solutions",
];

/**
 * Normalizes input strings by trimming, lowercasing, and stripping noise terms.
 */
export function normalizeIconQuery(input: string): string {
  if (!input) return "";
  let query = input.toLowerCase().trim();

  // Strip common noisy prefixes/suffixes (e.g. "official python sdk" -> "python")
  query = query.replace(/^official\s+/i, "");
  query = query.replace(/^apache\s+/i, "");

  // Remove common words at end or middle if matched
  for (const word of NOISE_WORDS) {
    const regexEnd = new RegExp(`[\\s\\-_]+${word}$`, "i");
    if (regexEnd.test(query)) {
      query = query.replace(regexEnd, "").trim();
    }
    const regexStart = new RegExp(`^${word}[\\s\\-_]+`, "i");
    if (regexStart.test(query)) {
      query = query.replace(regexStart, "").trim();
    }
  }

  return query;
}

/**
 * Infers category when no exact mapping is found.
 */
function inferCategory(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("sql") || q.includes("db") || q.includes("data") || q.includes("store")) {
    return "database";
  }
  if (q.includes("cloud") || q.includes("host") || q.includes("server") || q.includes("infra")) {
    return "cloud";
  }
  if (q.includes("auth") || q.includes("sec") || q.includes("shield") || q.includes("cert") || q.includes("gov")) {
    return "security";
  }
  if (q.includes("pay") || q.includes("bill") || q.includes("card") || q.includes("stripe") || q.includes("express")) {
    return "saas";
  }
  if (q.includes("http") || q.includes("rest") || q.includes("grpc") || q.includes("soap") || q.includes("net")) {
    return "protocol";
  }
  return "general";
}

/**
 * Resolves a natural language or technical query into a display name, category,
 * and deterministic Phosphor fallback. Brand-SVG resolution was removed
 * with the icon package; the semantic map preserves names/categories, and every
 * path ends at `getCategoryFallback` so icons never suspend on network.
 */
export function resolveIcon(input: string): ResolvedIcon {
  if (!input || typeof input !== "string") {
    return {
      query: "",
      slug: "unknown",
      displayName: "Unknown",
      category: "general",
      isFallback: true,
      FallbackComponent: getCategoryFallback("general"),
    };
  }

  const raw = input.trim();
  const rawLower = raw.toLowerCase();

  // 1. Check exact raw match in semantic map
  let entry: SemanticIconEntry | undefined = SEMANTIC_ICON_MAP[rawLower];

  // 2. If not found, normalize and check again in semantic map
  if (!entry) {
    const normalized = normalizeIconQuery(rawLower);
    entry = SEMANTIC_ICON_MAP[normalized];
  }

  // 3. Semantic-map hit: keep its display name/category, render the fallback.
  // (No slug-registry lookup: brand SVGs were removed, so every known tech
  // renders its category fallback with full name context preserved.)
  if (entry) {
    return {
      query: raw,
      slug: entry.slug,
      displayName: entry.displayName,
      category: entry.category || inferCategory(raw),
      isFallback: true,
      FallbackComponent: getCategoryFallback(entry.category || inferCategory(raw)),
    };
  }

  // Completely unknown / abstract phrase (e.g. "Cloud Architecture", "Enterprise AI"): deterministic fallback
  const inferredCat = inferCategory(raw);
  const fallbackPrettyName = raw
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    query: raw,
    slug: "unknown",
    displayName: fallbackPrettyName || "Technology",
    category: inferredCat,
    isFallback: true,
    FallbackComponent: getCategoryFallback(inferredCat),
  };
}
