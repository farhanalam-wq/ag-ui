import { z } from "zod";

/**
 * Knowledge > Sources shared contracts (Phase 0 freeze).
 *
 * Single source of truth for sitemap + file enrichment so schema (Phase 1),
 * parsers (Phase 2), APIs (Phase 3), pipeline (Phase 4) and UI (Phase 5)
 * cannot drift. Retrieval (`packages/database/src/retrieval.ts`) is unchanged:
 * it reads the latest READY snapshot and hydrates by chunk UUID.
 */

export const SourceTypeSchema = z.enum(["crawl", "sitemap", "custom-sitemap", "file"]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

/** Snapshot rule for v1: every ingest (crawl or upload) creates a new immutable version. */
export const SnapshotModeSchema = z.enum(["new"]);
export type SnapshotMode = z.infer<typeof SnapshotModeSchema>;
export const DEFAULT_SNAPSHOT_MODE: SnapshotMode = "new";

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf",
  "csv",
  "xlsx",
  "xls",
  "md",
  "markdown",
  "txt",
  "docx",
] as const;
export type AllowedUploadExtension = (typeof ALLOWED_UPLOAD_EXTENSIONS)[number];

export const ALLOWED_UPLOAD_MIMES = [
  "application/pdf",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/markdown",
  "text/x-markdown",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const SOURCE_LIMITS = {
  /** Per-file cap (25 MB). */
  maxFileBytes: 25 * 1024 * 1024,
  /** Max files per upload request. */
  maxFilesPerRequest: 10,
  /** Max total request body for uploads (100 MB, Elysia/Bun limit config). */
  maxRequestBytes: 100 * 1024 * 1024,
  /** Max characters kept per parsed file (truncate + flag). */
  maxCharsPerFile: 500_000,
  /** Tabular caps per sheet/file. */
  maxRowsPerSheet: 500,
  maxColsPerSheet: 20,
  /** Below this length a parsed file is rejected as thin (mirrors crawl <50 rule). */
  thinChars: 50,
  /** Max headings stored on documents.headings (mirrors crawl slice(0,50)). */
  headingsCap: 50,
  /** Max filename length after sanitization. */
  maxFileNameLength: 150,
} as const;

export const UploadFileStatusSchema = z.enum([
  "indexed",
  "skipped_duplicate",
  "error",
]);
export type UploadFileStatus = z.infer<typeof UploadFileStatusSchema>;

/**
 * Qdrant contract for file chunks (frozen, mirrors crawl payload shape).
 * Collection: company_chunks, 1536-dim Cosine, point id = PG chunks.id UUID.
 * NOTE: `url` is a `file://<companyId>/<safeName>` pseudo-URL so existing
 * payload filters (`company_id`, `snapshot_id`) keep working. Display layers
 * should render `title` (original file name), not fetch `url`.
 */
export const QDRANT_COLLECTION = "company_chunks";
export const QDRANT_VECTOR_DIM = 1536;

export function sanitizeUploadFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? raw;
  const cleaned = base.replace(/\.\.+/g, "").trim();
  return cleaned.slice(0, SOURCE_LIMITS.maxFileNameLength) || "upload";
}

export function buildFileDocumentUrl(companyId: string, safeName: string): string {
  return `file://${companyId}/${encodeURIComponent(safeName)}`;
}

export const UploadRequestSchema = z.object({
  companyId: z.string().uuid(),
  snapshotMode: SnapshotModeSchema.default(DEFAULT_SNAPSHOT_MODE),
});
export type UploadRequest = z.infer<typeof UploadRequestSchema>;

export const SitemapParseRequestSchema = z.object({
  companyId: z.string().uuid(),
  sitemapUrls: z.array(z.string().url()).max(20).optional(),
  /** Raw sitemap.xml text (from .xml file upload), parsed without fetching. */
  sitemapXml: z.string().max(5 * 1024 * 1024).optional(),
});
export type SitemapParseRequest = z.infer<typeof SitemapParseRequestSchema>;
