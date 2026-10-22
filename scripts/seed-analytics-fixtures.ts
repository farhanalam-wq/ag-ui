/**
 * scripts/seed-analytics-fixtures.ts
 *
 * Seeds a deterministic analytics fixture: 90 days of events, conversations
 * and messages for one busy company, plus a second, nearly-empty company for
 * isolation checks.
 *
 * The module has never been seen with data on screen, so this is what makes
 * "review every page with numbers" possible (docs/analytics-rebuild.md §12.5).
 *
 * Usage:
 *   bun scripts/seed-analytics-fixtures.ts            # seed (idempotent)
 *   bun scripts/seed-analytics-fixtures.ts --clear    # remove everything it made
 *   bun scripts/seed-analytics-fixtures.ts --days 30  # a shorter window
 *
 * Everything it creates is owned by two fixed company ids, so `--clear` is a
 * single command: the companies cascade to their events, sessions, rollups
 * and conversations, and the Redis HLL keys are deleted by hand.
 */

import {
  client,
  db,
  companies,
  conversations,
  messages as messagesTable,
  pageViews,
  inArray,
  getRedisClient,
  closeRedisConnection,
} from "../packages/database/src/index";
import { buildDailyRollup, rebuildDailyHll, dailyUniquesKey } from "../packages/analytics/src/index";

/** The two fixture companies. Fixed ids so `--clear` can find them again. */
export const FIXTURE_COMPANY_A = "a0000000-0000-4000-8000-000000000001";
export const FIXTURE_COMPANY_B = "a0000000-0000-4000-8000-000000000002";
const FIXTURE_COMPANIES = [FIXTURE_COMPANY_A, FIXTURE_COMPANY_B];

/** Everything the fixture writes carries this prefix, so `--clear` is exact. */
const EVENT_PREFIX = "fx-";

const PATHS = [
  "/", "/pricing", "/product", "/docs", "/blog/analytics-guide",
  "/blog/session-lag", "/contact", "/demo", "/security", "/integrations",
] as const;

const REFERRERS = [
  "", "", "", "", "",
  "https://news.ycombinator.com/", "https://www.google.com/", "https://x.com/",
  "https://www.linkedin.com/", "https://github.com/", "https://duckduckgo.com/",
] as const;

const CAMPAIGNS = ["", "", "", "", "", "q3-launch", "brand-refresh", "docs-push"] as const;

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
] as const;

const BOT_AGENTS = [
  "Googlebot/2.1 (+http://www.google.com/bot.html)",
  "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
  "curl/8.4.0",
] as const;

const QUESTIONS = [
  "How much does the Team plan cost?",
  "Do you support SSO with Okta?",
  "What is your uptime SLA?",
  "Can I migrate from a CSV export?",
  "Is there an EU data residency option?",
  "How long does onboarding take?",
  "Do you offer annual billing with a discount?",
  "What integrations do you support?",
] as const;

const ANSWERS = [
  "The Team plan is $49 per seat per month, billed monthly or annually.",
  "Yes — SAML SSO works with Okta, Entra ID and Google Workspace.",
  "Our SLA is 99.9% monthly uptime, with credits for anything below it.",
  "We have a guided CSV importer, and our team reviews larger migrations by hand.",
  "Yes. EU data residency is available on the Business plan and above.",
  "Most teams are live in under a day. Larger rollouts usually take a week.",
  "Annual billing saves 20% compared with paying monthly.",
  "We integrate with Slack, HubSpot, Jira, Notion, Segment and Webhooks.",
] as const;

/** Deterministic PRNG (mulberry32) — the same seed, the same numbers. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function uuidFrom(seed: number): string {
  const hex = seed.toString(16).padStart(8, "0");
  return `f0000000-0000-4000-8000-${hex.slice(0, 12).padEnd(12, "0")}`;
}

interface EventRow {
  eventId: string;
  type: string;
  companyId: string;
  sessionHash: string;
  visitorHash: string;
  url: string;
  path: string;
  referrer: string;
  viewport: string;
  userAgent: string;
  isBot: boolean;
  value: string | null;
  meta: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * One day of traffic for a company.
 *
 * The shape is deliberately ordinary: a weekly rhythm, a slow growth trend, a
 * few bots, and the interactions that make the engagement and content
 * numbers non-zero. `anchorStart` is the first day's midnight, so the last
 * day is today.
 */
function dayEvents(
  companyId: string,
  dayIndex: number,
  totalDays: number,
  busy: boolean,
  anchorStart: number
): EventRow[] {
  const rand = rng(hash32(`${companyId}:${dayIndex}`));
  const rows: EventRow[] = [];
  const dayStart = anchorStart + dayIndex * 86_400_000;

  // Traffic: a weekly rhythm (weekends are quieter) and a growth trend.
  const weekday = new Date(dayStart).getUTCDay();
  const weekendFactor = weekday === 0 || weekday === 6 ? 0.45 : 1;
  const growth = 0.6 + (dayIndex / totalDays) * 0.8;
  const base = busy ? 46 : 3;
  const visits = Math.max(1, Math.round(base * weekendFactor * growth * (0.75 + rand() * 0.5)));

  for (let v = 0; v < visits; v++) {
    const isBot = rand() < 0.08;
    const sessionHash = uuidFrom(hash32(`${companyId}:${dayIndex}:v${v}`));
    const visitorHash = uuidFrom(hash32(`${companyId}:visitor:${dayIndex}:${Math.floor(v / 2)}`));
    const ua = isBot ? BOT_AGENTS[Math.floor(rand() * BOT_AGENTS.length)]! : USER_AGENTS[Math.floor(rand() * USER_AGENTS.length)]!;
    const viewport = isBot ? "" : rand() < 0.45 ? "390x844" : rand() < 0.5 ? "768x1024" : "1440x900";
    const referrer = REFERRERS[Math.floor(rand() * REFERRERS.length)]!;
    const campaign = CAMPAIGNS[Math.floor(rand() * CAMPAIGNS.length)]!;
    const pages = 1 + Math.floor(rand() * (busy ? 5 : 2));
    const firstPath = PATHS[Math.floor(rand() * PATHS.length)]!;

    // The visit happens somewhere in the working day, with heartbeats.
    const startHour = 7 + Math.floor(rand() * 13);
    const startMinute = Math.floor(rand() * 60);
    const start = dayStart + startHour * 3_600_000 + startMinute * 60_000;

    let seq = 0;
    const push = (type: string, path: string, at: Date, value: string | null = null, meta: Record<string, unknown> | null = null) => {
      const url = campaign
        ? `https://fixture.example${path}?utm_source=fixture&utm_medium=cpc&utm_campaign=${campaign}`
        : `https://fixture.example${path}`;
      rows.push({
        eventId: `${EVENT_PREFIX}${companyId.slice(0, 8)}${dayIndex}-${v}-${seq++}`,
        type,
        companyId,
        sessionHash,
        visitorHash,
        url,
        path,
        referrer,
        viewport,
        userAgent: ua,
        isBot,
        value,
        meta,
        createdAt: at,
      });
    };

    for (let p = 0; p < pages; p++) {
      const path = p === 0 ? firstPath : PATHS[Math.floor(rand() * PATHS.length)]!;
      const at = new Date(start + p * (40_000 + Math.floor(rand() * 90_000)));
      push("pageview", path, at, null, { title: `Fixture — ${path}` });
      if (!isBot && rand() < 0.35) push("scroll", path, new Date(at.getTime() + 5_000));
      if (!isBot && rand() < 0.12) push("download", path, new Date(at.getTime() + 8_000));
      if (!isBot && rand() < 0.18) push("click", path, new Date(at.getTime() + 9_000));
    }
    if (!isBot && rand() < 0.22) push("chat_open", firstPath, new Date(start + 30_000));
    if (!isBot && rand() < 0.15) push("chat_message", firstPath, new Date(start + 40_000));
    if (!isBot && rand() < 0.05) {
      push("conversion", firstPath, new Date(start + 120_000), String(49 + Math.floor(rand() * 450)));
    }
    if (!isBot) {
      for (let hb = 0; hb < 3; hb++) {
        push("heartbeat", firstPath, new Date(start + (hb + 1) * 15_000));
      }
    }
  }
  return rows;
}

/** Conversations with messages, so the agent-side numbers are not empty. */
function conversationRows(companyId: string, days: number) {
  const rand = rng(hash32(`${companyId}:conversations`));
  const convos: Array<{ id: string; companyId: string; title: string; createdAt: Date }> = [];
  const msgs: Array<{
    id: string; conversationId: string; role: string; content: string;
    evidence: unknown; visualSpec: unknown; createdAt: Date;
  }> = [];

  const count = 40;
  for (let i = 0; i < count; i++) {
    const id = uuidFrom(hash32(`${companyId}:convo:${i}`));
    const createdAt = new Date(Date.now() - Math.floor(rand() * days * 86_400_000));
    const q = QUESTIONS[Math.floor(rand() * QUESTIONS.length)]!;
    const a = ANSWERS[Math.floor(rand() * ANSWERS.length)]!;
    const grounded = rand() < 0.65;
    convos.push({ id, companyId, title: q.slice(0, 60), createdAt });
    msgs.push({
      id: uuidFrom(hash32(`${companyId}:msg:${i}:u`)),
      conversationId: id,
      role: "user",
      content: q,
      evidence: null,
      visualSpec: null,
      createdAt: new Date(createdAt.getTime() + 1000),
    });
    msgs.push({
      id: uuidFrom(hash32(`${companyId}:msg:${i}:a`)),
      conversationId: id,
      role: "assistant",
      content: a,
      // Grounded answers carry evidence; the rest are the fallback case the
      // trust metrics are supposed to surface. The shape is the one the chat
      // pipeline writes: an array of evidence records.
      evidence: grounded
        ? [
            {
              sourceId: `fixture-doc-${i}`,
              url: `https://fixture-a.example/docs/${i}`,
              pageTitle: "Fixture documentation",
              snippet: a.slice(0, 60),
              type: "chunk",
              score: 0.82,
            },
          ]
        : null,
      visualSpec: null,
      createdAt: new Date(createdAt.getTime() + 2200),
    });
    if (rand() < 0.4) {
      msgs.push({
        id: uuidFrom(hash32(`${companyId}:msg:${i}:u2`)),
        conversationId: id,
        role: "user",
        content: "And is that per seat?",
        evidence: null,
        visualSpec: null,
        createdAt: new Date(createdAt.getTime() + 30_000),
      });
    }
  }
  return { convos, msgs };
}

/**
 * The monthly partitions of `page_views` are created on demand by the
 * worker; the seed has to do the same or the insert has nowhere to land.
 */
async function ensurePartitions(rows: EventRow[]): Promise<void> {
  const months = new Map<string, { from: string; to: string }>();
  for (const r of rows) {
    const d = r.createdAt;
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    if (months.has(key)) continue;
    const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    months.set(key, { from: from.toISOString(), to: to.toISOString() });
  }
  for (const [key, { from, to }] of months) {
    // CREATE TABLE/INDEX IF NOT EXISTS emits 42P07 notices on first touch;
    // mute them the way the worker does, so the log stays readable.
    await client.begin(async (tx) => {
      await tx`SET LOCAL client_min_messages TO WARNING`;
      await tx.unsafe(
        `CREATE TABLE IF NOT EXISTS page_views_${key} PARTITION OF page_views FOR VALUES FROM ('${from}') TO ('${to}');`
      );
      await tx.unsafe(
        `CREATE INDEX IF NOT EXISTS page_views_${key}_company_time_idx ON page_views_${key} (company_id, created_at);`
      );
      await tx.unsafe(
        `CREATE INDEX IF NOT EXISTS page_views_${key}_session_idx ON page_views_${key} (session_hash);`
      );
    });
  }
}

async function clearFixtures(redis: { del(...keys: string[]): Promise<unknown> }) {
  const existing = await db.select({ id: companies.id }).from(companies).where(inArray(companies.id, FIXTURE_COMPANIES));
  for (const { id } of existing) {
    for (let d = 0; d < 200; d++) {
      const day = new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);
      await redis.del(dailyUniquesKey(id, day));
    }
  }
  // Companies cascade to events, sessions, rollups and conversations.
  await db.delete(companies).where(inArray(companies.id, FIXTURE_COMPANIES));
  // Belt and braces: anything the fixture wrote under its own id prefix.
  await client.unsafe(`DELETE FROM page_views WHERE event_id LIKE $1`, [`${EVENT_PREFIX}%`]);
  await client.unsafe(`DELETE FROM sessions WHERE session_hash IN (SELECT DISTINCT session_hash FROM page_views WHERE event_id LIKE $1)`, [`${EVENT_PREFIX}%`]);
  console.log(`[FIXTURES] cleared ${existing.length} fixture company(ies)`);
}

async function main() {
  const args = process.argv.slice(2);
  const days = Number(args[args.indexOf("--days") + 1]) || 90;
  const redis = await getRedisClient();
  if (!redis) {
    console.error("[FIXTURES] Redis is unavailable — cannot seed the HLL uniques");
    process.exit(1);
  }

  if (args.includes("--clear")) {
    await clearFixtures(redis);
    await closeRedisConnection();
    await client.end();
    return;
  }

  // Fresh start, so a re-seed is exactly the same data.
  await clearFixtures(redis);

  await db.insert(companies).values([
    { id: FIXTURE_COMPANY_A, name: "Fixture Co (busy)", domain: "fixture-a.example", url: "https://fixture-a.example" },
    { id: FIXTURE_COMPANY_B, name: "Fixture Co (quiet)", domain: "fixture-b.example", url: "https://fixture-b.example" },
  ]).onConflictDoNothing();

  const all: EventRow[] = [];
  const today = new Date();
  const todayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const anchorStart = todayStart - (days - 1) * 86_400_000;
  for (let d = 0; d < days; d++) {
    all.push(...dayEvents(FIXTURE_COMPANY_A, d, days, true, anchorStart));
    all.push(...dayEvents(FIXTURE_COMPANY_B, d, days, false, anchorStart));
  }

  await ensurePartitions(all);

  const CHUNK = 500;
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK);
    await db.insert(pageViews).values(slice.map((r) => ({
      eventId: r.eventId,
      type: r.type,
      companyId: r.companyId,
      widgetKeyId: null,
      sessionHash: r.sessionHash,
      visitorHash: r.visitorHash,
      url: r.url,
      path: r.path,
      referrer: r.referrer,
      viewport: r.viewport,
      userAgent: r.userAgent,
      isBot: r.isBot,
      value: r.value,
      meta: r.meta,
      createdAt: r.createdAt,
    }))).onConflictDoNothing();
  }
  console.log(`[FIXTURES] ${all.length} events across ${days} days`);

  const { convos, msgs } = conversationRows(FIXTURE_COMPANY_A, days);
  await db.insert(conversations).values(convos.map((c) => ({
    id: c.id,
    companyId: c.companyId,
    title: c.title,
    createdAt: c.createdAt,
  }))).onConflictDoNothing();
  await db.insert(messagesTable).values(msgs.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    role: m.role,
    content: m.content,
    evidence: m.evidence,
    visualSpec: m.visualSpec,
    createdAt: m.createdAt,
  }))).onConflictDoNothing();
  console.log(`[FIXTURES] ${convos.length} conversations, ${msgs.length} messages`);

  // Roll the fixtures up so the reports have rollup-bound numbers too.
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(todayStart - d * 86_400_000).toISOString().slice(0, 10);
    await buildDailyRollup(day);
  }
  for (let d = days - 1; d >= 0; d--) {
    const day = new Date(todayStart - d * 86_400_000).toISOString().slice(0, 10);
    await rebuildDailyHll(redis, day);
  }
  console.log(`[FIXTURES] rolled up ${days} days`);

  await closeRedisConnection();
  await client.end();
}

main().catch((err) => {
  console.error(`[FIXTURES] failed: ${err?.message ?? err}`);
  process.exit(1);
});
