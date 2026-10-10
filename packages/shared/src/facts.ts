export interface ExtractedFact {
  subject: string;
  predicate: string;
  value: string;
  confidence: number;
}

/**
 * Task 14 — static intent vocabulary (v1). Maps query keywords to buyer intents,
 * intents to fact predicates, and intents to chunk-category boosts. Deterministic,
 * no model calls. Keyword matching uses word boundaries so short tokens like `x`
 * or `api` never match inside unrelated words.
 */
export const INTENT_KEYWORDS: Record<string, string[]> = {
  pricing: ["price", "pricing", "plan", "tier", "cost", "subscription"],
  contact: ["contact", "email", "support", "sales"],
  code: ["sdk", "api", "github", "repo", "integration"],
  social: ["twitter", "x", "social", "handle"],
  location: ["office", "headquarters", "location", "address", "where"],
};

export const INTENT_FACT_PREDICATES: Record<string, string[]> = {
  pricing: ["pricing_tier"],
  contact: ["contact_email"],
  code: ["github_repository"],
  social: ["twitter_handle"],
  location: ["office_location"],
};

/** Chunk categories boosted per intent during MMR input ordering. Never excludes. */
export const INTENT_CATEGORY_BOOST: Record<string, string[]> = {
  pricing: ["pricing"],
  code: ["docs"],
};

export const MAX_INJECTED_FACTS = 8;

function normalizeQueryText(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Detect buyer intents in a query via whole-word keyword hits. Order-stable. */
export function detectQueryIntents(query: string): string[] {
  const text = ` ${normalizeQueryText(query)} `;
  const hits: string[] = [];
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      const re = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
      if (re.test(text)) {
        hits.push(intent);
        break;
      }
    }
  }
  return hits;
}

export interface ScoredFact {
  predicate: string;
  confidence: number | null;
}

/**
 * Select at most MAX_INJECTED_FACTS facts for a query: boosted predicates first,
 * `domain` always included, remainder filled by confidence. Deterministic.
 */
export function selectFactsForQuery<T extends ScoredFact>(query: string, factRecords: T[]): T[] {
  const intents = detectQueryIntents(query);
  const boosted = new Set<string>();
  for (const intent of intents) {
    for (const predicate of INTENT_FACT_PREDICATES[intent] ?? []) boosted.add(predicate);
  }
  const conf = (f: T) => f.confidence ?? 0;
  const domainFacts = factRecords.filter((f) => f.predicate === "domain");
  const rest = factRecords
    .filter((f) => f.predicate !== "domain")
    .sort((a, b) => {
      const boostDiff = (boosted.has(b.predicate) ? 1 : 0) - (boosted.has(a.predicate) ? 1 : 0);
      if (boostDiff !== 0) return boostDiff;
      return conf(b) - conf(a);
    });
  const selected: T[] = [...domainFacts];
  for (const f of rest) {
    if (selected.length >= MAX_INJECTED_FACTS) break;
    selected.push(f);
  }
  return selected.slice(0, MAX_INJECTED_FACTS);
}

export interface CategoryCandidate {
  payload: { category?: string };
}

/**
 * Stable-partition candidates so intent-matching categories sort first among the
 * MMR inputs. Never excludes. Deterministic.
 */
export function orderCandidatesByIntent<T extends CategoryCandidate>(
  candidates: T[],
  query: string
): T[] {
  const intents = detectQueryIntents(query);
  const boostedCategories = new Set<string>();
  for (const intent of intents) {
    for (const category of INTENT_CATEGORY_BOOST[intent] ?? []) boostedCategories.add(category);
  }
  if (boostedCategories.size === 0) return candidates;
  const boosted = candidates.filter((c) => boostedCategories.has(c.payload.category ?? ""));
  const rest = candidates.filter((c) => !boostedCategories.has(c.payload.category ?? ""));
  return [...boosted, ...rest];
}

/**
 * Extracts deterministic entity facts from document markdown for hybrid SQL retrieval.
 */
export function extractCompanyFacts(
  companyName: string,
  domain: string,
  documents: { title: string; content: string; url: string }[]
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const fullText = documents.map((d) => d.content).join("\n\n");

  // 1. Domain Fact
  facts.push({
    subject: companyName,
    predicate: "domain",
    value: domain,
    confidence: 100,
  });

  // 2. Extract Contact Emails
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
  const emails = new Set<string>();
  let emailMatch;
  while ((emailMatch = emailRegex.exec(fullText)) !== null) {
    const email = emailMatch[1].toLowerCase();
    // Filter out common false positives or library emails
    if (
      !email.includes("example.com") &&
      !email.includes("sentry.io") &&
      !email.endsWith(".png") &&
      !email.endsWith(".jpg")
    ) {
      emails.add(email);
    }
  }

  for (const email of emails) {
    facts.push({
      subject: companyName,
      predicate: "contact_email",
      value: email,
      confidence: 90,
    });
  }

  // 3. Extract Social / Developer Repositories
  const githubMatch = fullText.match(/https?:\/\/github\.com\/([a-zA-Z0-9_-]+)(?:\/[a-zA-Z0-9_.-]+)?/i);
  if (githubMatch) {
    facts.push({
      subject: companyName,
      predicate: "github_repository",
      value: githubMatch[0],
      confidence: 95,
    });
  }

  const twitterMatch = fullText.match(/https?:\/\/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
  if (twitterMatch) {
    facts.push({
      subject: companyName,
      predicate: "twitter_handle",
      value: twitterMatch[0],
      confidence: 90,
    });
  }

  // 4. Extract Pricing Clues
  const pricingMatches = fullText.match(/\b(Free|Pro|Team|Enterprise|Starter|Business)\s*(?:tier|plan)?\s*[:–-]?\s*(\$\d+(?:\/\s*mo(?:nth)?)?|\$0)/gi);
  if (pricingMatches) {
    const uniqueTiers = Array.from(new Set(pricingMatches)).slice(0, 4);
    for (const tier of uniqueTiers) {
      facts.push({
        subject: companyName,
        predicate: "pricing_tier",
        value: tier.trim(),
        confidence: 85,
      });
    }
  }

  // 5. Extract Address / Location Clues (e.g., Street, Avenue, Blvd, Bangalore, San Francisco, etc.)
  const addressRegex = /(?:headquartered in|located in|office at|address:?)\s*([A-Za-z0-9\s,.-]{10,80})/gi;
  let addrMatch;
  while ((addrMatch = addressRegex.exec(fullText)) !== null) {
    const rawAddr = addrMatch[1].trim().replace(/[.\n].*$/, "");
    if (rawAddr.length > 8 && !rawAddr.toLowerCase().includes("http")) {
      facts.push({
        subject: companyName,
        predicate: "office_location",
        value: rawAddr,
        confidence: 80,
      });
      break;
    }
  }

  return facts;
}
