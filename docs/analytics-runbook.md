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
   `metrics_daily/metrics_hourly.engaged_sessions`. Unrelated:
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
