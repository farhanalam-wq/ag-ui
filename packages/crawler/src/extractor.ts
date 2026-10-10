import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import * as cheerio from "cheerio";

export type PageCategory = "about" | "pricing" | "product" | "docs" | "blog" | "general";

export interface ExtractedPageContent {
  title: string;
  excerpt?: string;
  content: string;
  category: PageCategory;
  headings: string[];
}

/**
 * Task 7 — table-driven category rules. First match wins; order is precedence.
 * Keywords intentionally mirror the legacy inline checks; only `blog` is new.
 */
export const CATEGORY_RULES: { category: Exclude<PageCategory, "general">; match: string[] }[] = [
  { category: "pricing", match: ["pricing", "plan", "tier"] },
  { category: "about", match: ["about", "company", "team", "leadership"] },
  { category: "product", match: ["product", "feature", "solution", "integration"] },
  { category: "docs", match: ["doc", "api", "guide", "tutorial"] },
  { category: "blog", match: ["blog", "changelog", "news", "post"] },
];

/**
 * Infers document category from URL path and page title.
 */
export function inferCategory(url: string, title = ""): PageCategory {
  const target = `${url} ${title}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    for (const keyword of rule.match) {
      if (target.includes(keyword)) return rule.category;
    }
  }
  return "general";
}

/**
 * Strips boilerplate and extracts clean readable article content from raw HTML.
 */
export function extractCleanContent(rawHtml: string, pageUrl: string): ExtractedPageContent {
  const $ = cheerio.load(rawHtml);

  // Extract headings before stripping
  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 2 && text.length < 120) {
      headings.push(text);
    }
  });

  // Remove common web noise and boilerplate
  $(
    "script, style, noscript, iframe, svg, [role='dialog'], [aria-modal='true'], .cookie-banner, #cookie-banner, #onetrust-banner-sdk, .nav, nav, footer, .footer, header, .header"
  ).remove();

  // Task 7 — category-aware cleaning, decided from the URL alone (no title yet).
  const prelimCategory = inferCategory(pageUrl, "");
  if (prelimCategory === "blog") {
    $("aside, .sidebar, .newsletter, .related-posts, .share-buttons").remove();
  }
  // Docs: capture code/table blocks before Readability so we can re-attach any
  // it drops; h4 headings join the headings list (h1-h3 collected above).
  let docsReferenceBlocks: string[] = [];
  if (prelimCategory === "docs") {
    $("h4").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length > 2 && text.length < 120) headings.push(text);
    });
    $("pre, table").each((_, el) => {
      const text = $(el).text().replace(/\s+/g, " ").trim();
      if (text.length > 20) docsReferenceBlocks.push(text);
    });
  }

  const cleanedHtml = $.html();

  // Run through Mozilla Readability for article-grade extraction
  try {
    const dom = new JSDOM(cleanedHtml, { url: pageUrl });
    const reader = new Readability(dom.window.document, {
      charThreshold: 20,
    });
    const article = reader.parse();

    if (article && article.textContent && article.textContent.trim().length > 50) {
      // Normalize whitespace
      let normalizedText = article.textContent
        .replace(/\n\s*\n\s*\n/g, "\n\n")
        .trim();

      // Re-attach docs reference blocks Readability dropped (match on a 60-char probe).
      if (docsReferenceBlocks.length > 0) {
        const missing = docsReferenceBlocks.filter(
          (block) => !normalizedText.includes(block.slice(0, 60))
        );
        if (missing.length > 0) {
          normalizedText += `\n\n## Reference\n\n${missing.join("\n\n")}`;
        }
      }

      const title = article.title || $("title").text().trim() || "Untitled Document";
      const category = inferCategory(pageUrl, title);

      return {
        title,
        excerpt: article.excerpt || undefined,
        content: normalizedText,
        category,
        headings,
      };
    }
  } catch {
    // Readability fallback to Cheerio text extraction
  }

  // Fallback: Direct text extraction using Cheerio
  const fallbackTitle = $("title").text().trim() || $("h1").first().text().trim() || "Untitled Document";
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  return {
    title: fallbackTitle,
    content: bodyText,
    category: inferCategory(pageUrl, fallbackTitle),
    headings,
  };
}
