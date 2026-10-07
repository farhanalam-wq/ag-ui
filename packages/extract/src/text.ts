/** Shared text helpers. wordCount mirrors the SQL backfill formula. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function titleFromFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || filename;
  return base.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled Document";
}

export function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  const after = text.indexOf("\n", end + 4);
  return after === -1 ? "" : text.slice(after + 1);
}

export function markdownHeadings(text: string, limit = 50): string[] {
  const headings: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (match && match[2].length > 2 && match[2].length < 120) {
      headings.push(match[2].trim());
      if (headings.length >= limit) break;
    }
  }
  return headings;
}
