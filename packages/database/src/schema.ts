import { pgTable, uuid, text, timestamp, jsonb, integer, index, uniqueIndex, boolean, unique, numeric, date, primaryKey, smallint, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Auth identities. `email` is stored trimmed + lowercased at the boundary and
 * uniqueness is enforced on `lower(email)`; `password_hash` is Argon2id and
 * NULL for Google-only accounts. See docs/auth-tenancy.md §3.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    googleSub: text("google_sub"),
    name: text("name"),
    avatarUrl: text("avatar_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    uniqueIndex("users_google_sub_unique")
      .on(table.googleSub)
      .where(sql`${table.googleSub} is not null`),
  ]
);

/**
 * Opaque, revocable sessions. The raw token lives only in an httpOnly cookie;
 * the database stores `sha256(token)` in `token_hash`. See docs/auth-tenancy.md §4.
 *
 * Not to be confused with the analytics `sessions` table.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (table) => [
    index("auth_sessions_user_idx").on(table.userId),
    index("auth_sessions_expires_idx").on(table.expiresAt),
  ]
);

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    // Unique per owner, not globally: two users may own the same domain and
    // stay completely separate. See docs/auth-tenancy.md §5.1.
    domain: text("domain").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("companies_owner_domain_unique").on(table.ownerId, table.domain),
    index("companies_owner_idx").on(table.ownerId),
  ]
);

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
  /**
   * Host page the conversation started on, normalised like `page_views.path`.
   * Null when unknown (older rows, the playground). Never visitor content:
   * it is the page they were reading, not what they asked.
   */
  path: text("path"),
  /**
   * Cookieless visit identity captured on the chat POST body (same hashes the
   * tracker derives). Joins conversations to `sessions` for the Visitors
   * metadata panel; null for older rows and the playground.
   */
  sessionHash: text("session_hash"),
  visitorHash: text("visitor_hash"),
  /**
   * What produced this conversation: typed chat (default, "text") or a voice
   * call transcript ("voice", persisted from the STT lines at call end).
   * Voice lines are reconstructions, not verbatim — the marker lets every
   * consumer (docket badge, sheet label, clustering later) govern fidelity.
   */
  channel: text("channel").default("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  check(
    "conversations_channel_check",
    sql`${t.channel} in ('text', 'voice')`
  ),
  index("conversations_company_channel_created_idx").on(t.companyId, t.channel, t.createdAt),
]);

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  content: text("content").notNull(),
  evidence: jsonb("evidence"),
  visualSpec: jsonb("visual_spec"),
  /**
   * Derived per-message signals, written at persist time by the chat routes:
   * { top_similarity, grounded, model, latency_ms, engine, extraction_ran,
   *   competitors }. Shape lives in shared/conversation-signals.ts. Never
   * referenced by the render path — additive metadata only.
   */
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messageFeedback = pgTable(
  "message_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    messageId: uuid("message_id")
      .references(() => messages.id, { onDelete: "cascade" })
      .notNull(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    /** Thumbs: 1 = up, -1 = down. One rating per message. */
    rating: smallint("rating").notNull(), // 1 | -1
    comment: text("comment"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("message_feedback_message_unique").on(t.messageId),
    index("message_feedback_company_created_idx").on(t.companyId, t.createdAt),
    index("message_feedback_conversation_idx").on(t.conversationId),
  ]
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "set null" }),
    contactName: text("contact_name"),
    email: text("email"),
    phone: text("phone"),
    /** BANT qualification cues the extractor observed: {budget, authority, need, timeline}. */
    bant: jsonb("bant").default({}).notNull(),
    /** Technical stack constraints mentioned naturally (e.g. "we're on Next.js"). */
    techStack: jsonb("tech_stack").default([]).notNull(),
    /** Additional extractor tags (competitor quotes, locales, …). */
    extraTags: jsonb("extra_tags").default([]).notNull(),
    status: text("status").default("NEW").notNull(), // 'NEW' | 'QUALIFIED' | 'CONTACTED' | 'DISMISSED'
    /** Quote of the first message that surfaced the lead. */
    firstMessage: text("first_message"),
    /** Extractor self-reported confidence, 0..1. Null when not scored. */
    confidence: numeric("confidence"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("leads_company_status_created_idx").on(t.companyId, t.status, t.createdAt),
    index("leads_conversation_idx").on(t.conversationId),
    check(
      "leads_status_check",
      sql`${t.status} in ('NEW', 'QUALIFIED', 'CONTACTED', 'DISMISSED')`
    ),
    // Zero-form dedupe: one open lead per company per email address. The
    // enrich worker merges tags into an existing row instead of inserting.
    uniqueIndex("leads_company_email_unique").on(t.companyId, sql`lower(${t.email})`),
  ]
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** Domain event type — "lead.captured" first. */
    eventType: text("event_type").notNull(),
    /** Event-specific JSON (ids, qs, counts) — never visitor PII beyond what
     *  the event is about (a lead capture carries the lead id, not details). */
    payload: jsonb("payload"),
    /**
     * 'RECORDED' = logged only. The delivery engine (deferred) flips rows to
     * QUEUED -> SENT/FAILED and reads them as webhook-ish CRUD entries.
     */
    status: text("status").default("RECORDED").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("webhook_events_company_created_idx").on(t.companyId, t.createdAt),
    index("webhook_events_type_idx").on(t.eventType),
  ]
);

export const intentClusterRuns = pgTable(
  "intent_cluster_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").default("QUEUED").notNull(), // 'QUEUED' | 'EMBEDDING' | 'CLUSTERING' | 'LABELING' | 'READY' | 'FAILED'
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    convoCount: integer("convo_count").default(0).notNull(),
    clusterCount: integer("cluster_count").default(0).notNull(),
    /** { embed_model, embed_dims, clustering, label_model, threshold } */
    modelVersions: jsonb("model_versions"),
    errorSample: jsonb("error_sample"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("intent_cluster_runs_company_created_idx").on(t.companyId, t.createdAt)]
);

export const intentClusters = pgTable(
  "intent_clusters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .references(() => intentClusterRuns.id, { onDelete: "cascade" })
      .notNull(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    /** LLM-written or fallback label, e.g. "EU Data Residency". */
    label: text("label").notNull(),
    summary: text("summary"),
    queryCount: integer("query_count").default(0).notNull(),
    /** First answers without evidence inside this cluster. */
    ungrounded: integer("ungrounded").default(0).notNull(),
    sessionCount: integer("session_count").default(0).notNull(),
    /** [{query, count, conversation_id}] most representative queries. */
    topQueries: jsonb("top_queries").default([]).notNull(),
    /** [{name, count, conversation_id}] competitor mentions in the cluster. */
    competitorMentions: jsonb("competitor_mentions").default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("intent_clusters_company_run_idx").on(t.companyId, t.runId),
    index("intent_clusters_run_idx").on(t.runId),
  ]
);

export const intentClusterMembers = pgTable(
  "intent_cluster_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clusterId: uuid("cluster_id")
      .references(() => intentClusters.id, { onDelete: "cascade" })
      .notNull(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    /** Cosine score to the cluster centroid (or seed query). */
    score: numeric("score"),
  },
  (t) => [
    unique("intent_cluster_members_unique").on(t.clusterId, t.conversationId),
    index("intent_cluster_members_conversation_idx").on(t.conversationId),
  ]
);

export const crawlJobs = pgTable(
  "crawl_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .references(() => companies.id, { onDelete: "cascade" })
      .notNull(),
    snapshotId: uuid("snapshot_id").references(() => companySnapshots.id, {
      onDelete: "set null",
    }),
    selectionHash: text("selection_hash").notNull(),
    // Scoped to the company: the same selection under two tenants must not
    // collide. See docs/auth-tenancy.md §12.1.
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").default("QUEUED").notNull(), // 'QUEUED' | 'DISCOVERING' | 'CRAWLING' | 'PARSING' | 'EMBEDDING' | 'READY' | 'FAILED' | 'CANCELLED'
    selected: integer("selected").default(0).notNull(),
    crawled: integer("crawled").default(0).notNull(),
    docs: integer("docs").default(0).notNull(),
    failed: integer("failed").default(0).notNull(),
    priority: integer("priority").default(0).notNull(),
    errorSample: jsonb("error_sample"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("crawl_jobs_company_idempotency_unique").on(
      table.companyId,
      table.idempotencyKey
    ),
  ]
);

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
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
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
