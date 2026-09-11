import { logger } from "@ag-ui/shared";
import { validateSafeUrl } from "./ssrf";

export interface LlmsTxtResult {
  hasLlmsFull: boolean;
  llmsFullContent?: string;
  hasLlmsTxt: boolean;
  llmsTxtContent?: string;
  extractedUrls: string[];
}

/**
 * Extracts markdown links (- [Title](url): Description) from llms.txt content.
 */
export function extractUrlsFromLlmsTxt(content: string, baseUrl: URL): string[] {
  const urls: Set<string> = new Set();
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const rawLink = match[2].trim();
    try {
      const resolved = new URL(rawLink, baseUrl);
      // Only include links that belong to the same host or subdomains
      if (resolved.protocol === "http:" || resolved.protocol === "https:") {
        urls.add(resolved.toString());
      }
    } catch {
      // ignore malformed URLs
    }
  }

  return Array.from(urls);
}

/**
 * Probes a domain for /llms-full.txt and /llms.txt endpoints.
 */
export async function probeLlmsTxt(baseUrl: URL): Promise<LlmsTxtResult> {
  const result: LlmsTxtResult = {
    hasLlmsFull: false,
    hasLlmsTxt: false,
    extractedUrls: [],
  };

  // 1. Probe /llms-full.txt
  const llmsFullUrl = new URL("/llms-full.txt", baseUrl);
  try {
    await validateSafeUrl(llmsFullUrl.toString());
    const res = await fetch(llmsFullUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ag-ui-bot/1.0)",
        Accept: "text/plain, text/markdown, */*",
      },
      // @ts-ignore - Bun native fetch TLS configuration
      tls: { rejectUnauthorized: false },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      // Ensure we didn't receive an HTML 404/200 SPA fallback
      if (!contentType.includes("text/html")) {
        const text = await res.text();
        if (text.length > 50 && !text.trim().startsWith("<!DOCTYPE html>")) {
          logger.info(`[LLMS.TXT] Found /llms-full.txt at ${llmsFullUrl.origin} (${text.length} bytes)`);
          result.hasLlmsFull = true;
          result.llmsFullContent = text;
        }
      }
    }
  } catch (err: any) {
    logger.debug(`[LLMS.TXT] Probe for /llms-full.txt failed: ${err.message}`);
  }

  // 2. Probe /llms.txt
  const llmsTxtUrl = new URL("/llms.txt", baseUrl);
  try {
    await validateSafeUrl(llmsTxtUrl.toString());
    const res = await fetch(llmsTxtUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ag-ui-bot/1.0)",
        Accept: "text/plain, text/markdown, */*",
      },
      // @ts-ignore - Bun native fetch TLS configuration
      tls: { rejectUnauthorized: false },
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        const text = await res.text();
        if (text.length > 50 && !text.trim().startsWith("<!DOCTYPE html>")) {
          logger.info(`[LLMS.TXT] Found /llms.txt at ${llmsTxtUrl.origin} (${text.length} bytes)`);
          result.hasLlmsTxt = true;
          result.llmsTxtContent = text;
          result.extractedUrls = extractUrlsFromLlmsTxt(text, baseUrl);
          logger.info(`[LLMS.TXT] Extracted ${result.extractedUrls.length} priority URLs from /llms.txt`);
        }
      }
    }
  } catch (err: any) {
    logger.debug(`[LLMS.TXT] Probe for /llms.txt failed: ${err.message}`);
  }

  return result;
}
