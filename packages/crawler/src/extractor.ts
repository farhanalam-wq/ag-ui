import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import * as cheerio from "cheerio";

export interface ExtractedPageContent {
  title: string;
  excerpt?: string;
  content: string;
  category: "about" | "pricing" | "product" | "docs" | "general";
  headings: string[];
}

/**
 * Infers document category from URL path and page title.
 */
export function inferCategory(url: string, title = ""): "about" | "pricing" | "product" | "docs" | "general" {
  const target = `${url} ${title}`.toLowerCase();

  if (target.includes("pricing") || target.includes("plan") || target.includes("tier")) {
    return "pricing";
  }
  if (target.includes("about") || target.includes("company") || target.includes("team") || target.includes("leadership")) {
    return "about";
  }
  if (target.includes("product") || target.includes("feature") || target.includes("solution") || target.includes("integration")) {
    return "product";
  }
  if (target.includes("doc") || target.includes("api") || target.includes("guide") || target.includes("tutorial")) {
    return "docs";
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
      const normalizedText = article.textContent
        .replace(/\n\s*\n\s*\n/g, "\n\n")
        .trim();

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
