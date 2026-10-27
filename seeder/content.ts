/**
 * Demo identity and content for the seeder.
 *
 * One user owns exactly three companies. Every company gets the full product
 * surface: snapshots, documents/chunks/facts, crawl jobs, enrichment batches,
 * brand tokens/stylesheets, two widget keys with allowlisted origins, a
 * published theme override, conversations/messages, and a backlog of errors.
 *
 * All ids are derived from `SEED_NAMESPACE` (see ids.ts), so a rerun produces
 * the same rows. Analytics events live in `events.ts`.
 */

import { faker } from "@faker-js/faker";
import {
  buildFaqJsonLd,
  buildMessageMeta,
  mergeMessageMeta,
  type CompetitorMention,
} from "../packages/shared/src/index";
import { normalizeClusterKey } from "../packages/analytics/src/index";
import {
  db,
  brands,
  brandStylesheets,
  batchFiles,
  chunks,
  companies,
  companySnapshots,
  conversations,
  crawlJobs,
  documents,
  enrichmentBatches,
  errorEvents,
  facts,
  messages,
  signalDrafts,
  users,
  widgetKeyDomains,
  widgetKeys,
  widgetThemeOverrides,
} from "../packages/database/src/index";
import { randInt, rngFor, sha256, uuidFor } from "./ids";

export type UserRow = typeof users.$inferSelect;

export const DEMO_EMAIL = "demo@ag-ui.local";
/** Printed once at the end of a seed run. Argon2id-hashed like a real signup. */
export const DEMO_PASSWORD = "DemoPassw0rd!2026";

export interface PageSpec {
  path: string;
  title: string;
  category: string;
}

export interface CompanySpec {
  key: string;
  name: string;
  domain: string;
  url: string;
  tagline: string;
  industry: string;
  palette: {
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
  };
  pages: PageSpec[];
  questions: string[];
}

const COMMON_PAGES: PageSpec[] = [
  { path: "/", title: "Home", category: "product" },
  { path: "/pricing", title: "Pricing", category: "pricing" },
  { path: "/product", title: "Product overview", category: "product" },
  { path: "/docs", title: "Documentation", category: "docs" },
  { path: "/blog", title: "Blog", category: "blog" },
  { path: "/about", title: "About us", category: "about" },
  { path: "/contact", title: "Contact", category: "about" },
  { path: "/customers", title: "Customer stories", category: "product" },
  { path: "/security", title: "Security", category: "legal" },
  { path: "/integrations", title: "Integrations", category: "product" },
];

export const COMPANIES: CompanySpec[] = [
  {
    key: "northstar",
    name: "Northstar Labs",
    domain: "northstarlabs.io",
    url: "https://northstarlabs.io",
    tagline: "Observability for teams that ship every day.",
    industry: "Developer tools / SaaS",
    palette: {
      primary: "#2f6bff",
      secondary: "#7c5cff",
      background: "#0b1020",
      foreground: "#eef2ff",
    },
    pages: [
      ...COMMON_PAGES,
      { path: "/platform", title: "Platform", category: "product" },
      { path: "/platform/traces", title: "Distributed tracing", category: "docs" },
      { path: "/platform/logs", title: "Structured logs", category: "docs" },
      { path: "/platform/alerts", title: "Alerting", category: "docs" },
      { path: "/changelog", title: "Changelog", category: "blog" },
      { path: "/enterprise", title: "Enterprise", category: "pricing" },
    ],
    questions: [
      "What does Northstar Labs do?",
      "How is pricing calculated for high-volume teams?",
      "Do you support OpenTelemetry traces and logs?",
      "What is the difference between the Team and Enterprise plans?",
      "How long do you retain trace data?",
      "Can I self-host Northstar?",
      "Which integrations are available for incident response?",
      "How does alert routing work?",
      "Is there a free trial?",
      "Where is the company headquartered?",
      "How do I contact sales?",
      "What compliance certifications do you have?",
    ],
  },
  {
    key: "harbor",
    name: "Harbor & Finch",
    domain: "harborandfinch.com",
    url: "https://harborandfinch.com",
    tagline: "Considered objects for a slower home.",
    industry: "Direct-to-consumer home goods",
    palette: {
      primary: "#9a5b3f",
      secondary: "#c99a6b",
      background: "#fbf7f1",
      foreground: "#2b211b",
    },
    pages: [
      ...COMMON_PAGES,
      { path: "/collections", title: "Collections", category: "product" },
      { path: "/collections/table", title: "Table collection", category: "product" },
      { path: "/collections/lighting", title: "Lighting collection", category: "product" },
      { path: "/shipping", title: "Shipping and returns", category: "legal" },
      { path: "/care", title: "Product care", category: "docs" },
      { path: "/journal", title: "Journal", category: "blog" },
    ],
    questions: [
      "What materials do you use?",
      "How much does shipping cost?",
      "What is your return policy?",
      "How do I care for solid oak furniture?",
      "Do you ship internationally?",
      "Are the textiles certified?",
      "Can I order a custom size?",
      "How long does delivery take?",
      "Do you have a showroom?",
      "What is the warranty?",
      "How do I contact customer care?",
      "Are gift cards available?",
    ],
  },
  {
    key: "lumen",
    name: "Lumen Atelier",
    domain: "lumenatelier.co",
    url: "https://lumenatelier.co",
    tagline: "Brand systems for companies in motion.",
    industry: "Brand and product design studio",
    palette: {
      primary: "#1f7a6b",
      secondary: "#e0b354",
      background: "#0f1514",
      foreground: "#eef5f2",
    },
    pages: [
      ...COMMON_PAGES,
      { path: "/work", title: "Selected work", category: "product" },
      { path: "/work/vercel", title: "Case study: Vercel", category: "product" },
      { path: "/work/linear", title: "Case study: Linear", category: "product" },
      { path: "/services", title: "Services", category: "product" },
      { path: "/services/brand", title: "Brand strategy", category: "docs" },
      { path: "/services/product", title: "Product design", category: "docs" },
      { path: "/journal", title: "Journal", category: "blog" },
    ],
    questions: [
      "What services does Lumen Atelier offer?",
      "How does a typical engagement work?",
      "What does a brand strategy project cost?",
      "How long does a rebrand take?",
      "Do you work with early-stage startups?",
      "Can you design and build the website too?",
      "Who are your past clients?",
      "How do you measure brand success?",
      "Do you offer ongoing design support?",
      "Where is the studio based?",
      "How do I start a project?",
      "What is your availability?",
    ],
  },
];

export interface SeededCompany extends CompanySpec {
  id: string;
  latestSnapshotId: string;
  readySnapshotIds: string[];
  failedSnapshotId: string;
  widgetKeyIds: string[];
}
const DAY_MS = 86_400_000;

function daysAgo(days: number, hour = 12, minute = 0): Date {
  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(dayStart - days * DAY_MS + hour * 3_600_000 + minute * 60_000);
}

function chunked<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export async function seedDemoUser(ownerId?: string): Promise<UserRow> {
  const passwordHash = await Bun.password.hash(DEMO_PASSWORD, {
    algorithm: "argon2id",
    memoryCost: 19456,
    timeCost: 2,
  });

  const [user] = await db
    .insert(users)
    .values({
      id: ownerId ?? uuidFor("user", DEMO_EMAIL),
      email: DEMO_EMAIL,
      passwordHash,
      name: "Demo Operator",
      avatarUrl: null,
      createdAt: daysAgo(120),
      updatedAt: daysAgo(0),
    })
    .returning();

  return user!;
}

export async function seedCompanies(owner: UserRow): Promise<SeededCompany[]> {
  const rows = COMPANIES.map((spec) => ({
    id: uuidFor("company", spec.key),
    ownerId: owner.id,
    domain: spec.domain,
    name: spec.name,
    url: spec.url,
    createdAt: daysAgo(119),
  }));
  await db.insert(companies).values(rows);

  return COMPANIES.map((spec, i) => ({
    ...spec,
    id: rows[i]!.id,
    // v5 is the latest and READY; the FAILED crawl sits mid-history (v3) so
    // the dashboard cards reflect the live corpus, not a dead attempt.
    latestSnapshotId: uuidFor("snapshot", spec.key, 5),
    readySnapshotIds: [5, 4, 2, 1].map((v) => uuidFor("snapshot", spec.key, v)),
    failedSnapshotId: uuidFor("snapshot", spec.key, 3),
    widgetKeyIds: [uuidFor("widget-key", spec.key, 1), uuidFor("widget-key", spec.key, 2)],
  }));
}

/* ------------------------------------------------------------------ snapshots */

async function seedSnapshots(company: SeededCompany): Promise<void> {
  const versions = [1, 2, 3, 4, 5];
  const createdAt = [130, 95, 55, 12, 4];
  // One FAILED attempt mid-history for UI states; the latest (v5) is READY so
  // the company cards and retrieval reflect the live corpus.
  const pageCounts = [42, 68, 0, 96, 124];
  const statuses = ["READY", "READY", "FAILED", "READY", "READY"];

  await db.insert(companySnapshots).values(
    versions.map((version, i) => ({
      id: uuidFor("snapshot", company.key, version),
      companyId: company.id,
      version,
      status: statuses[i]!,
      pageCount: pageCounts[i]!,
      summary: {
        kind: "crawl",
        added: version === 1 ? [] : Array.from({ length: 6 + version }, (_, n) => `${company.url}/page-${version}-${n + 1}`),
        removed: version === 1 ? [] : [`${company.url}/legacy-${version}`],
        changed: Array.from({ length: 2 + version }, (_, n) => `${company.url}/page-${n + 1}`),
        counts: { added: version === 1 ? 0 : 6 + version, removed: version === 1 ? 0 : 1, changed: 2 + version },
      },
      createdAt: daysAgo(createdAt[i]!, 9, 15),
    }))
  );
}

/* -------------------------------------------------------------- documents/chunks */

function documentContent(company: SeededCompany, title: string, index: number): string {
  const intro = `${company.name} — ${title}. ${company.tagline}`;
  const body = faker.lorem.paragraphs(5 + (index % 5), "\n\n");
  const detail = `This page is part of the ${company.industry} knowledge base for ${company.name}. ` +
    `It covers ${title.toLowerCase()} in enough detail for a support agent to answer customer questions without guessing.`;
  return `${intro}\n\n${body}\n\n${detail}`;
}

function documentHeadings(title: string): Array<{ level: number; text: string }> {
  return [
    { level: 1, text: title },
    { level: 2, text: "Overview" },
    { level: 2, text: "Details" },
    { level: 2, text: "Frequently asked questions" },
  ];
}

async function seedDocuments(company: SeededCompany, batchIds: string[]): Promise<string[]> {
  const docIds: string[] = [];
  const rows: Array<typeof documents.$inferInsert> = [];

  // The two latest READY snapshots carry the current knowledge base.
  for (const version of [4, 5]) {
    const snapshotId = uuidFor("snapshot", company.key, version);
    const count = 60 + ((version * 7 + company.key.length) % 15); // 60–74
    for (let i = 0; i < count; i++) {
      const page = company.pages[i % company.pages.length]!;
      const variant = Math.floor(i / company.pages.length);
      const title = variant === 0 ? page.title : `${page.title} — ${faker.lorem.words(2)}`;
      const url = `${company.url}${page.path}${variant === 0 ? "" : `/${version}-${variant}`}`;
      const content = documentContent(company, title, i);
      const id = uuidFor("document", company.key, version, i);
      docIds.push(id);
      rows.push({
        id,
        snapshotId,
        url,
        title,
        category: page.category,
        content,
        contentHash: sha256(content),
        wordCount: content.split(/\s+/).length,
        headings: documentHeadings(title),
        sourceKind: "crawl",
        originName: url,
        batchId: null,
        deletedBatchId: version === 4 && i < 2 ? batchIds[0]! : null,
        createdAt: daysAgo(version === 5 ? 11 : 54, 10, i % 60),
      });
    }
  }

  // Enrichment uploads on the latest snapshot.
  const uploads = [
    { filename: "pricing-sheet-2026.pdf", title: "Pricing sheet 2026" },
    { filename: "security-overview.pdf", title: "Security overview" },
    { filename: "implementation-guide.pdf", title: "Implementation guide" },
    { filename: "brand-guidelines.pdf", title: "Brand guidelines" },
  ];
  for (let i = 0; i < uploads.length; i++) {
    const upload = uploads[i]!;
    const content = documentContent(company, upload.title, i + 90);
    const id = uuidFor("document", company.key, "upload", i);
    docIds.push(id);
    rows.push({
      id,
      snapshotId: uuidFor("snapshot", company.key, 5),
      url: `upload://${upload.filename}`,
      title: upload.title,
      category: "docs",
      content,
      contentHash: sha256(content),
      wordCount: content.split(/\s+/).length,
      headings: documentHeadings(upload.title),
      sourceKind: "upload",
      originName: upload.filename,
      batchId: i < 2 ? batchIds[0]! : batchIds[1]!,
      deletedBatchId: null,
      createdAt: daysAgo(10, 14, i * 3),
    });
  }

  for (const chunk of chunked(rows, 100)) await db.insert(documents).values(chunk);
  return docIds;
}

async function seedChunks(company: SeededCompany, docIds: string[]): Promise<number> {
  const rows: Array<typeof chunks.$inferInsert> = [];
  for (let d = 0; d < docIds.length; d++) {
    const docId = docIds[d]!;
    const count = 4 + ((d * 3 + company.key.length) % 5); // 4–8
    for (let i = 0; i < count; i++) {
      rows.push({
        id: uuidFor("chunk", company.key, d, i),
        documentId: docId,
        content: faker.lorem.paragraph(2 + ((d + i) % 3)),
        chunkIndex: i,
      });
    }
  }
  for (const chunk of chunked(rows, 500)) await db.insert(chunks).values(chunk);
  return rows.length;
}

async function seedFacts(company: SeededCompany, docIds: string[]): Promise<void> {
  const predicates = [
    "founded",
    "headquarters",
    "employees",
    "industry",
    "website",
    "support_email",
    "pricing_model",
    "free_trial",
    "security",
    "compliance",
    "integrations",
    "languages",
    "support_hours",
    "primary_product",
    "target_customer",
  ];
  const values: Record<string, string> = {
    founded: String(2014 + (company.key.length % 9)),
    headquarters: faker.location.city() + ", " + faker.location.country(),
    employees: `${randInt(rngFor(company.key + "employees"), 40, 900)}`,
    industry: company.industry,
    website: company.url,
    support_email: `support@${company.domain}`,
    pricing_model: "Subscription with usage-based tiers",
    free_trial: "14 days, no credit card required",
    security: "Encryption in transit and at rest, SSO, role-based access",
    compliance: "SOC 2 Type II, GDPR",
    integrations: "Slack, Salesforce, HubSpot, Zapier",
    languages: "English, German, French, Spanish",
    support_hours: "Monday–Friday, 09:00–18:00 UTC",
    primary_product: company.tagline,
    target_customer: "Mid-market and enterprise teams",
  };

  const rows: Array<typeof facts.$inferInsert> = [];
  const count = 40 + (company.key.length % 21); // 40–60
  for (let i = 0; i < count; i++) {
    const predicate = predicates[i % predicates.length]!;
    rows.push({
      id: uuidFor("fact", company.key, i),
      snapshotId: company.latestSnapshotId,
      documentId: docIds[(i * 7) % docIds.length] ?? null,
      subject: company.name,
      predicate,
      value: values[predicate] ?? faker.lorem.sentence(),
      confidence: 80 + (i % 21),
    });
  }
  await db.insert(facts).values(rows);
}

/* ------------------------------------------------------------------ crawl/enrich */

async function seedCrawlJobs(company: SeededCompany): Promise<void> {
  const rows = [1, 2, 3, 4, 5].map((version) => ({
    id: uuidFor("crawl-job", company.key, version),
    companyId: company.id,
    snapshotId: uuidFor("snapshot", company.key, version),
    selectionHash: sha256(`${company.key}:selection:${version}`),
    idempotencyKey: `seed-${company.key}-v${version}`,
    status: version === 3 ? "FAILED" : "READY",
    selected: 80 + version * 12,
    crawled: version === 3 ? 64 : 72 + version * 11,
    docs: version === 3 ? 0 : 60 + version * 10,
    failed: version === 3 ? 34 : version === 1 ? 4 : 1,
    priority: version,
    errorSample:
      version === 3
        ? [
            { url: `${company.url}/blocked`, error: "Robots.txt disallow" },
            { url: `${company.url}/timeout`, error: "Extraction timeout after 30s" },
          ]
        : version === 1
          ? [{ url: `${company.url}/broken`, error: "Timeout" }]
          : null,
    // Same timeline as the snapshots: the job precedes its snapshot by an
    // hour, so the version history reads as a real crawl flow.
    createdAt: daysAgo([130, 95, 55, 12, 4][version - 1]!, 8, 0),
    updatedAt: daysAgo([130, 95, 55, 12, 4][version - 1]!, 8, 45),
  }));
  await db.insert(crawlJobs).values(rows);
}

async function seedEnrichment(company: SeededCompany): Promise<string[]> {
  const batches = [1, 2].map((minor) => ({
    id: uuidFor("enrichment-batch", company.key, minor),
    companyId: company.id,
    snapshotId: company.latestSnapshotId,
    minor,
    status: "READY",
    fileCount: 4,
    docs: 4,
    failed: 0,
    manifest: [
      { filename: `brief-${minor}.pdf`, mime: "application/pdf", size: 184_320, title: `Brief ${minor}`, wordCount: 1200 },
      { filename: `notes-${minor}.docx`, mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 92_160, title: `Notes ${minor}`, wordCount: 860 },
      { filename: `faq-${minor}.md`, mime: "text/markdown", size: 12_480, title: `FAQ ${minor}`, wordCount: 540 },
      { filename: `deck-${minor}.pdf`, mime: "application/pdf", size: 245_760, title: `Deck ${minor}`, wordCount: 980 },
    ],
    summary: {
      kind: "upload",
      added: [`brief-${minor}.pdf`, `notes-${minor}.docx`, `faq-${minor}.md`, `deck-${minor}.pdf`],
      counts: { files: 4, docs: 4, failed: 0 },
    },
    errorSample: null,
    createdAt: daysAgo(11, 10, minor * 10),
    updatedAt: daysAgo(11, 10, minor * 10 + 8),
  }));
  await db.insert(enrichmentBatches).values(batches);

  const files = batches.flatMap((batch) =>
    (batch.manifest as Array<{ filename: string; mime: string; size: number }>).map((file, i) => ({
      id: uuidFor("batch-file", company.key, batch.minor, i),
      batchId: batch.id,
      filename: file.filename,
      mime: file.mime,
      size: file.size,
      data: Buffer.from(`demo seed file ${company.key} ${batch.minor} ${file.filename}`).toString("base64"),
      createdAt: batch.createdAt,
    }))
  );
  await db.insert(batchFiles).values(files);

  return batches.map((batch) => batch.id);
}

/* ------------------------------------------------------------------ brand/theme */

async function seedBrand(company: SeededCompany): Promise<void> {
  const { primary, secondary, background, foreground } = company.palette;
  const logoUrl = `${company.url}/logo.svg`;

  await db.insert(brands).values({
    id: uuidFor("brand", company.key),
    companyId: company.id,
    logoUrl,
    tokens: {
      colors: { primary, secondary, accent: secondary, background, foreground },
      radius: "10px",
      fonts: { heading: "Inter", body: "Inter" },
      logoUrl,
    },
    createdAt: daysAgo(55, 12, 0),
  });

  await db.insert(brandStylesheets).values([
    {
      id: uuidFor("brand-stylesheet", company.key, "ready"),
      companyId: company.id,
      snapshotId: company.latestSnapshotId,
      status: "READY",
      dtcg: {
        color: {
          primary: { $type: "color", $value: primary },
          secondary: { $type: "color", $value: secondary },
          surface: { $type: "color", $value: background },
          text: { $type: "color", $value: foreground },
        },
        radius: { md: { $type: "dimension", $value: "10px" } },
      },
      tailwind: `@theme {\n  --color-brand: ${primary};\n  --color-brand-accent: ${secondary};\n  --color-surface: ${background};\n  --color-ink: ${foreground};\n  --radius-brand: 10px;\n}`,
      designMd: `# ${company.name} design language\n\nPrimary \`${primary}\`, accent \`${secondary}\`.\nSurfaces use \`${background}\` with \`${foreground}\` text.\nRadius is 10px across cards and controls.`,
      wcag: [
        { fg: foreground, bg: background, count: 42 },
        { fg: primary, bg: background, count: 11 },
        { fg: "#ffffff", bg: primary, count: 8 },
      ],
      raw: {
        colors: { primary, secondary, background, foreground },
        wcag: [{ fg: foreground, bg: background, ratio: 12.4, passesAA: true }],
      },
      screenshotUrl: null,
      error: null,
      createdAt: daysAgo(12, 13, 0),
      updatedAt: daysAgo(12, 13, 5),
    },
    {
      id: uuidFor("brand-stylesheet", company.key, "failed"),
      companyId: company.id,
      snapshotId: company.readySnapshotIds[1]!,
      status: "FAILED",
      dtcg: null,
      tailwind: null,
      designMd: null,
      wcag: null,
      raw: null,
      screenshotUrl: null,
      error: "Extraction timed out after 30s",
      createdAt: daysAgo(54, 13, 0),
      updatedAt: daysAgo(54, 13, 1),
    },
  ]);

  await db.insert(widgetThemeOverrides).values({
    companyId: company.id,
    override: {
      primary,
      surface: background,
      text: foreground,
      radius: "10px",
      headerTitle: company.name,
      headerDomain: company.domain,
      showReady: true,
      launcherGlyph: "✦",
    },
    updatedAt: daysAgo(9, 16, 0),
  });
}

/* ------------------------------------------------------------------ widget keys */

async function seedWidgetKeys(company: SeededCompany, owner: UserRow): Promise<void> {
  const labels = ["production", "staging"];
  await db.insert(widgetKeys).values(
    company.widgetKeyIds.map((id, i) => ({
      id,
      companyId: company.id,
      keyHash: sha256(`widget-key:${company.key}:${i + 1}`),
      keyPrefix: `agw_${sha256(`prefix:${company.key}:${i + 1}`).slice(0, 8)}`,
      label: labels[i]!,
      revoked: false,
      createdAt: daysAgo(100 - i * 30, 11, 0),
      updatedAt: daysAgo(5, 11, 0),
    }))
  );

  const origins = [
    `https://${company.domain}`,
    `https://www.${company.domain}`,
    `https://app.${company.domain}`,
  ];
  const rows: Array<typeof widgetKeyDomains.$inferInsert> = [];
  company.widgetKeyIds.forEach((keyId, keyIndex) => {
    const count = keyIndex === 0 ? 3 : 2;
    origins.slice(0, count).forEach((origin, i) => {
      rows.push({
        id: uuidFor("widget-domain", company.key, keyIndex, i),
        keyId,
        origin,
        includePaths: ["/"],
        excludePaths: i === 0 ? ["/admin/*", "/checkout/*"] : [],
        createdBy: owner.id,
        createdIp: "127.0.0.1",
        createdAt: daysAgo(99 - keyIndex * 30, 11, i),
      });
    });
  });
  await db.insert(widgetKeyDomains).values(rows);
}

/* ------------------------------------------------------------------ conversations */

const ANSWER_TEMPLATES = [
  (q: string, company: SeededCompany) =>
    `Short answer: ${company.tagline} For "${q}" the most relevant page is ${company.url}${company.pages[0]!.path}. The team can walk through the details and share the current documentation.`,
  (q: string, company: SeededCompany) =>
    `Based on the indexed ${company.name} knowledge base, ${q.toLowerCase().replace(/\?$/, "")} is covered in the ${company.pages[1]!.title} and ${company.pages[3]!.title} pages. I can summarise the specifics or point you to the exact section.`,
  (q: string, company: SeededCompany) =>
    `Yes — ${company.name} can help with that. The relevant material lives under ${company.pages[2]!.title}. If you need a commercial answer, contact support@${company.domain} and the team will follow up.`,
];

/** Competitor names the demo conversations occasionally raise, with a verbatim quote. */
const SEEDED_COMPETITORS = ["Intercom", "Chatbase", "Drift", "Zendesk"];

async function seedConversations(company: SeededCompany, latestDocIds: string[]): Promise<number> {
  const rng = rngFor(`${company.key}:conversations`);
  const total = 1_200 + randInt(rng, 0, 300);
  let messageCount = 0;

  const convoRows: Array<typeof conversations.$inferInsert> = [];
  const messageRows: Array<typeof messages.$inferInsert> = [];

  for (let i = 0; i < total; i++) {
    const id = uuidFor("conversation", company.key, i);
    const day = randInt(rng, 1, 90);
    const hour = randInt(rng, 7, 22);
    const minute = randInt(rng, 0, 59);
    const createdAt = daysAgo(day, hour, minute);
    const question = company.questions[i % company.questions.length]!;

    convoRows.push({
      id,
      companyId: company.id,
      title: question.length > 60 ? `${question.slice(0, 57)}...` : question,
      path: company.pages[randInt(rng, 0, company.pages.length - 1)]!.path,
      createdAt,
    });

    const turns = 3 + randInt(rng, 0, 3); // 3–6 messages
    let ms = createdAt.getTime();
    for (let turn = 0; turn < turns; turn++) {
      const isUser = turn % 2 === 0;
      ms += randInt(rng, 8_000, 75_000);

      let text: string;
      let userMeta: Record<string, unknown> | null = null;
      if (isUser) {
        if (turn === 0) {
          text = question;
        } else if (rng() < 0.12) {
          // A competitor mention the enrich worker would have tagged:
          // name in the turn, verbatim snippet in the meta (the Intelligence
          // radar reads exactly this shape).
          const name = SEEDED_COMPETITORS[randInt(rng, 0, SEEDED_COMPETITORS.length - 1)]!;
          text = `${name} handles this for us — how is yours different?`;
          userMeta = mergeMessageMeta({}, {
            competitors: [{ name, quote: `${name} handles this for us` }] as CompetitorMention[],
          });
        } else {
          text = faker.lorem.sentence();
        }
        // Seeded conversations are marked enriched so a stray queue run
        // never reprocesses them into the lead ledger.
        userMeta = mergeMessageMeta(userMeta ?? {}, { extraction_ran: true });
      } else {
        text = ANSWER_TEMPLATES[turn % ANSWER_TEMPLATES.length]!(question, company);
      }

      const grounded = !isUser && rng() < 0.88;
      const withVisual = !isUser && rng() < 0.08;
      const evidence = grounded
        ? [
            {
              sourceId: latestDocIds[(i + turn) % latestDocIds.length] ?? latestDocIds[0],
              url: `${company.url}${company.pages[(i + turn) % company.pages.length]!.path}`,
              pageTitle: company.pages[(i + turn) % company.pages.length]!.title,
              snippet: faker.lorem.sentence(),
              type: "chunk",
              score: 0.71 + rng() * 0.27,
            },
          ]
        : null;

      messageRows.push({
        id: uuidFor("message", company.key, i, turn),
        conversationId: id,
        role: isUser ? "user" : "assistant",
        content: text,
        evidence,
        visualSpec: withVisual
          ? {
              type: "stats",
              props: {
                title: `${company.name} at a glance`,
                items: [
                  { label: "Customers", value: String(randInt(rng, 200, 4_000)) },
                  { label: "Countries", value: String(randInt(rng, 8, 42)) },
                  { label: "Uptime", value: "99.98%" },
                ],
              },
            }
          : null,
        // Assistant rows carry the same persist-time meta the chat path
        // writes (top_similarity read from the evidence scores), so the
        // radar's confidence column demos truthfully.
        meta: isUser
          ? userMeta
          : buildMessageMeta({
              evidence,
              model: "gpt-4o-mini",
              latencyMs: randInt(rng, 500, 2600),
            }),
        createdAt: new Date(ms),
      });
      messageCount++;
    }
  }

  for (const chunk of chunked(convoRows, 500)) await db.insert(conversations).values(chunk);
  for (const chunk of chunked(messageRows, 500)) await db.insert(messages).values(chunk);
  return messageCount;
}

/* ------------------------------------------------------------------ drafts */

/**
 * Example Signals drafts, one per approval state, keyed by company and
 * question index into `CompanySpec.questions`. The cluster key is computed
 * with the radar's own `normalizeClusterKey`, so a seeded draft and a
 * deep-linked "Draft an FAQ in Signals" request for the same wording meet —
 * the demo loop closes instead of stacking a second draft.
 *
 * Honesty rules the seed follows: `model` says "seed-demo" (no model ran —
 * claiming gpt-4o-mini wrote these would be the exact fabrication the
 * module polices), and every answer only says what the referenced seeded
 * pages plausibly contain.
 */
const SEED_DRAFTS: Record<
  string,
  Array<{
    questionIndex: number;
    status: "DRAFT" | "APPROVED" | "DISMISSED";
    answer: string;
    sourcePages: number[];
  }>
> = {
  northstar: [
    {
      questionIndex: 1,
      status: "DRAFT",
      answer:
        "Pricing scales with usage rather than seats: each plan includes a monthly ingestion allowance, and teams above it are billed per additional million events at the rates published on the Pricing page. Volume commitments beyond the published tiers sit on the Enterprise plan, where the allowance is negotiated. The tier table and the overage rates are on the Pricing page.",
      sourcePages: [1, 15],
    },
    {
      questionIndex: 3,
      status: "APPROVED",
      answer:
        "The Team plan covers shared alerting with 14-day trace retention. Enterprise adds SSO/SCIM, 90-day retention, a private deployment option and a named support engineer. Both plans use the same ingestion pricing; the differences are governance and retention, not features per seat.",
      sourcePages: [1, 15],
    },
    {
      questionIndex: 4,
      status: "DISMISSED",
      answer:
        "Trace retention depends on your plan: 14 days on Team, 90 days on Enterprise. Longer windows are on the roadmap but cannot be scheduled today — if a compliance requirement needs more, contact sales and the team will confirm what is possible.",
      sourcePages: [15, 1],
    },
  ],
  harbor: [
    {
      questionIndex: 1,
      status: "DRAFT",
      answer:
        "Shipping is calculated at checkout from the order's weight and destination. Standard delivery within the US is free on orders over $120, and the full table of rates is on the Shipping and returns page; international rates are quoted per region in the same place.",
      sourcePages: [13],
    },
    {
      questionIndex: 2,
      status: "APPROVED",
      answer:
        "You can return any unused item within 30 days of delivery for a full refund, using the prepaid label included with the order. Made-to-order pieces are final sale. The full policy, including condition requirements, is on the Shipping and returns page.",
      sourcePages: [13],
    },
    {
      questionIndex: 6,
      status: "DISMISSED",
      answer:
        "Several pieces in the table and lighting collections can be made to order in adjusted dimensions. Lead times run six to ten weeks, and custom pieces are final sale. Send your dimensions through the contact page and the workshop will confirm what is possible.",
      sourcePages: [11, 12, 6],
    },
  ],
  lumen: [
    {
      questionIndex: 2,
      status: "DRAFT",
      answer:
        "Brand strategy engagements start from a fixed-scope sprint and scale with the number of workstreams; most projects land within the ranges published on the Services page. The exact figure depends on research depth and deliverables, and we quote after the first call.",
      sourcePages: [14, 13],
    },
    {
      questionIndex: 3,
      status: "APPROVED",
      answer:
        "A full rebrand typically runs eight to twelve weeks end to end: two to three weeks of strategy, four to six of design, and the remainder for rollout and guidelines. The phase breakdown is described on the Services page.",
      sourcePages: [13],
    },
    {
      questionIndex: 8,
      status: "DISMISSED",
      answer:
        "Yes — after launch we offer a quarterly retainer covering design QA, campaign assets, and evolution of the system as it is used. Retainer scope is outlined on the Services page, and the hours are agreed each quarter.",
      sourcePages: [13],
    },
  ],
};

/** sourcePages indexes into the company's `pages` spec. */
function pageSource(
  company: SeededCompany,
  index: number
): { title: string; url: string } {
  const page = company.pages[index] ?? company.pages[0]!;
  return { title: page.title, url: `${company.url}${page.path}` };
}

async function seedDrafts(company: SeededCompany): Promise<number> {
  const specs = SEED_DRAFTS[company.key] ?? [];
  if (specs.length === 0) return 0;

  // Stagger the timestamps so the queue reads as a history, not a burst:
  // the draft created first, decided later; review is the freshest state.
  const updatedAtDays: Record<"DRAFT" | "APPROVED" | "DISMISSED", number> = {
    DRAFT: 1,
    APPROVED: 2,
    DISMISSED: 6,
  };

  const rows: Array<typeof signalDrafts.$inferInsert> = specs.map((spec, i) => {
    const question = company.questions[spec.questionIndex]!;
    const sources = spec.sourcePages.map((p) => pageSource(company, p));
    return {
      companyId: company.id,
      clusterKey: normalizeClusterKey(question),
      question,
      status: spec.status,
      faq: { question, answer: spec.answer, sources },
      jsonld: buildFaqJsonLd(question, spec.answer),
      // Truthful provenance: no model ran here. The UI renders
      // "drafted by seed-demo", which is exactly what happened.
      model: "seed-demo",
      createdAt: daysAgo(7 + i, 10 + i, 15),
      updatedAt: daysAgo(updatedAtDays[spec.status], 14 + i, 30),
    };
  });

  await db.insert(signalDrafts).values(rows).onConflictDoNothing();
  return rows.length;
}

/* ------------------------------------------------------------------ errors */

async function seedErrors(company: SeededCompany): Promise<number> {
  const rng = rngFor(`${company.key}:errors`);
  const sources = ["api", "worker", "crawler", "embed", "retrieval", "chat", "voice"] as const;
  const messages = [
    "Upstream request timed out",
    "Failed to parse document",
    "Rate limit budget exhausted",
    "Embedding provider returned 502",
    "Retrieval cache miss budget exceeded",
    "Voice token exchange failed",
    "Crawler hit a redirect loop",
  ];
  const total = 30 + randInt(rng, 0, 20);
  const rows: Array<typeof errorEvents.$inferInsert> = [];

  for (let i = 0; i < total; i++) {
    rows.push({
      id: uuidFor("error", company.key, i),
      level: rng() < 0.2 ? "warn" : "error",
      source: sources[i % sources.length]!,
      message: messages[i % messages.length]!,
      stack: `Error: ${messages[i % messages.length]}\n    at seed-demo (seeder/content.ts:1:1)`,
      context: { seeded: true, companyId: company.id, attempt: i },
      companyId: company.id,
      createdAt: daysAgo(randInt(rng, 1, 90), randInt(rng, 0, 23), randInt(rng, 0, 59)),
    });
  }
  await db.insert(errorEvents).values(rows);
  return rows.length;
}

export async function seedGlobalErrors(): Promise<void> {
  const rng = rngFor("global-errors");
  const rows: Array<typeof errorEvents.$inferInsert> = [];
  for (let i = 0; i < 4; i++) {
    rows.push({
      id: uuidFor("error", "global", i),
      level: i === 0 ? "warn" : "error",
      source: i % 2 === 0 ? "api" : "worker",
      message: i % 2 === 0 ? "Route policy missing for unregistered path" : "Rollup tick failed",
      stack: null,
      context: { seeded: true, scope: "global" },
      companyId: null,
      createdAt: daysAgo(randInt(rng, 1, 30), randInt(rng, 0, 23), randInt(rng, 0, 59)),
    });
  }
  await db.insert(errorEvents).values(rows);
}

export async function seedCompanyContent(
  company: SeededCompany,
  owner: UserRow
): Promise<{ messages: number; errors: number }> {
  await seedSnapshots(company);
  const batchIds = await seedEnrichment(company);
  const docIds = await seedDocuments(company, batchIds);
  await seedChunks(company, docIds);
  await seedFacts(company, docIds);
  await seedCrawlJobs(company);
  await seedBrand(company);
  await seedWidgetKeys(company, owner);
  const messages = await seedConversations(company, docIds);
  const drafts = await seedDrafts(company);
  const errors = await seedErrors(company);
  return { messages, errors, drafts };
}
