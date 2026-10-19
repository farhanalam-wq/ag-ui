# Analytics Runbook (first-party, free stack)

## Deploy order
1. Postgres + Redis up (`docker-compose.yml`); verify `DATABASE_URL`, `REDIS_HOST/PORT`.
2. Apply DDL — **`db:migrate` is the single path** (`bun run db:migrate`, root):
   - Fresh database → `db:migrate` applies `0000..0007` in order.
   - Existing database built with `drizzle-kit push` (no ledger) → baseline once,
     then migrate:
     `bun run db:baseline --through=0006_woozy_talos` → `bun run db:migrate`.
   `drizzle/0007_analytics.sql` owns the analytics tables (hand-written: `page_views`
   is RANGE-partitioned, which drizzle-kit cannot express). Unrelated:
   `migrate-task1-task2.ts`, `migrate-drop-pgvector.ts` (pre-existing, destructive-adjacent
   — see Rollback).
3. Start API (`apps/api`), web (`apps/web`), and at least one worker
   (`workers/worker`; without it the analytics queue has no consumer and
   dashboards go flat — this is the #1 cause of "dead analytics").
4. Confirm: `GET /health` 200, `GET /api/analytics/cache-stats` responds,
   one `pageview` via a tracked page appears in realtime within ~1 min.

## Env (see .env.example → Analytics section)
`TRACK_RATE_PER_MIN/DAY`, `TRACK_QUOTA_PER_DAY`, `ANALYTICS_READ_PER_MIN/DAY`,
`ANALYTICS_ROLLUP_MS` (default 15 min), `ANALYTICS_RAW_RETAIN_MONTHS` (default 3).
All rate paths fail open when Redis is down (by design — availability over precision).

## Rollback
- Analytics DDL is additive + rerunnable (`IF NOT EXISTS` / DO-blocks). Rollback =
  forward-fix + recompute (`buildDailyRollup` is idempotent; rerun any day).
- Raw partitions: rollups preserve history; partition drops only remove raw
  detail older than the retain window (current + previous month never dropped).
- `migrate-drop-pgvector.ts` is NOT analytics scope: drops `chunks.embedding`
  (reversible via the ALTER documented in that file). Do not run blindly.
- Analytics DDL owner is `drizzle/0007_analytics.sql`. Do **not** use `db:push`
  on this database: it would create `page_views` unpartitioned and fight the
  runtime partition children. `db:migrate` (or `db:baseline` → `db:migrate`)
  is the only supported path.

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
- No user↔company authorization on analytics reads (pre-existing; companyId is the boundary).
- Cold-report p95 ~0.85s on dev hardware (measured Phase 8); no production SLA claimed.
- Channel attribution is referrer+UTM only (Direct/Unassigned for the unattributable).
- `newUsers` metric still `planned`; engagement sessions are raw tab-sessions.
- No CI and no feature-flag system in repo: release gate is `turbo run build` +
  `bun test` (both green at Phase 9); releases are branch-based.
