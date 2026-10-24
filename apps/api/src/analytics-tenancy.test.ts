/**
 * Analytics and operations tenancy matrix.
 *
 * DB-backed: skipped unless `TEST_DATABASE_URL` is present and the preload has
 * pointed `DATABASE_URL` at it. See docs/auth-tenancy.md §7.5 and §14.2.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import {
  authSessions,
  companies,
  companySnapshots,
  conversations,
  crawlJobs,
  db,
  errorEvents,
  getRedisClient,
  messages,
  metricsDaily,
  pageViews,
  sessions,
  sql,
  users,
} from "@ag-ui/database";

const testUrl = process.env.TEST_DATABASE_URL;
const usingTestDb = Boolean(testUrl) && process.env.DATABASE_URL === testUrl;

/**
 * Loaded only for a DB-backed run. Importing the app wires the real queues and
 * Redis clients, which must not happen during an ordinary `bun test` that
 * skips this file (docs/auth-tenancy.md §14.6).
 */
type App = (typeof import("./server"))["app"];
let app!: App;

const dbDescribe = usingTestDb ? describe : describe.skip;

const userA = randomUUID();
const userB = randomUUID();
const companyA = randomUUID();
const companyB = randomUUID();
const conversationA = randomUUID();
const conversationB = randomUUID();
const snapshotA = randomUUID();
const snapshotB = randomUUID();
const jobA = randomUUID();
const jobB = randomUUID();
const errorA = randomUUID();
const errorB = randomUUID();
const globalError = randomUUID();
const tokenA = `test-token-a-${randomUUID()}`;
const tokenB = `test-token-b-${randomUUID()}`;
const cookieA = `ag_session=${tokenA}`;
const cookieB = `ag_session=${tokenB}`;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function dayUTC(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function request(path: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return app.handle(new Request(`http://localhost${path}`, { headers }));
}

async function cleanup() {
  await db.execute(
    sql`DELETE FROM error_events WHERE company_id IN (${companyA}, ${companyB}) OR id = ${globalError}`
  );
  await db.execute(
    sql`DELETE FROM companies WHERE id IN (${companyA}, ${companyB})`
  );
  await db.execute(sql`DELETE FROM users WHERE id IN (${userA}, ${userB})`);

  try {
    const redis = await getRedisClient();
    if (redis) {
      for (const pattern of [
        `ana:*:${companyA}:*`,
        `ana:*:${companyB}:*`,
        `ahll:${companyA}:*`,
        `ahll:${companyB}:*`,
        `ahll:merge:${companyA}:*`,
        `ahll:merge:${companyB}:*`,
      ]) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) await redis.del(...keys);
      }
    }
  } catch {
    // best-effort cache cleanup
  }
}

dbDescribe("analytics and operations tenancy", () => {
  beforeAll(async () => {
    app = (await import("./server")).app;
    await cleanup();

    await db.insert(users).values([
      { id: userA, email: `alice-${userA}@example.test`, name: "Alice A6" },
      { id: userB, email: `bob-${userB}@example.test`, name: "Bob A6" },
    ]);

    await db.insert(companies).values([
      {
        id: companyA,
        ownerId: userA,
        domain: `a-${companyA}.example`,
        name: "Alpha A6",
        url: "https://alpha.example",
      },
      {
        id: companyB,
        ownerId: userB,
        domain: `b-${companyB}.example`,
        name: "Beta A6",
        url: "https://beta.example",
      },
    ]);

    await db.insert(authSessions).values([
      {
        userId: userA,
        tokenHash: hashToken(tokenA),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      {
        userId: userB,
        tokenHash: hashToken(tokenB),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    ]);

    // Fourteen days of rollups with deliberately different volumes.
    const metrics = [] as (typeof metricsDaily.$inferInsert)[];
    for (let i = 0; i < 14; i++) {
      const day = dayUTC(i);
      metrics.push(
        {
          companyId: companyA,
          day,
          pageviews: 100,
          sessions: 10,
          engagedSessions: 5,
          conversions: 1,
          revenue: "10.00",
          chatOpens: 2,
          messages: 4,
          scrolls: 1,
          downloads: 0,
          clicks: 1,
          heartbeats: 0,
        },
        {
          companyId: companyB,
          day,
          pageviews: 900,
          sessions: 90,
          engagedSessions: 45,
          conversions: 9,
          revenue: "90.00",
          chatOpens: 20,
          messages: 40,
          scrolls: 10,
          downloads: 2,
          clicks: 5,
          heartbeats: 1,
        }
      );
    }
    await db.insert(metricsDaily).values(metrics);

    const now = new Date();
    await db.insert(sessions).values([
      {
        companyId: companyA,
        sessionHash: `a-${randomUUID()}`,
        startedAt: now,
        endedAt: now,
        pageviewCount: 1,
        activeSeconds: 30,
        device: "desktop",
        browser: "Chrome",
        os: "Linux",
        converted: true,
        revenue: "10.00",
        engaged: true,
      },
      {
        companyId: companyB,
        sessionHash: `b-${randomUUID()}`,
        startedAt: now,
        endedAt: now,
        pageviewCount: 2,
        activeSeconds: 90,
        device: "mobile",
        browser: "Safari",
        os: "iOS",
        converted: true,
        revenue: "90.00",
        engaged: true,
      },
    ]);

    const baseView = {
      eventId: randomUUID(),
      companyId: companyA,
      sessionHash: `a-${randomUUID()}`,
      visitorHash: `av-${randomUUID()}`,
      url: "https://alpha.example/a-only?utm_source=google&utm_medium=cpc&utm_campaign=alpha",
      path: "/a-only",
      referrer: "https://google.com/",
      viewport: "1440x900",
      userAgent: "Mozilla/5.0 Chrome",
      browser: "Chrome",
      os: "Linux",
      tzOffset: 0,
      isBot: false,
      createdAt: now,
    };
    const baseViewB = {
      ...baseView,
      eventId: randomUUID(),
      companyId: companyB,
      sessionHash: `b-${randomUUID()}`,
      visitorHash: `bv-${randomUUID()}`,
      url: "https://beta.example/b-only",
      path: "/b-only",
      referrer: "https://bing.com/",
      viewport: "390x844",
      browser: "Safari",
      os: "iOS",
    };
    const types = [
      "pageview",
      "chat_open",
      "chat_message",
      "chat_close",
      "voice_start",
      "voice_end",
    ];
    await db.insert(pageViews).values(
      types.flatMap((type) => [
        {
          ...baseView,
          eventId: randomUUID(),
          type,
          meta:
            type === "pageview"
              ? { title: "Alpha only page" }
              : type === "chat_close"
                ? { durationSec: "12" }
                : {},
        },
        {
          ...baseViewB,
          eventId: randomUUID(),
          type,
          meta:
            type === "pageview"
              ? { title: "Beta only page" }
              : type === "chat_close"
                ? { durationSec: "24" }
                : {},
        },
      ])
    );

    await db.insert(conversations).values([
      { id: conversationA, companyId: companyA, title: "Alpha chat", path: "/a-only" },
      { id: conversationB, companyId: companyB, title: "Beta chat", path: "/b-only" },
    ]);
    await db.insert(messages).values([
      {
        conversationId: conversationA,
        role: "user",
        content: "Alpha only question",
        createdAt: now,
      },
      {
        conversationId: conversationA,
        role: "assistant",
        content: "Alpha only answer",
        evidence: [{ url: "https://alpha.example/a-only" }],
        createdAt: new Date(now.getTime() + 1000),
      },
      {
        conversationId: conversationB,
        role: "user",
        content: "Beta only question",
        createdAt: now,
      },
      {
        conversationId: conversationB,
        role: "assistant",
        content: "Beta only answer",
        evidence: [{ url: "https://beta.example/b-only" }],
        createdAt: new Date(now.getTime() + 1000),
      },
    ]);

    await db.insert(companySnapshots).values([
      {
        id: snapshotA,
        companyId: companyA,
        version: 1,
        status: "READY",
        pageCount: 1,
      },
      {
        id: snapshotB,
        companyId: companyB,
        version: 1,
        status: "READY",
        pageCount: 1,
      },
    ]);
    await db.insert(crawlJobs).values([
      {
        id: jobA,
        companyId: companyA,
        snapshotId: snapshotA,
        selectionHash: `a-${randomUUID()}`,
        idempotencyKey: `a-${randomUUID()}`,
        status: "READY",
        selected: 1,
        crawled: 1,
        docs: 1,
        failed: 0,
      },
      {
        id: jobB,
        companyId: companyB,
        snapshotId: snapshotB,
        selectionHash: `b-${randomUUID()}`,
        idempotencyKey: `b-${randomUUID()}`,
        status: "READY",
        selected: 1,
        crawled: 1,
        docs: 1,
        failed: 0,
      },
    ]);

    await db.insert(errorEvents).values([
      {
        id: errorA,
        level: "error",
        source: "api",
        message: "Alpha only error",
        companyId: companyA,
      },
      {
        id: errorB,
        level: "error",
        source: "api",
        message: "Beta only error",
        companyId: companyB,
      },
      {
        id: globalError,
        level: "error",
        source: "api",
        message: "Global only error",
        companyId: null,
      },
    ]);
  });

  afterAll(async () => {
    await cleanup();
  });

  const analyticsPaths = [
    "/api/analytics/overview",
    "/api/analytics/website",
    "/api/analytics/conversions",
    "/api/analytics/realtime",
    "/api/analytics/acquisition",
    "/api/analytics/audience",
    "/api/analytics/content",
    "/api/analytics/agent/overview",
    "/api/analytics/agent/questions",
    "/api/analytics/agent/quality",
    "/api/analytics/agent/voice",
  ];

  test("every analytics report is 401 anonymous, 200 own, 404 foreign", async () => {
    for (const path of analyticsPaths) {
      const own = `${path}?companyId=${companyA}&range=14d`;
      const foreign = `${path}?companyId=${companyB}&range=14d`;

      expect((await request(own)).status).toBe(401);
      expect((await request(own, cookieA)).status).toBe(200);
      expect((await request(foreign, cookieA)).status).toBe(404);
      expect((await request(own, cookieB)).status).toBe(404);
    }
  });

  test("analytics payloads contain no foreign company data", async () => {
    const foreignMarkers = [
      companyB,
      userB,
      conversationB,
      snapshotB,
      jobB,
      errorB,
      "Beta A6",
      "/b-only",
      "Beta only",
    ];

    for (const path of analyticsPaths) {
      const res = await request(`${path}?companyId=${companyA}&range=14d`, cookieA);
      const body = await res.text();
      for (const marker of foreignMarkers) {
        expect(body).not.toContain(marker);
      }
    }
  });

  test("same report returns each tenant's own data", async () => {
    const a = await request(
      `/api/analytics/website?companyId=${companyA}&range=14d`,
      cookieA
    );
    const b = await request(
      `/api/analytics/website?companyId=${companyB}&range=14d`,
      cookieB
    );

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);

    const aBody = await a.json();
    const bBody = await b.json();

    expect(aBody.totals.pageviews).toBe(1400);
    expect(bBody.totals.pageviews).toBe(12600);
    expect(JSON.stringify(aBody)).toContain("/a-only");
    expect(JSON.stringify(aBody)).not.toContain("/b-only");
    expect(JSON.stringify(bBody)).toContain("/b-only");
    expect(JSON.stringify(bBody)).not.toContain("/a-only");
  });

  test("operations reads are company-scoped and hide global rows", async () => {
    const own = await request(
      `/api/operations/errors?companyId=${companyA}`,
      cookieA
    );
    expect(own.status).toBe(200);
    const ownBody = await own.text();
    expect(ownBody).toContain(errorA);
    expect(ownBody).not.toContain(errorB);
    expect(ownBody).not.toContain(globalError);
    expect(ownBody).not.toContain("Global only error");

    const foreign = await request(
      `/api/operations/errors?companyId=${companyB}`,
      cookieA
    );
    expect(foreign.status).toBe(404);

    const activity = await request(
      `/api/operations/activity?companyId=${companyA}`,
      cookieA
    );
    expect(activity.status).toBe(200);
    const activityBody = await activity.text();
    expect(activityBody).toContain(jobA);
    expect(activityBody).toContain(snapshotA);
    expect(activityBody).not.toContain(jobB);
    expect(activityBody).not.toContain(snapshotB);

    const foreignActivity = await request(
      `/api/operations/activity?companyId=${companyB}`,
      cookieA
    );
    expect(foreignActivity.status).toBe(404);
  });

  test("cache-stats is authenticated and carries no tenant rows", async () => {
    expect((await request("/api/analytics/cache-stats")).status).toBe(401);

    const res = await request("/api/analytics/cache-stats", cookieA);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).not.toContain(companyA);
    expect(body).not.toContain(companyB);
    expect(body).not.toContain("Alpha A6");
    expect(body).not.toContain("Beta A6");

    const parsed = JSON.parse(body);
    expect(Object.keys(parsed).sort()).toEqual(["hits", "misses", "namespaces"]);
  });
});
