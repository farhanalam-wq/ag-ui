# Analytics Runbook (first-party, free stack)

## Deploy order
1. Postgres + Redis up (`docker-compose.yml`); verify `DATABASE_URL`, `REDIS_HOST/PORT`.
2. Apply DDL — **`db:migrate` is the single path** (`bun run db:migrate`, root):
   - Fresh database → `db:migrate` applies `0000..0009` in order.
   - Existing database built with `drizzle-kit push` (no ledger) → baseline once,
     then migrate:
     `bun run db:baseline --through=0006_woozy_talos` → `bun run db:migrate`.
   `drizzle/0007_analytics.sql` owns the analytics tables (hand-written: `page_views`
   is RANGE-partitioned, which drizzle-kit cannot express).
   `0009_analytics_sessions.sql` adds `sessions.engaged` and
   `metrics_daily/metrics_hourly.engaged_sessions`; `0011_conversations_path.sql`
   adds `conversations.path` (the host page a conversation started on). Unrelated:
   `migrate-task1-task2.ts`, `migrate-drop-pgvector.ts` (pre-existing, destructive-adjacent
   — see Rollback).
3. Start API (`apps/api`), web (`apps/web`), and at least one worker
   (`workers/worker`; without it the analytics queue has no consumer and
   dashboards go flat — this is the #1 cause of "dead analytics").
4. Confirm: `GET /health` 200, `GET /api/analytics/cache-stats` responds,
   one `pageview` via a tracked page appears in realtime within ~1 min.

## Env (see .env.example → Analytics section)
`TRACK_RATE_PER_MIN/DAY`, `TRACK_QUOTA_PER_DAY`, `ANALYTICS_READ_COMPANY_PER_MIN/DAY`
(the per-tenant read budget), `ANALYTICS_READ_PER_MIN/DAY` (the per-IP backstop),
`ANALYTICS_ROLLUP_MS` (default 15 min), `ANALYTICS_RAW_RETAIN_MONTHS` (default 3).
All rate paths fail open when Redis is down (by design — availability over precision).

## API contract (v2)

Every analytics report answers with the same envelope:

```jsonc
{
  "kind": "website",                 // the report that answered
  "companyId": "uuid",
  "rangeDays": 30,
  "compare": "off",                 // or "previous-period" (acquisition)
  "totals": { "sessions": 120 },
  "previousTotals": { },            // only when compare = previous-period
  "trend": [ { "d": "2026-10-01", "sessions": 12 } ],
  "breakdowns": { "channel": [ { "label": "Direct", "sessions": 12 } ] },
  "freshness": { "computedAt": "…", "rollupLagMinutes": 4, "live": false,
                 "dataQuality": [ ], "notes": [ ] }
}
```

- `breakdowns` is keyed by **dimension id** (`channel`, `sourceMedium`,
  `campaign`, `landingPage`, `path`, `title`, `device`, `browser`, `os`,
  `hour`, `viewport`), never by a service-specific `by*` key.
- `X-Analytics-Cache` is `HIT` (fresh, no compute), `STALE` (served
  immediately while a refresh runs behind the request) or `MISS` (computed
  now). It is the only way to tell a stale read from a fresh one.
- `GET /api/analytics/cache-stats` returns the global hit/miss counters plus
  `namespaces`, one entry per report (`acquisition`, `agent-overview`,
  `agent-questions`, `voice`, …).
- A bad `range` is `422 { error }`, a company this session does not own is
  `404`, the read budget is `429` with `Retry-After`. The web client raises
  one `ApiError` carrying the status, code, details and `retryAfterSec`.

Website: `/api/analytics/website` returns `kind: "website"` — totals
(sessions, uniques, pageviews, engaged sessions, engagement rate, bounce rate,
pages per session, average engagement time, plus scroll/download/click counts),
a daily trend that includes engaged sessions, and
`breakdowns: { path, referrer, viewport }`. `uniques` is **absent** when the HLL
merge fails, never zero. An empty referrer is reported as `(direct)` and an
empty viewport as `(unknown)`, so the breakdown adds up to the KPI row; an
empty path is dropped — it is not a page.

The same payload carries `anomalies` and `anomalyThresholds`
(`{ minDaily, z }`). An anomaly is a day whose pageviews or sessions sit at
least `z` (2) standard deviations from the equal-length window immediately
before the report range, with at least `minDaily` (20) mean daily traffic in
that baseline; fewer than three baseline days flags nothing. Each anomaly names
the baseline window and the busiest channels for that day as **correlated
context, never a cause**. The baseline is aligned to the same calendar window
as the KPI row, so a flagged day is a day the totals already contain. The
array is empty when no day qualifies — that is a normal answer, not an error.

Website is one route with four tabs (`?tab=overview|acquisition|content|audience`);
Acquisition, Content and Audience read `/api/analytics/{acquisition,content,audience}`
and only the active tab is fetched. The old `/api/analytics/engagement` and
`/api/analytics/insights` routes are **gone**: engagement totals live in the
Website report (one helper, one definition) and anomalies live on the Website
Overview. A stale client calling the old paths gets `404`.

Agent routes: `/api/analytics/agent/overview` (sessions, opens, open rate,
questions), `/api/analytics/agent/questions` (volume, depth, panel time, by
page), `/api/analytics/agent/quality` (grounded rate, answers without a source,
answer-time percentiles, grounding by page) and `/api/analytics/agent/voice`. The older `/api/analytics/agent` and
`/api/analytics/voice` stay as shims for one release; they return the same
data under the older keys. Analytics exposes **14** routes today (including the
two shims and `/cache-stats`); the shims retire in the next commit, leaving 12.

## Time contract (UTC)
Every session in the pool is opened with `TimeZone=UTC` (a startup parameter, set in
`packages/database/src/index.ts`). This is part of the contract, not a preference:
- the naive `timestamp` columns (`conversations`, `messages`, `error_events`,
  `company_snapshots`) hold **UTC wall-clock**;
- day buckets and `metrics_daily.day` are **UTC days**;
- `now() - interval` on the SQL side means the same thing as `Date.now()` on the JS side.

If the database host is ever configured with a non-UTC default, the client pins it back
to UTC — do not remove that. Naive timestamps are read as UTC by Drizzle, so the two
sides agree only while the session timezone is UTC.

## Rollback
- Analytics DDL is additive + rerunnable (`IF NOT EXISTS` / DO-blocks). Rollback =
  forward-fix + **rebuild** (see Recompute below). A plain rerun of
  `buildDailyRollup` is *not* enough to repair a day: it upserts, and the orphan
  session rows written by the pre-`0009` logic cannot be removed by an upsert.
- Raw partitions: rollups preserve history; partition drops only remove raw
  detail older than the retain window (current + previous month never dropped).
- `migrate-drop-pgvector.ts` is NOT analytics scope: drops `chunks.embedding`
  (reversible via the ALTER documented in that file). Do not run blindly.
- Analytics DDL owner is `drizzle/0007_analytics.sql`. Do **not** use `db:push`
  on this database: it would create `page_views` unpartitioned and fight the
  runtime partition children. `db:migrate` (or `db:baseline` → `db:migrate`)
  is the only supported path.

## Fixture data (for review, not for production)
The analytics module has only ever been seen with a handful of rows in it, so
the repo ships a deterministic fixture:

```bash
bun run fixtures:analytics              # 90 days for two companies, then rolled up
bun run fixtures:analytics -- --days 30 # a shorter window
bun run fixtures:analytics:clear        # remove everything it created
```

It creates two companies with fixed ids — `Fixture Co (busy)` and
`Fixture Co (quiet)` — so the numbers can be reviewed on every surface and the
second company proves the tenant scoping. The seed is idempotent (fixed event
ids, `ON CONFLICT DO NOTHING`) and removable with one command: the companies
cascade to their events, sessions, rollups and conversations, and the Redis HLL
keys are deleted with them. It creates the `page_views` monthly partitions it
needs, exactly like the worker does.

**The window ends yesterday, not today.** The fixture never invents traffic in
the future: a seed that wrote afternoon visits at eight in the morning made the
rollup-based reports and the session-table-based reports disagree by exactly
the traffic it had made up. Today is deliberately empty.

**Do not run it against a production database** — it inserts 10k+ events and
rebuilds 90 days of rollups.

## The visitor profile (browser, OS, timezone)

Three columns are derived **at the collector** and stored, so no report ever
re-parses a user agent:

| Column | Where it comes from |
|---|---|
| `page_views.browser` | the request's user agent, read by `ua-parser-js` and mapped into the product's six-value taxonomy |
| `page_views.os` | the same user agent, the product's six-value operating systems |
| `page_views.tz_offset` | the visitor's IANA timezone (the snippet sends the zone), resolved to minutes east of UTC for the event's instant — so daylight saving is right |
| `sessions.device` / `.browser` / `.os` / `.tz_offset` | copied by the rollup from the event that opened the visit, so a breakdown counts visits |

The snippet change is one field (`tz`). A visitor with no zone is bucketed in
UTC and the report says so (`timezone-unavailable`); events collected before
this landed have no profile at all (`dimensions-unavailable`).

Country is **not** collected: the GeoIP source is still an open decision
(`docs/analytics-rebuild.md` D12). The raw IP is never stored either way.

## The agent panel (text chat)

The panel's four events are emitted by the **parent page**, because the panel is
a cross-origin iframe and only the parent knows the host path. The iframe never
emits analytics; it sends one `chat_message` notification over the C7 bridge.

| Event | When | `meta` |
|---|---|---|
| `chat_open` | the orb opens the panel | `{ turns: 0 }` |
| `chat_message` | the visitor sends a question | `{ turns }` — the parent's running count |
| `chat_close` | the panel closes, or the tab goes away | `{ durationSec, turns }` |

Counts only: the collector rebuilds the meta from numbers
(`events.ts` → `chatEventMeta`), so the question text, a page title or a
conversation id cannot be stored even if a client sends one.

`chat_open` and `chat_message` flow into the rollup columns
(`metrics_daily.chat_opens`, `.messages`). `chat_close` has no column and is
read from the event slice, like voice.

`GET /api/analytics/agent` returns: agent sessions, opens and open rate,
questions, questions per session, average/max panel time, voice calls, the
text-vs-voice share, a daily trend and questions by page.

Verifying by hand:

```sql
SELECT type, meta, path FROM page_views
WHERE company_id = '<company>'
  AND type IN ('chat_open','chat_message','chat_close','voice_start')
ORDER BY created_at DESC LIMIT 20;
```

If the Agent numbers stay at zero while the site has traffic:
- an older `embed.js` is installed (the panel events are new) — re-paste the snippet;
- `data-track="on"` is missing;
- nobody opened the widget — `agentSessions` counts sessions that actually asked,
  so opens alone will not move it.

Two unit notes, so a number is never read as something it is not:
- `agentSessions` counts **browser sessions** (one tab), not the rollup's visit
  islands; a pause longer than 30 minutes inside one tab counts once here and
  twice on the Website page.
- `textVsVoice` is a share of **agent sessions**, because a voice call and a
  typed question are only comparable as sessions.

## Agent quality (grounded answers, answer time)

`GET /api/analytics/agent/quality` reads `messages`, not events:

- **Answers** = assistant messages in range.
- **Grounded** = answers whose `evidence` array has at least one retrieved
  source. `groundedAnswerRate` is that share; `answersWithoutEvidence` is the
  remainder, which is the content team's to-do list. There is **no separate
  "fallback rate"** — the pipeline has no deterministic fallback branch, so it
  would be the same number inverted.
- **Answer time** = assistant `created_at` minus the preceding user
  `created_at` in the same conversation. That is generation + streaming;
  retrieval is excluded, because the user row is written immediately before
  the model call. Time-to-first-token is not stored. The median and p95 come
  from one windowed `percentile_cont` query — the only raw SQL in the report,
  because the builder cannot express a windowed percentile.
- **By page** joins `conversations.path`. The panel forwards its host path over
  `postMessage` (`ag-ui/context`), the API normalises it with the same rule as
  the collector (`normalizePagePath`) and stores it once, at conversation
  creation. A conversation with no known path is excluded from the per-page
  breakdown, never counted as `/`.

Nothing here reads `messages.content`: the report is counts, and no question
text, snippet or transcript is returned or logged.

**If the numbers are zero:** confirm the fixture (or a real conversation) has
`conversations.path` set — rows created before `0011` have no path, so the
per-page card is empty even when the headline numbers are fine. If *answers* is
zero while the Agent → Questions tab shows questions, the site is running an
older embed snippet: `chat_message` events are counted, but only the chat
pipeline writes `messages`.

## Voice (counts only)

Voice is measured from two events and **never stores what was said** (decision
O-3, option V-B in `docs/analytics-rebuild.md`):

| Event | When | `meta` |
|---|---|---|
| `voice_start` | the LiveKit room connects | `{}` |
| `voice_end` | the call ends | `{ durationSec, turns }` |

`abandoned` is **derived at the collector** (`turns === 0`), not reported. The
validator rebuilds `meta` from those two numbers, so a client that posts a
transcript has it dropped before the row is written.

How the event reaches us: the call runs in the chat iframe, which cannot see the
host page. It posts `{ type: "ag-ui/agent-event", event, durationSec, turns }`
to `window.parent`; `embed.js` accepts it only from its own iframe
(`event.source === frame.contentWindow`), rebuilds the fields and emits the
track event with the real page context. The iframe never posts analytics
directly.

There is **no migration and no conversation row** for voice — the report reads
the raw `page_views` slice (one event per call). `GET /api/analytics/agent/voice`
(or the older `/api/analytics/voice`) returns calls, turns, average/max
duration, silent calls, silent-call rate, and the text-vs-voice share. A visit
with a voice call counts as engaged.

Verifying by hand:

```sql
SELECT type, meta FROM page_views
WHERE company_id = '<company>' AND type IN ('voice_start','voice_end')
ORDER BY created_at DESC LIMIT 10;
```

If voice numbers stay at zero while the site has traffic:
- the host page runs an older `embed.js` (the bridge is new) — re-paste the snippet;
- `data-track="on"` is missing (all analytics, not just voice, are off);
- the call never connected (a token or microphone failure produces no `voice_start`).

The text-vs-voice split is **not** shipped. The text side would be the
`conversations` table, which today mixes widget and dashboard conversations and
has no `source_path`, so the ratio would be a made-up number. It arrives with the
chat instrumentation (`chat_open` / `chat_message` / `chat_close`).

## Recompute / repair
`bun run rebuild:analytics --cwd workers/worker` rebuilds the session rows, the
daily metrics and the unique-visitor HLL for a date range, straight from the raw
events.

```bash
bun run --cwd workers/worker rebuild:analytics                 # last 30 days
bun run --cwd workers/worker rebuild:analytics 2026-10-01 2026-10-07
```

Run it when:
- upgrading from a build before `0009_analytics_sessions.sql` — historical
  `sessions` rows are visits split at every hour boundary (one visit counted
  twice) and `engaged_sessions` is 0 everywhere;
- the rollup was stopped for a while and the backfill is missing days;
- you need to drop bot traffic that reached the rollup before the `is_bot`
  filter existed (the HLL is cleared and rebuilt, because `PFADD` cannot
  subtract).

It is idempotent and derived entirely from `page_views`, so it is safe to
re-run. It only reaches back as far as the raw partitions that still exist
(`ANALYTICS_RAW_RETAIN_MONTHS`, default 3).

## Health & monitoring (all built-in, no paid services)
- `GET /health` (API liveness), `GET /api/analytics/cache-stats` (`hits/misses`).
- Logs: `[ANALYTICS] slow recompute: <key> took <ms>` fires over 2s.
- Suggested alerts: slow-recompute rate rising; `ana:misses` spiking (cache
  bypass/stampede); BullMQ `analytics-queue` depth growing (worker down);
  HTTP 429 rate on `/api/analytics/*` (scraper or too-tight budget).
- No OAuth/GDPR-vendor surface: cookieless, hashed-IP, DNT-respected by construction.

## Troubleshooting
| Symptom | Check in order |
|---|---|
| Dashboard flat, timestamp current | Worker running? Queue depth growing? |
| `ERR_FAILED` on `/track`, 202 server-side | CORS/credentials (fixed Phase A); check ACAO echo |
| Fresh code, stale numbers | Restart `:3001` (`--watch` ignores symlinked packages); bust `ana:v1:*`; remember SWR serves stale ≤5 min |
| Same-second duplicate pageviews | Two snippet tags, or Live Server multi-reload (each reload = 1 legitimate view) |
| Test rows polluting counts | `pNtest` domains + `adedupe:`/`ahll:`/`ana:v1:` key sweeps (see phase assert scripts, since removed) |
| Totals ≠ realtime | Expected: totals move on the 15-min rollup; realtime is the 30-min raw window |
| 400 `organic-search-unsupported` | By design: no Organic Search bucket first-party; search referrers are Referral |

## Known limitations (operator-owned)
- No user↔company authorization on analytics reads **until auth lands** (pre-existing; `companyId` is
  the only boundary today). The auth contract is `docs/auth-tenancy.md`; do not add a local guard.
- Cold-report p95 ~0.85s on dev hardware (measured Phase 8); no production SLA claimed.
- Channel attribution is referrer+UTM only (Direct/Unassigned for the unattributable).
- `newUsers` metric still `planned`. A "session" is a visit — activity with no
  gap wider than 30 minutes — and every surface counts the same unit; the
  rollup owns the per-visit `engaged` verdict and the reports read it back.
- No CI and no feature-flag system in repo: release gate is `turbo run build` +
  `bun test` (both green at Phase 9); releases are branch-based.
