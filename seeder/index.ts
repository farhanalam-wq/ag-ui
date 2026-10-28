/**
 * Deterministic demo seeder (docs/auth-tenancy.md §13.3).
 *
 *   bun seeder/index.ts           # first run
 *   bun seeder/index.ts --reset   # wipe the demo identity and reseed
 *
 * Creates one user, three companies and every child row the product reads:
 * snapshots, documents/chunks/facts, crawl jobs, enrichment batches, brand
 * data, widget keys/origins, conversations/messages, errors, and 90 days of
 * raw analytics rolled up through the real worker functions.
 *
 * Safety: refuses to run in production or against a non-local database. An
 * existing demo user is a hard error unless `--reset` is passed.
 */

import { randomBytes } from "node:crypto";
import {
  and,
  client,
  closeRedisConnection,
  companies,
  db,
  eq,
  errorEvents,
  inArray,
  isNull,
  sql,
  users,
  authSessions,
} from "../packages/database/src/index";
import {
  COMPANIES,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  seedCompanies,
  seedCompanyContent,
  seedDemoUser,
  seedGlobalErrors,
  type SeededCompany,
} from "./content";
import { seedAnalyticsEvents, seedWindowDays, type AnalyticsSummary } from "./events";
import { buildSeedRollups, ensureSeedPartitions, type RollupSummary } from "./rollups";
import { sha256 } from "./ids";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function printHelp(): void {
  console.log(`AG-UI demo seeder

Usage:
  bun seeder/index.ts [--reset]

Options:
  --reset   Delete the demo user (cascading to all three companies and their
            analytics) before seeding again.
  --help    Show this message.

Safety:
  - Refuses NODE_ENV=production.
  - Refuses a DATABASE_URL whose host is not localhost/127.0.0.1/::1.
  - Without --reset, an existing ${DEMO_EMAIL} is a hard error.

The seed is deterministic (Faker seed 42, namespace-derived UUIDs) for a
given UTC day. The analytics window is the 90 days ending yesterday.
`);
}

function fail(message: string): never {
  console.error(`[SEED] ${message}`);
  process.exit(1);
}

function assertSafeEnvironment(): void {
  if (process.env.NODE_ENV === "production") {
    fail("Refusing to run with NODE_ENV=production.");
  }

  const databaseUrl =
    process.env.DATABASE_URL ||
    "postgresql://postgres:password@localhost:5432/ag_ui";
  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    fail(`DATABASE_URL is not a valid URL: ${databaseUrl}`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    fail(
      `Refusing to seed a non-local database (host '${host}'). ` +
        `This seeder is for local demos only.`
    );
  }
}

async function findDemoUser() {
  const [row] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${DEMO_EMAIL}`)
    .limit(1);
  return row ?? null;
}

async function resetDemoUser(): Promise<void> {
  const user = await findDemoUser();
  if (!user) return;

  const owned = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.ownerId, user.id));

  // error_events uses ON DELETE SET NULL, so company errors would survive the
  // cascade as anonymous rows. Remove them explicitly.
  if (owned.length > 0) {
    await db.delete(errorEvents).where(
      inArray(
        errorEvents.companyId,
        owned.map((c) => c.id)
      )
    );
  }
  await db.delete(errorEvents).where(
    and(sql`${errorEvents.context}->>'seeded' = 'true'`, isNull(errorEvents.companyId))
  );

  // Cascades to companies -> snapshots/documents/chunks/facts/conversations/
  // messages/crawl jobs/batches/brand/widget keys/analytics/theme overrides.
  await db.delete(users).where(eq(users.id, user.id));
}

async function seedAuthSession(userId: string): Promise<void> {
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 86_400_000);
  await db.insert(authSessions).values({
    userId,
    tokenHash: sha256(raw),
    expiresAt,
  });
}

async function tableCounts(tables: string[]): Promise<Array<[string, number]>> {
  const out: Array<[string, number]> = [];
  for (const table of tables) {
    const rows = (await client.unsafe(
      `SELECT count(*)::int AS n FROM "${table}"`
    )) as Array<{ n: number }>;
    out.push([table, rows[0]?.n ?? 0]);
  }
  return out;
}

function printSummary(
  companiesSeeded: SeededCompany[],
  analytics: AnalyticsSummary,
  rollups: RollupSummary,
  counts: Array<[string, number]>
): void {
  console.log("\n============================================================");
  console.log(" DEMO SEED COMPLETE");
  console.log("============================================================");
  console.log(` Login:    ${DEMO_EMAIL}`);
  console.log(` Password: ${DEMO_PASSWORD}`);
  console.log("");
  console.log(" Companies:");
  for (const company of companiesSeeded) {
    console.log(`   - ${company.name} (${company.domain})  ${company.url}`);
  }
  console.log("");
  console.log(" Analytics:");
  console.log(`   window:        ${seedWindowDays()[0]} → ${seedWindowDays().at(-1)} (90 days)`);
  console.log(`   pageviews:     ${analytics.pageviews.toLocaleString()} (non-bot)`);
  console.log(`   bot pageviews: ${analytics.bots.toLocaleString()}`);
  console.log(`   raw events:    ${analytics.events.toLocaleString()}`);
  console.log(`   visitors (90d): ${analytics.visitors.toLocaleString()} across companies/days`);
  console.log(`   HLL uniques:   ${rollups.hll}${rollups.redisError ? ` (${rollups.redisError})` : ""}`);
  console.log("");
  console.log(" Row counts:");
  for (const [table, count] of counts) {
    console.log(`   ${table.padEnd(24)} ${count.toLocaleString().padStart(12)}`);
  }
  console.log("============================================================\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  const unknown = args.filter((a) => a !== "--reset");
  if (unknown.length > 0) {
    fail(`Unknown argument(s): ${unknown.join(", ")}. Use --help.`);
  }
  const reset = args.includes("--reset");

  assertSafeEnvironment();

  const existing = await findDemoUser();
  if (existing && !reset) {
    fail(
      `Demo user ${DEMO_EMAIL} already exists. Re-run with --reset to wipe and reseed.`
    );
  }
  if (existing) {
    console.log(`[SEED] Resetting ${DEMO_EMAIL} and its companies…`);
    await resetDemoUser();
  }

  console.log(`[SEED] Environment OK (localhost database).`);
  console.log(`[SEED] Creating demo user ${DEMO_EMAIL}…`);
  const user = await seedDemoUser();
  await seedAuthSession(user.id);

  console.log(`[SEED] Creating ${COMPANIES.length} companies…`);
  const seeded = await seedCompanies(user);

  for (let i = 0; i < seeded.length; i++) {
    const company = seeded[i]!;
    console.log(`[SEED] ${company.name}: content (snapshots, docs, brand, keys, chats)…`);
    const result = await seedCompanyContent(company, user);
    console.log(
      `[SEED] ${company.name}: ${result.messages.toLocaleString()} messages, ${result.errors} errors, ${result.drafts} example drafts`
    );
  }
  await seedGlobalErrors();

  const days = seedWindowDays();
  console.log(`[SEED] Ensuring page_views partitions for ${days[0]} → ${days.at(-1)}…`);
  const partitions = await ensureSeedPartitions(days);
  console.log(`[SEED] Partitions ready: ${partitions.join(", ")}`);

  console.log("[SEED] Streaming raw analytics with COPY…");
  const analytics = await seedAnalyticsEvents(seeded);
  console.log(
    `[SEED] Raw events: ${analytics.events.toLocaleString()} ` +
      `(${analytics.pageviews.toLocaleString()} pageviews, ${analytics.bots.toLocaleString()} bots)`
  );

  console.log("[SEED] Building sessions, daily/hourly rollups and HLL uniques…");
  const rollups = await buildSeedRollups(days);

  const counts = await tableCounts([
    "users",
    "auth_sessions",
    "companies",
    "company_snapshots",
    "brands",
    "brand_stylesheets",
    "widget_keys",
    "widget_key_domains",
    "widget_theme_overrides",
    "documents",
    "chunks",
    "facts",
    "crawl_jobs",
    "enrichment_batches",
    "batch_files",
    "conversations",
    "messages",
    "page_views",
    "sessions",
    "metrics_daily",
    "metrics_hourly",
    "error_events",
  ]);

  printSummary(seeded, analytics, rollups, counts);
}

main()
  .catch((err) => {
    console.error("[SEED] Failed:", err?.message ?? err);
    if (err?.stack) console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeRedisConnection();
    } catch {}
    try {
      await client.end({ timeout: 5 });
    } catch {}
  });
