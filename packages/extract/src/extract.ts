import mammoth from "mammoth";
// @ts-ignore: pdf-parse ships no types (see ./pdf-parse.d.ts for our own build)
import pdfParse from "pdf-parse";
import * as XLSX from "xlsx";
import { extractCleanContent } from "@ag-ui/crawler";
import { countWords, markdownHeadings, normalizeText, stripFrontmatter, titleFromFilename } from "./text";
import { ExtractError, type ExtractedCategory, type ExtractedDocument, type ExtractionResult } from "./types";

/** Safety caps so pathological files can't blow up extraction. Byte limits live in the API. */
const MAX_SHEET_ROWS = 5000;
const MAX_SHEET_COLS = 50;
const MAX_JSON_LINES = 10000;
const MAX_URLS = 2000;

function toDocument(title: string, text: string, headings: string[] = [], category?: ExtractedCategory): ExtractedDocument {
  const clean = normalizeText(text);
  if (clean.length === 0) throw new ExtractError("No readable text found in file.");
  return { title: title.trim() || "Untitled Document", text: clean, wordCount: countWords(clean), headings, category };
}

function decodeText(buffer: Buffer | Uint8Array): string {
  const text = Buffer.from(buffer).toString("utf8").replace(/^\uFEFF/, "");
  return text;
}

function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() || "";
  const dot = base.lastIndexOf(".");
  return dot === -1 ? "" : base.slice(dot + 1).toLowerCase();
}

function isPdf(buffer: Buffer | Uint8Array): boolean {
  return Buffer.from(buffer).subarray(0, 5).toString("binary") === "%PDF-";
}

function isZip(buffer: Buffer | Uint8Array): boolean {
  const b = Buffer.from(buffer);
  return b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

async function extractPdf(buffer: Buffer | Uint8Array, filename: string): Promise<ExtractedDocument> {
  let result;
  try {
    result = await pdfParse(Buffer.from(buffer));
  } catch {
    throw new ExtractError("Could not read PDF content.");
  }
  const title = (result.info?.Title && String(result.info.Title).trim()) || titleFromFilename(filename);
  return toDocument(title, result.text);
}

async function extractDocx(buffer: Buffer | Uint8Array, filename: string): Promise<ExtractedDocument> {
  let value: string;
  try {
    ({ value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) }));
  } catch {
    throw new ExtractError("Could not read Word document content.");
  }
  return toDocument(titleFromFilename(filename), value);
}

function extractSpreadsheet(buffer: Buffer | Uint8Array, filename: string, isCsv: boolean): ExtractedDocument {
  let workbook: XLSX.WorkBook;
  try {
    workbook = isCsv
      ? XLSX.read(decodeText(buffer), { type: "string" })
      : XLSX.read(Buffer.from(buffer), { type: "buffer" });
  } catch {
    throw new ExtractError("Could not read spreadsheet content.");
  }
  if (workbook.SheetNames.length === 0) throw new ExtractError("Spreadsheet has no sheets.");
  const lines: string[] = [];
  const headings: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: false,
    });
    headings.push(name);
    lines.push(`# ${name}`);
    for (const row of rows.slice(0, MAX_SHEET_ROWS)) {
      const cells = (row as unknown[]).slice(0, MAX_SHEET_COLS).map((c) => String(c ?? "").trim());
      if (cells.every((c) => c === "")) continue;
      lines.push(cells.join(" | "));
    }
  }
  return toDocument(titleFromFilename(filename), lines.join("\n"), headings);
}

function extractMarkdown(buffer: Buffer | Uint8Array, filename: string): ExtractedDocument {
  const body = stripFrontmatter(decodeText(buffer));
  const firstHeading = /^#{1,3}\s+(.+)$/m.exec(body)?.[1]?.trim();
  return toDocument(firstHeading || titleFromFilename(filename), body, markdownHeadings(body));
}

function extractPlainText(buffer: Buffer | Uint8Array, filename: string): ExtractedDocument {
  return toDocument(titleFromFilename(filename), decodeText(buffer));
}

function extractHtml(buffer: Buffer | Uint8Array, filename: string): ExtractedDocument {
  const clean = extractCleanContent(decodeText(buffer), `upload://${filename}`);
  if (clean.content.trim().length === 0) throw new ExtractError("No readable text found in HTML file.");
  return toDocument(clean.title, clean.content, clean.headings, clean.category);
}

function extractJson(buffer: Buffer | Uint8Array, filename: string): ExtractedDocument {
  let data: unknown;
  try {
    data = JSON.parse(decodeText(buffer));
  } catch {
    throw new ExtractError("Invalid JSON file.");
  }
  const lines: string[] = [];
  const walk = (value: unknown, path: string, depth: number): void => {
    if (lines.length >= MAX_JSON_LINES || depth > 8) return;
    if (value === null || value === undefined) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      lines.push(path ? `${path}: ${String(value)}` : String(value));
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1));
      return;
    }
    if (typeof value === "object") {
      for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
        walk(item, path ? `${path}.${key}` : key, depth + 1);
      }
    }
  };
  walk(data, "", 0);
  return toDocument(titleFromFilename(filename), lines.join("\n"));
}

function looksLikeUrlList(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  return lines.length > 0 && lines.every((l) => /^https?:\/\/\S+$/i.test(l));
}

function extractSitemap(buffer: Buffer | Uint8Array): string[] {
  const text = decodeText(buffer);
  const urls = new Set<string>();
  const locRe = /<loc>\s*([^<]+?)\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRe.exec(text)) !== null && urls.size < MAX_URLS) {
    urls.add(match[1].trim());
  }
  if (urls.size === 0) {
    // Fall back to plain URL-per-line (urls.txt).
    for (const line of text.split("\n")) {
      const url = line.trim();
      if (/^https?:\/\/\S+$/i.test(url)) urls.add(url);
      if (urls.size >= MAX_URLS) break;
    }
  }
  if (urls.size === 0) throw new ExtractError("No URLs found in sitemap.");
  return [...urls];
}

export interface UploadInput {
  filename: string;
  mime?: string;
  buffer: Buffer | Uint8Array;
}

/**
 * Extracts readable text from an uploaded file. Returns either a document
 * ready for the chunk → embed path, or a URL list to feed the crawler.
 * Throws ExtractError with user-safe messages on failure.
 */
export async function extractUpload(input: UploadInput): Promise<ExtractionResult> {
  const { filename, buffer } = input;
  const ext = extensionOf(filename);

  if (ext === "pdf" || (!ext && isPdf(buffer))) {
    return { kind: "document", document: await extractPdf(buffer, filename) };
  }
  if (ext === "docx") {
    if (!isZip(buffer)) throw new ExtractError("Not a valid Word document.");
    return { kind: "document", document: await extractDocx(buffer, filename) };
  }
  if (ext === "xlsx") {
    if (!isZip(buffer)) throw new ExtractError("Not a valid spreadsheet.");
    return { kind: "document", document: extractSpreadsheet(buffer, filename, false) };
  }
  if (ext === "csv") {
    return { kind: "document", document: extractSpreadsheet(buffer, filename, true) };
  }
  if (ext === "md" || ext === "mdx" || ext === "markdown") {
    return { kind: "document", document: extractMarkdown(buffer, filename) };
  }
  if (ext === "txt" || ext === "text") {
    // URL-per-line files feed the crawler instead of becoming documents.
    if (looksLikeUrlList(decodeText(buffer))) {
      return { kind: "url-list", urls: extractSitemap(buffer) };
    }
    return { kind: "document", document: extractPlainText(buffer, filename) };
  }
  if (ext === "html" || ext === "htm") {
    return { kind: "document", document: extractHtml(buffer, filename) };
  }
  if (ext === "json") {
    return { kind: "document", document: extractJson(buffer, filename) };
  }
  if (ext === "xml" || filename.toLowerCase().includes("sitemap")) {
    return { kind: "url-list", urls: extractSitemap(buffer) };
  }
  if (isZip(buffer)) {
    throw new ExtractError("Unsupported archive type. Upload docx, xlsx, or the extracted files directly.");
  }
  throw new ExtractError(`Unsupported file type ".${ext || "?"}". Upload pdf, docx, xlsx, csv, md, txt, html, or json.`);
}

/** Direct text input (paste-text box): no file involved. */
export function extractPastedText(title: string, text: string): ExtractedDocument {
  return toDocument(title, text);
}
