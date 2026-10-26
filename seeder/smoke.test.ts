/**
 * Seeder smoke test (docs/auth-tenancy.md §14.5).
 *
 * Read-only: asserts the seeded state against the documented volumes. It does
 * not run the seeder (a full run takes minutes); run `bun run seed` first and
 * then point both env vars at the seeded database:
 *
 *   DATABASE_URL=<seed db> SEED_DATABASE_URL=<seed db> bun test seeder/smoke.test.ts
 *
 * The test skips unless DATABASE_URL === SEED_DATABASE_URL, so an ordinary
 * `bun test` never touches a database. The URLs must name a database other
 * than the live dev database — the name has to contain "seed" for the same
 * reason the API tests require a name containing "test".
 */

import { describe, expect, test } from "bun:test";
import {
  authSessions,
  companies,
  companySnapshots,
  conversations,
  db,
  documents,
  errorEvents,
  messages,
  metricsDaily,
  metricsHourly,
  pageViews,
  sessions,
  sql,
  users,
  isUuid,
  widgetKeys,
  widgetKeyDomains,
} from "../packages/database/src/index";

const seedUrl = process.env.SEED_DATABASE_URL;
const usingSeedDb =
  Boolean(seedUrl) &&
  process.env.DATABASE_URL === seedUrl &&
  /seed/i.test(seedUrl ?? "");

const dbDescribe = usingSeedDb ? describe : describe.skip;

dbDescribe("demo seeder smoke", () => {
  test("demo user exists with an Argon2id password hash", async () => {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'demo@ag-ui.local'`)
      .limit(1);
    expect(user).toBeDefined();
    expect(user!.passwordHash?.startsWith("$argon2id$")).toBe(true);
    expect(isUuid(user!.id)).toBe(true);
  });

  test("exactly three companies, all owned by the demo user", async () => {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'demo@ag-ui.local'`)
      .limit(1);
    const rows = await db
      .select()
      .from(companies)
      .where(sql`${companies.ownerId} = ${user!.id}`);
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.domain))).toEqual(
      new Set(["northstarlabs.io", "harborandfinch.com", "lumenatelier.co"])
    );
  });

  test("raw analytics volume is the documented 'fat numbers' target", async () => {
    const [{ n: raw }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(pageViews)) as Array<{ n: number }>;
    const [{ n: sessionsN }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)) as Array<{ n: number }>;

    expect(raw).toBeGreaterThan(2_800_000); // ~2.96M rows incl. bots/interactions
    expect(sessionsN).toBeGreaterThan(500_000); // ~550k visits (~183k/company)
  });

  test("rollups cover the 90-day window for all three companies", async () => {
    const daily = await db
      .select({ companyId: metricsDaily.companyId, days: sql<number>`count(*)::int` })
      .from(metricsDaily)
      .groupBy(metricsDaily.companyId);
    expect(daily).toHaveLength(3);
    for (const row of daily) expect(row.days).toBe(90);

    const hourly = await db
      .select({ companyId: metricsHourly.companyId, hours: sql<number>`count(*)::int` })
      .from(metricsHourly)
      .groupBy(metricsHourly.companyId);
    expect(hourly).toHaveLength(3);
    for (const row of hourly) expect(row.hours).toBeGreaterThan(2_100);
  });

  test("content tables are populated per company", async () => {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'demo@ag-ui.local'`)
      .limit(1);
    const rows = await db
      .select({ id: companies.id })
      .from(companies)
      .where(sql`${companies.ownerId} = ${user!.id}`);

    for (const { id } of rows) {
      const [{ n: snapshots }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(companySnapshots)
        .where(sql`${companySnapshots.companyId} = ${id}`)) as Array<{ n: number }>;
      const [{ n: convos }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(conversations)
        .where(sql`${conversations.companyId} = ${id}`)) as Array<{ n: number }>;
      const [{ n: msgs }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(sql`${messages.conversationId} in (select id from conversations where company_id = ${id})`)) as Array<{ n: number }>;
      const [{ n: keys }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(widgetKeys)
        .where(sql`${widgetKeys.companyId} = ${id}`)) as Array<{ n: number }>;
      const [{ n: origins }] = (await db
        .select({ n: sql<number>`count(*)::int` })
        .from(widgetKeyDomains)
        .where(sql`${widgetKeyDomains.keyId} in (select id from widget_keys where company_id = ${id})`)) as Array<{ n: number }>;

      expect(snapshots).toBeGreaterThanOrEqual(5);
      expect(convos).toBeGreaterThan(1_100);
      expect(msgs).toBeGreaterThan(4_500);
      expect(keys).toBe(2);
      expect(origins).toBeGreaterThanOrEqual(4);
    }

    const [{ n: docs }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(documents)) as Array<{ n: number }>;
    expect(docs).toBeGreaterThan(300); // ~130–150 per company
  });

  test("errors are scoped and a few global rows exist", async () => {
    const [{ n: global }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(errorEvents)
      .where(sql`${errorEvents.companyId} is null`)) as Array<{ n: number }>;
    const [{ n: company }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(errorEvents)
      .where(sql`${errorEvents.companyId} is not null`)) as Array<{ n: number }>;
    expect(global).toBeGreaterThanOrEqual(4);
    expect(company).toBeGreaterThan(90);
  });

  test("a demo auth session exists (login-ready)", async () => {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = 'demo@ag-ui.local'`)
      .limit(1);
    const rows = await db
      .select()
      .from(authSessions)
      .where(sql`${authSessions.userId} = ${user!.id}`);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const row of rows) {
      expect(row.revokedAt).toBeNull();
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
  });
});
