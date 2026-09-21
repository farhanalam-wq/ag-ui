import { pgTable, uuid, text, timestamp, jsonb, integer, index } from "drizzle-orm/pg-core";

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
    url: text("url").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    content: text("content").notNull(),
    contentHash: text("content_hash").notNull(),
    wordCount: integer("word_count").default(0).notNull(),
    headings: jsonb("headings").default([]).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("documents_content_hash_idx").on(table.contentHash),
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
