import type { ComponentType } from "react";
import { SEMANTIC_ICON_MAP, type SemanticIconEntry } from "./semantic-map";
import { CORE_ICONS, getCategoryFallback, type TheSvgIconModule } from "./registry";
import { findBestSlugMatch } from "./slug-index";

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
  if (q.includes("auth") || q.includes("sec") || q.includes("shield") || q.includes("cert")) {
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
 * Resolves a natural language or technical query into a local SVG icon or deterministic fallback.
 * Checks the semantic map first, then the comprehensive 7,412 @thesvg/icons registry.
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

  // 3. Check WHOLE query against comprehensive 7,412 slug index (exact, kebab, or normalized)
  // This MUST run before token splitting so multi-word brands like "American Express" match american-express instead of express
  let matchedSlug = entry?.slug || findBestSlugMatch(rawLower) || findBestSlugMatch(normalizeIconQuery(rawLower));

  // 4. Token-based fallback ONLY if the whole query did not match
  if (!matchedSlug && !entry) {
    const tokens = rawLower.split(/[\s\-_/.]+/).filter(Boolean);
    for (const token of tokens) {
      if (SEMANTIC_ICON_MAP[token]) {
        entry = SEMANTIC_ICON_MAP[token];
        matchedSlug = entry.slug;
        break;
      }
      const candidate = findBestSlugMatch(token);
      if (candidate) {
        matchedSlug = candidate;
        break;
      }
    }
  }

  const finalSlug = matchedSlug || rawLower.replace(/[^a-z0-9]/g, "");
  const iconModule: TheSvgIconModule | undefined = CORE_ICONS[finalSlug];

  // Instant synchronous hit in CORE_ICONS
  if (iconModule) {
    return {
      query: raw,
      slug: iconModule.slug,
      displayName: entry?.displayName || iconModule.title || raw,
      category: entry?.category || "general",
      hex: iconModule.hex ? `#${iconModule.hex}` : undefined,
      svg: iconModule.svg,
      variants: iconModule.variants,
      isFallback: false,
      FallbackComponent: getCategoryFallback(entry?.category || "general"),
    };
  }

  // Known slug in full 7,412 registry (can be loaded asynchronously by TechIcon)
  if (matchedSlug) {
    const prettyName = matchedSlug
      .split(/[\s_-]+/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");

    return {
      query: raw,
      slug: matchedSlug,
      displayName: entry?.displayName || prettyName,
      category: entry?.category || inferCategory(raw),
      isFallback: false,
      FallbackComponent: getCategoryFallback(entry?.category || inferCategory(raw)),
    };
  }

  // Completely unknown query: produce deterministic fallback
  const inferredCat = inferCategory(raw);
  const fallbackPrettyName = raw
    .split(/[\s_-]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return {
    query: raw,
    slug: finalSlug || "unknown",
    displayName: fallbackPrettyName || "Technology",
    category: inferredCat,
    isFallback: true,
    FallbackComponent: getCategoryFallback(inferredCat),
  };
}
