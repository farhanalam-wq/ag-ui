export interface ExtractedFact {
  subject: string;
  predicate: string;
  value: string;
  confidence: number;
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
