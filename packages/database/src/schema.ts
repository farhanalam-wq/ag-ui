import { pgTable, uuid, text, timestamp, jsonb, integer, index, boolean, unique, numeric, date, primaryKey, smallint } from "drizzle-orm/pg-core";

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  domain: text("domain").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const companySnapshots = pgTable("company_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .references(() => companies.id, { onDelete: "cascade" })
    .notNull(),
  version: integer("version").notNull(),
  status: text("status").notNull(), // 'QUEUED' | 'CRAWLING' | 'PROCESSING' | 'READY' | 'FAILED'
  pageCount: integer("page_count").default(0),
  // Crawl-diff brief for majors, e.g. { kind: 'crawl', added: [...urls], removed: [...], changed: [...], counts: {...} }.
  // Null for versions snapshotted before enrichment shipped.
  summary: jsonb("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const brands = pgTable("brands", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .references(() => companies.id, { onDelete: "cascade" })
    .notNull(),
  logoUrl: text("logo_url"),
  tokens: jsonb("tokens").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    snapshotId: uuid("snapshot_id")
      .references(() => companySnapshots.id, { onDelete: "cascade" })
      .notNull(),
    url: text("url").notNull(), // uploads use the `upload://<filename>` convention
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    headings: jsonb("headings").default([]).notNull(),
    // 'crawl' | 'upload' | 'manual'. Pre-enrichment rows backfill to 'crawl'.
    sourceKind: text("source_kind").default("crawl").notNull(),
    // Human label for the origin: filename for uploads, URL for crawls.
    originName: text("origin_name"),
    // Enrichment batch that produced this doc, if any.
    batchId: uuid("batch_id").references(() => enrichmentBatches.id, {
      onDelete: "set null",
    }),
    // Tombstone batch that removed this doc, if any. Set = invisible
    // everywhere (retrieval, evidence, Sources). Restored by clearing.
    deletedBatchId: uuid("deleted_batch_id").references(() => enrichmentBatches.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("documents_content_hash_idx").on(table.contentHash),
    index("documents_batch_id_idx").on(table.batchId),
    index("documents_deleted_batch_idx").on(table.deletedBatchId),
  ]
);

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
  },
  (table) => [
    index("chunks_document_id_idx").on(table.documentId),
  ]
);

export const facts = pgTable("facts", {
  id: uuid("id").defaultRandom().primaryKey(),
  snapshotId: uuid("snapshot_id")
    .references(() => companySnapshots.id, { onDelete: "cascade" })
    .notNull(),
  documentId: uuid("document_id").references(() => documents.id, {
    onDelete: "set null",
  }),
  subject: text("subject").notNull(),
  predicate: text("predicate").notNull(),
  value: text("value").notNull(),
  confidence: integer("confidence").default(100),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .references(() => companies.id, { onDelete: "cascade" })
    .notNull(),
  title: text("title").default("New Conversation").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  evidence: jsonb("evidence"),
  visualSpec: jsonb("visual_spec"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crawlJobs = pgTable("crawl_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .references(() => companies.id, { onDelete: "cascade" })
    .notNull(),
  snapshotId: uuid("snapshot_id").references(() => companySnapshots.id, {
    onDelete: "set null",
  }),
  owner: text("owner"), // nullable, reserved for later auth
  selectionHash: text("selection_hash").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: text("status").default("QUEUED").notNull(), // 'QUEUED' | 'DISCOVERING' | 'CRAWLING' | 'PARSING' | 'EMBEDDING' | 'READY' | 'FAILED' | 'CANCELLED'
  selected: integer("selected").default(0).notNull(),
  crawled: integer("crawled").default(0).notNull(),
  docs: integer("docs").default(0).notNull(),
  failed: integer("failed").default(0).notNull(),
  priority: integer("priority").default(0).notNull(),
  errorSample: jsonb("error_sample"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const enrichmentBatches = pgTable(
  "enrichment_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    // Major snapshot this batch extends. Displayed as v<snapshot.version>.<minor>.
    snapshotId: uuid("snapshot_id")
      .references(() => companySnapshots.id, { onDelete: "cascade" })
      .notNull(),
    // 1-based within the major; assigned transactionally at completion.
    minor: integer("minor").notNull(),
    status: text("status").default("DRAFT").notNull(), // 'DRAFT' | 'PROCESSING' | 'READY' | 'FAILED' | 'CANCELLED'
    fileCount: integer("file_count").default(0).notNull(),
    docs: integer("docs").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    // Upload manifest: [{ filename, mime, size, title?, wordCount?, error? }].
    manifest: jsonb("manifest").default([]).notNull(),
    // Display summary, e.g. { kind: 'upload', added: ['pricing.pdf', ...], counts: {...} }.
    summary: jsonb("summary"),
    errorSample: jsonb("error_sample"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("enrichment_batches_company_idx").on(table.companyId),
    unique("enrichment_batches_snapshot_minor_unique").on(table.snapshotId, table.minor),
  ]
);

export const batchFiles = pgTable(
  "batch_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .references(() => enrichmentBatches.id, { onDelete: "cascade" })
      .notNull(),
    filename: text("filename").notNull(),
    mime: text("mime"),
    size: integer("size").default(0).notNull(),
    // Raw upload bytes for the background worker (job payloads stay tiny).
    data: text("data").notNull(), // base64-encoded
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("batch_files_batch_idx").on(table.batchId)]
);

export const widgetKeys = pgTable(
  "widget_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    keyHash: text("key_hash").notNull().unique(),
    keyPrefix: text("key_prefix").notNull(),
    label: text("label").default("default").notNull(),
    revoked: boolean("revoked").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("widget_keys_company_idx").on(table.companyId),
    index("widget_keys_prefix_idx").on(table.keyPrefix),
  ]
);

export const widgetKeyDomains = pgTable(
  "widget_key_domains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    keyId: uuid("key_id")
      .references(() => widgetKeys.id, { onDelete: "cascade" })
      .notNull(),
    origin: text("origin").notNull(),
    includePaths: text("include_paths")
      .array()
      .notNull()
      .$defaultFn(() => ["/"]),
    excludePaths: text("exclude_paths")
      .array()
      .notNull()
      .$defaultFn(() => []),
    createdBy: text("created_by"),
    createdIp: text("created_ip"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("widget_key_domains_key_idx").on(table.keyId),
    unique("widget_key_domains_key_origin_unique").on(table.keyId, table.origin),
  ]
);

export const brandStylesheets = pgTable(
  "brand_stylesheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    snapshotId: uuid("snapshot_id").references(() => companySnapshots.id, {
      onDelete: "set null",
    }),
    status: text("status").default("QUEUED").notNull(),
    dtcg: jsonb("dtcg"),
    tailwind: text("tailwind"),
    designMd: text("design_md"),
    wcag: jsonb("wcag"),
    raw: jsonb("raw"),
    screenshotUrl: text("screenshot_url"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("brand_stylesheets_company_idx").on(t.companyId)]
);

/**
 * Analytics tables — ORM READ definitions over migration-owned tables
 * (drizzle/0007_analytics.sql, worker-managed monthly partitions). DDL is
 * hand-maintained there because page_views is RANGE-partitioned, which
 * drizzle-kit cannot express. These definitions exist for typed reads only;
 * keep them in sync with that migration.
 */
export const pageViews = pgTable(
  "page_views",
  {
    id: uuid("id").defaultRandom().notNull(),
    eventId: text("event_id").notNull(),
    type: text("type").default("pageview").notNull(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    widgetKeyId: uuid("widget_key_id"),
    sessionHash: text("session_hash").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    url: text("url").notNull(),
    path: text("path").notNull(),
    referrer: text("referrer").default("").notNull(),
    viewport: text("viewport").default("").notNull(),
    userAgent: text("user_agent").default("").notNull(),
    // Visitor profile, derived once at the collector and stored so a report
    // never re-parses a user agent (and never disagrees with another one).
    browser: text("browser"),
    os: text("os"),
    /** Minutes east of UTC, from the visitor's own timezone. Null when unknown. */
    tzOffset: smallint("tz_offset"),
    isBot: boolean("is_bot").default(false).notNull(),
    value: numeric("value"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.id, t.createdAt] })]
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    sessionHash: text("session_hash").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    pageviewCount: integer("pageview_count").default(0).notNull(),
    activeSeconds: integer("active_seconds").default(0).notNull(),
    // The visit's visitor profile, copied from the event that opened it. One
    // row per visit, so a breakdown by these is a breakdown of visits — the
    // same unit every "Sessions" figure counts.
    device: text("device"),
    browser: text("browser"),
    os: text("os"),
    /** Minutes east of UTC, from the visitor's own timezone. Null when unknown. */
    tzOffset: smallint("tz_offset"),
    converted: boolean("converted").default(false).notNull(),
    revenue: numeric("revenue").default("0").notNull(),
    engaged: boolean("engaged").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("sessions_company_session_started_unique").on(t.companyId, t.sessionHash, t.startedAt)]
);

export const metricsDaily = pgTable(
  "metrics_daily",
  {
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    day: date("day").notNull(),
    pageviews: integer("pageviews").default(0).notNull(),
    sessions: integer("sessions").default(0).notNull(),
    engagedSessions: integer("engaged_sessions").default(0).notNull(),
    conversions: integer("conversions").default(0).notNull(),
    revenue: numeric("revenue").default("0").notNull(),
    chatOpens: integer("chat_opens").default(0).notNull(),
    messages: integer("messages").default(0).notNull(),
    scrolls: integer("scrolls").default(0).notNull(),
    downloads: integer("downloads").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    heartbeats: integer("heartbeats").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.day] })]
);

export const metricsHourly = pgTable(
  "metrics_hourly",
  {
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    hour: timestamp("hour", { withTimezone: true }).notNull(),
    pageviews: integer("pageviews").default(0).notNull(),
    sessions: integer("sessions").default(0).notNull(),
    engagedSessions: integer("engaged_sessions").default(0).notNull(),
    conversions: integer("conversions").default(0).notNull(),
    revenue: numeric("revenue").default("0").notNull(),
    chatOpens: integer("chat_opens").default(0).notNull(),
    messages: integer("messages").default(0).notNull(),
    scrolls: integer("scrolls").default(0).notNull(),
    downloads: integer("downloads").default(0).notNull(),
    clicks: integer("clicks").default(0).notNull(),
    heartbeats: integer("heartbeats").default(0).notNull(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.hour] })]
);
/**
 * Published widget theme override — one row per company, written ONLY by the
 * Widget Studio "Publish" action (Discard deletes it). Draft edits stay
 * client-side until publish. Read-time merged on top of the extracted brand
 * theme (see resolveCompanyWidgetTheme), so it survives re-extraction.
 */
export const widgetThemeOverrides = pgTable("widget_theme_overrides", {
  companyId: uuid("company_id")
    .references(() => companies.id, { onDelete: "cascade" })
    .primaryKey(),
  override: jsonb("override").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Operations error sink — one row per captured failure.
 *
 * Written ONLY through `recordError()` (packages/database/src/errors.ts) so
 * every surface (API, workers, runtime) uses the same shape. `companyId` is
 * nullable + SET NULL: errors outlive company deletion, and anonymous
 * embed/runtime failures are still captured.
 *
 * Never store visitor content, secrets, or PII in `context`.
 */
export const errorEvents = pgTable(
  "error_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    level: text("level").default("error").notNull(), // 'error' | 'warn'
    source: text("source").notNull(), // 'api'|'crawler'|'worker'|'embed'|'retrieval'|'chat'|'voice'
    message: text("message").notNull(),
    stack: text("stack"),
    context: jsonb("context"), // method, path, code, status, jobId, companyId…
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("error_events_source_created_idx").on(t.source, t.createdAt),
    index("error_events_company_created_idx").on(t.companyId, t.createdAt),
  ]
);
