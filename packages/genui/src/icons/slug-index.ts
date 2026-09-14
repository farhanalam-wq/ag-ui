import { ALL_SLUGS_TEXT } from "./slugs-data";

export const ALL_THE_SVG_SLUGS: string[] = ALL_SLUGS_TEXT.split(" ");
export const SLUG_SET: Set<string> = new Set(ALL_THE_SVG_SLUGS);

// Normalized alphanumeric lookup map (e.g. "redhat" -> "red-hat", "americanexpress" -> "american-express")
export const NORMALIZED_SLUG_MAP: Map<string, string> = new Map();

for (const s of ALL_THE_SVG_SLUGS) {
  const norm = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!NORMALIZED_SLUG_MAP.has(norm)) {
    NORMALIZED_SLUG_MAP.set(norm, s);
  }
}

// Common industry acronyms and corporate aliases
const COMMON_ALIASES: Record<string, string> = {
  amex: "american-express",
  aws: "aws",
  gcp: "googlecloud",
  azure: "azure",
  fb: "meta",
  facebook: "meta",
  ms: "microsoft",
  msft: "microsoft",
  pg: "postgresql",
  postgres: "postgresql",
  k8s: "kubernetes",
  rhel: "red-hat",
  redhat: "red-hat",
  rh: "red-hat",
};

/**
 * Finds the exact official @thesvg/icons slug for any query, casing, punctuation, or alias.
 */
export function findBestSlugMatch(query: string): string | null {
  if (!query) return null;
  const rawLower = query.toLowerCase().trim();

  // 1. Direct alias check
  if (COMMON_ALIASES[rawLower]) {
    return COMMON_ALIASES[rawLower];
  }

  // 2. Exact slug match in full 7,412 registry
  if (SLUG_SET.has(rawLower)) {
    return rawLower;
  }

  // 3. Kebab-cased match (e.g. "red hat" -> "red-hat", "american express" -> "american-express")
  const kebab = rawLower.replace(/[\s_]+/g, "-");
  if (SLUG_SET.has(kebab)) {
    return kebab;
  }

  // 4. Normalized alphanumeric match (e.g. "redhat" -> "red-hat", "walmart" -> "walmart")
  const stripped = rawLower.replace(/[^a-z0-9]/g, "");
  if (COMMON_ALIASES[stripped]) {
    return COMMON_ALIASES[stripped];
  }
  if (NORMALIZED_SLUG_MAP.has(stripped)) {
    return NORMALIZED_SLUG_MAP.get(stripped)!;
  }

  return null;
}
