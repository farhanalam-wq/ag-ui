# SETUP — Fresh-Machine Guide for ag-ui

> This file is the single setup runbook: from an empty machine to a running stack.
> Architecture lives in `docs/DESIGN.md` + `docs/spec/ag_ui_product_specification_v3.md`;
> analytics operations live in `docs/analytics-runbook.md`; pipeline status lives in
> `TASKS.md`. If this file disagrees with a config file, the config file wins — then
> fix this file.
>
> **Last verified:** 2026-10-26 against a Linux box with Bun 1.4.2, Docker Compose
> v5.6.0, and an existing database at migration `0004` (9 companies, 1263 chunks).
> Schema is now at `0011`.

## 0. How this repo is shaped (30 seconds)

Bun workspaces + Turborepo. Three runtimes:

* `apps/web` (Next.js :3000),
* `apps/api` (Elysia :3001),
* `workers/worker` (BullMQ — ingestion **and** analytics rollups).

The separate `apps/demo` showcase defaults to :3002 so it does not occupy the API port.

Shared code in `packages/*`:

| Package | Role |
|---|---|
| `ingest` | canonical ingest pipeline (discover → crawl → chunk/embed → persist) |
| `database` | Drizzle schema, migrations, rate limits, retrieval, error sink |
| `analytics` | event collector, session/rollup engine, report queries (since the analytics rebuild) |
| `crawler` | fetch + parse + sitemap discovery |
| `contracts` | shared types/zod contracts |
| `shared` | cross-cutting helpers |
| `queues` | BullMQ queue definitions |
| `brand` | dembrandt appearance/theme extraction |
| `extract` | fact extraction |
| `genui` | generative-UI helpers |

Infra (Postgres + pgvector) runs in Docker; Redis and Qdrant come from
external servers via `REDIS_URL` / `QDRANT_URL`.

The CLI `ingest-cli.ts` is a thin wrapper, not the implementation — but it is the
fastest way to drive ingestion locally.

> ⚠️ `packages/video-mvp/` contains only a stale `node_modules` and **no**
> `package.json`. It is not a workspace and holds nothing. It is harmless but is
> likely leftover from a deleted experiment; ignore it (or delete it, it is not
> tracked).

## 1. Prerequisites

| Need | Version | Check | Notes |
|---|---|---|---|
| Bun | **1.4.2** (pinned in root `packageManager`) | `bun --version` | Plain `bun install` activates the pinned toolchain. Do not use npm/pnpm here. |
| Docker + Compose | any recent | `docker compose version` | Provides Postgres+pgvector, and builds the api/web/worker images. No local installs of these needed. |
| Git | any recent | `git --version` | |
| OpenAI API key | — | — | Mandatory: embeddings + chat. Everything else boots without it, ingestion does not run. |
| Playwright browsers | only if `--playwright` | n/a | JS-shell fallback is OFF by default. If you enable it: `bunx playwright install chromium` inside `packages/crawler` scope. |

No Node.js required. No Python. No separate package manager.

> **Shell note (Linux, bun under a restricted sandbox/TMPDIR):** if `bun install`
> fails with `unable to write files to tempdir: EACCES`, the bun *global cache*
> (`~/.bun/install/cache`) is outside what your shell can write. Point it at a
> writable directory for that one command:
>
> ```bash
> BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache" bun install
> ```
>
> This is an environment quirk, not a repo problem. Don't "fix" it by editing
> `package.json`.

## 2. Fresh-machine setup (in order, ~10 minutes)

### 2.1 Clone and install

```bash
git clone <repo-url> ag-ui && cd ag-ui
bun install
```

What this does: links all `apps/*`, `packages/*`, `workers/*` workspaces
(`apps/api/node_modules/@ag-ui/*`, etc.). Re-run it after pulling whenever a
`package.json` changed — if imports of `@ag-ui/*` suddenly fail, stale links
are the cause 9 times out of 10.

`@ag-ui/analytics` is a **new** workspace dependency of both `apps/api` and
`workers/worker`. A machine that pulled the analytics rebuild without
re-running `bun install` will fail to resolve it — this is the single most
common post-pull breakage.

Verify links landed:

```bash
ls apps/api/node_modules/@ag-ui/     # must include: analytics
ls workers/worker/node_modules/@ag-ui/  # must include: analytics
```

### 2.2 Environment file

```bash
cp .env.example .env
```

Then fill in:

| Key | Required? | Value on a fresh machine |
|---|---|---|
| `DATABASE_URL` | **yes** | Default `postgresql://postgres:password@localhost:5432/ag_ui` works with §2.3 as-is |
| `OPENAI_API_KEY` | **yes** (for ingest/chat) | Your key. Without it the stack boots but embeddings/chat fail. |
| `QDRANT_URL` | **yes** | `http://localhost:6333` with §2.3 |
| `REDIS_URL` | **yes** | `redis://127.0.0.1:6379` with §2.3 (auth/TLS supported) |
| `PORT` / `WEB_PORT` | no (defaults 3001/3000) | Change only on port conflicts |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_BACKEND_URL` | yes, keep `http://localhost:3001` | Web talks to the API through these. If the API moves, both must move. |
| `QDRANT_DUAL_WRITE` | no, keep `false` | Cutover is done; never re-enable without reading `docs/parity-check.md` |
| `APP_URL` / `SESSION_TTL_HOURS` / `COOKIE_DOMAIN` | no for dev | Auth points login/CSRF at `APP_URL` (default `http://localhost:3000`); sessions default to 168 h. Change `APP_URL` wherever the web app actually lives — the CSRF guard compares `Origin` against it |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | only for Google sign-in | Empty → the Google button answers 503 "not configured"; email/password sign-in works regardless |
| Analytics budgets (`TRACK_*`, `ANALYTICS_*`, `EMBED_RATE_*`) | no | Every one has a code default (see table below). Only set them to override. |
| LiveKit / VoiceKit / ElevenLabs / Sarvam / Pixabay keys | only for voice + media | Stack runs fine without them; voice routes 401/429 without keys |

**Analytics knobs — all optional, defaults live in code.** Leaving them out of
`.env` is correct; the values below are what you get:

| Key | Default | Where the default lives |
|---|---|---|
| `EMBED_RATE_PER_MIN` / `_PER_DAY` | 30 / 200 | `packages/database/src/rate-limit.ts` |
| `TRACK_RATE_PER_MIN` / `_PER_DAY` | 1000 / 50000 | `packages/database/src/rate-limit.ts` |
| `TRACK_QUOTA_PER_DAY` | 100000 | `packages/database/src/rate-limit.ts` |
| `ANALYTICS_READ_COMPANY_PER_MIN` / `_PER_DAY` | 240 / 5000 | `packages/database/src/rate-limit.ts` |
| `ANALYTICS_READ_PER_MIN` / `_PER_DAY` | 1200 / 50000 | `packages/database/src/rate-limit.ts` |
| `ANALYTICS_ROLLUP_MS` | 900000 (15 min) | `packages/analytics/src/registry.ts`, `workers/worker/src/analytics-worker.ts` |
| `ANALYTICS_RAW_RETAIN_MONTHS` | 3 | `packages/analytics/src/rollup.ts` |

All rate-limit paths **fail open** when Redis is down (availability over
precision). `REDIS_CACHE_OFF=1` bypasses the cache layer — diagnostics only.

`.env` is gitignored — it never travels between machines. That is the #1 cause of
"works here, broken there": every new machine needs this step.

### 2.3 Infrastructure

```bash
docker compose up -d postgres
docker compose ps   # postgres Up (healthy)
```

| Service | Container | Ports | Data lives in |
|---|---|---|---|
| Postgres 16 (pgvector image — the extension is **not** used) | `ag-ui-postgres` | 5432 | `pgdata` volume |

**Redis and Qdrant are not bundled.** Point `REDIS_URL` and `QDRANT_URL`
(+ `QDRANT_API_KEY`) in `.env` at your servers — every Redis client
(queues, embed cache, analytics worker) parses `REDIS_URL`, including
auth and TLS (`rediss://…`); `REDIS_HOST`/`REDIS_PORT` remain the legacy
fallback when `REDIS_URL` is unset.

**Full-stack containers** (single-VM deploy; see `docker-compose.yml`):

```bash
docker compose up -d --build   # builds api/web/worker images, runs migrate, starts all
```

This also brings up a one-shot `migrate` service (drizzle-kit against the
bundled Postgres) that must complete before api/worker start. `web`'s
`NEXT_PUBLIC_*` values are inlined at build time — rebuild the web image
after changing them.

Volumes are local-only (gitignored). A fresh machine starts with an **empty
knowledge base** — companies/snapshots do not transfer; plan one ingest per
corpus (see §2.6).

### 2.4 Database schema

```bash
bun run db:migrate
```

`db:migrate` applies the versioned SQL in `packages/database/drizzle/` in order
(`0000..0011`) and records what it applied in `drizzle.__drizzle_migrations`.
This is the **only** supported way to build or update a database — every
environment, every machine. Expected last line:
`[✓] migrations applied successfully!`.

It is **idempotent**: re-running on an up-to-date database is a clean no-op.
The timestamp NOTICE chatter (`schema "drizzle" already exists, skipping`,
`constraint ... does not exist, skipping`) is expected and harmless — those
`DO $$` guards are what make re-runs safe.

Verify:

```bash
docker exec ag-ui-postgres psql -U postgres -d ag_ui -tAc \
  "select count(*) from drizzle.__drizzle_migrations;"   # 12 rows worth of 0000..0011
docker exec ag-ui-postgres psql -U postgres -d ag_ui -c "\dt"
# expect: companies, company_snapshots, brands, brand_stylesheets, documents,
#         chunks, facts, conversations, messages, crawl_jobs, widget_keys,
#         widget_key_domains, widget_theme_overrides, error_events,
#         sessions, metrics_daily, metrics_hourly, page_views (+ page_views_YYYYMM)
```

What each recent migration adds:

| Migration | Adds |
|---|---|
| `0004` | `brand_stylesheets` |
| `0005` | `widget_key_domains`; indexes on `brand_stylesheets` |
| `0006` | `widget_theme_overrides` (per-company widget theme JSON) |
| `0007` | **analytics**: `page_views` (RANGE-partitioned by month), `sessions`, `metrics_daily`, `metrics_hourly`, plus partitions for the current + next month |
| `0008` | `error_events` + two indexes (the operations error sink) |
| `0009` | `sessions.engaged`, `metrics_daily/metrics_hourly.engaged_sessions` |
| `0010` | analytics dimensions: `page_views.browser/os/tz_offset`, `sessions.device/browser/os/tz_offset` |
| `0011` | `conversations.path` (the host page a conversation started on) |

> **Do not use `db:push`.** It is a local diff tool: it compares the live database
> against `schema.ts` and issues DDL itself — it does **not** read `drizzle/*.sql`.
> It cannot express `page_views`' monthly RANGE partitioning, so pushing here would
> create an unpartitioned table and silently break retention. `0007` refuses that
> state with a loud error, but the correct move is simply never to run it.
> `drizzle.config.ts` carries the same warning.

**Already have a database built with `db:push`?** Baseline it once, then migrate:

```bash
bun run db:baseline --through=0006_woozy_talos   # marks 0000..0006 applied, runs nothing
bun run db:migrate                               # applies 0007 onward
```

> `db:baseline` refuses to run if `public.companies` is missing (empty DB → use
> `db:migrate`) or if the ledger already has rows (already baselined). Both
> refusals are safe and non-destructive — nothing is written before the check.

**After a schema change** (you edited `packages/database/src/schema.ts`):

```bash
bun run db:generate                            # writes a new drizzle/ migration
git add packages/database/drizzle              # migrations ARE committed
bun run db:migrate                             # apply locally
```

Every other machine gets it via `git pull` + `db:migrate`. Never edit an applied
migration in place — add a new one. If drizzle-kit cannot express something
(partitioning, `DO $$` blocks), hand-write the SQL **inside a migration**; do not
fall back to a standalone script.

> Known quirk: `drizzle/meta/` has snapshots only up to `0009_snapshot.json`;
> `0010`/`0011` are hand-written and present only in `_journal.json` + the `.sql`
> files. That is fine for `migrate` (it reads the journal), but `db:generate` may
> want to regenerate a snapshot — check the diff before committing it.

#### If `db:migrate` fails with `relation "..." already exists`

This means the **ledger is behind the actual schema**: objects exist but were
never recorded (typically because someone applied a migration by hand, or
transitioned from the old ad-hoc scripts). Do **not** drop the table to "let it
re-apply" — it may hold real data.

Diagnose, then record only the already-applied migration:

```bash
# 1. Which migration stopped? The error names the first object it hit.
# 2. Confirm the object is complete (columns, constraints, indexes) —
#    compare against drizzle/meta/000N_snapshot.json.
docker exec ag-ui-postgres psql -U postgres -d ag_ui -c "\d+ <table>"

# 3. Record that migration in the ledger with its real hash, exactly as
#    db-baseline.ts does (hash = sha256 of the .sql, created_at = journal `when`):
H=$(sha256sum packages/database/drizzle/0005_shocking_nebula.sql | cut -d' ' -f1)
docker exec -i ag-ui-postgres psql -U postgres -d ag_ui -c \
  "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('$H', 1791440830840);"

# 4. Re-run — it continues with the next migration.
bun run db:migrate
```

This exact situation was hit on 2026-10-26: `0005` was fully applied (13
columns, both FKs, both indexes, 21 brand_stylesheet rows) but unrecorded.
Recording it and re-running applied `0006..0011` in one pass with no data loss.
Always take a backup first (§2.4a).

### 2.4a Backup before migrating an existing database

Cheap insurance, takes seconds:

```bash
docker exec ag-ui-postgres pg_dump -U postgres -d ag_ui --no-owner \
  > backup_$(date +%Y%m%d_%H%M%S).sql
```

Restore with `cat backup.sql | docker exec -i ag-ui-postgres psql -U postgres -d ag_ui`.
`*.sql` is gitignored — backups never get committed.

### 2.5 Vector collection

```bash
bun scripts/qdrant-init.ts   # exit 0, "Already present & validated" on re-runs
```

Idempotent: creates `company_chunks` (1536-dim cosine, HNSW) + the 5 payload
indexes (`company_id`, `snapshot_id`, `document_id`, `category`, `chunk_index`)
if missing. Run it on every fresh machine, and any time Qdrant data was wiped
(`docker compose down -v` deletes `qdrant_storage`).

### 2.6 Run everything

```bash
bun dev   # turbo: web :3000 + api :3001 + worker, one log stream
```

Single-service alternatives:

```bash
bun x turbo --filter web dev              # Next.js only
bun run --filter @ag-ui/api dev           # Elysia only (:3001, /swagger, /health)
bun run --filter @ag-ui/worker dev        # worker only
```

> Note the argument order: it is `bun run --filter <pkg> dev`, **not**
> `bun --filter <pkg> run dev` — the latter fails with
> `Script "run" not found in package`.

**The worker is not optional for analytics.** Without `workers/worker` running
there is no consumer on the analytics queue, and every dashboard goes flat with
no error. This is the #1 cause of "analytics is dead" (see
`docs/analytics-runbook.md`).

### 2.7 Prove it works

Optional but recommended — seed a realistic demo dataset (one demo user
`demo@ag-ui.local` / `DemoPassw0rd!2026`, three companies with ~15 weeks of
analytics and a live knowledge base):

```bash
bun run seed          # wipes nothing; hard-errors if the demo user exists
bun run seed:reset    # --reset variant: wipe + reseed
```

Auth + dashboard:

```bash
# open http://localhost:3000 — public landing, links to /login and /register
# log in as demo@ag-ui.local / DemoPassw0rd!2026 → lands on /overview
curl localhost:3001/health                          # {status:"ok",...}
# open http://localhost:3001/swagger
bun ingest-cli.ts stats <a-known-domain>            # DB + Qdrant counts agree
bun ingest-cli.ts https://example.com --discover-only --limit 5
```

Analytics smoke test (needs the worker running for rollups; raw events show in
realtime immediately):

```bash
CID=$(curl -s localhost:3001/api/companies | python3 -c 'import json,sys;print(json.load(sys.stdin)["companies"][0]["id"])')
for r in realtime overview website acquisition content audience agent/overview; do
  printf '%s ' "$r"; curl -s -o /dev/null -w '%{http_code}\n' "localhost:3001/api/analytics/$r?companyId=$CID"
done   # all 200; a 422 means companyId was missing, not a schema problem
```

Want populated dashboards without a real traffic source? Seed deterministic
fixtures, then clear them when done:

```bash
bun scripts/seed-analytics-fixtures.ts            # 90 days, two companies (idempotent)
bun scripts/seed-analytics-fixtures.ts --days 30  # shorter window
bun scripts/seed-analytics-fixtures.ts --clear    # remove everything it made
```

First real ingest:

```bash
bun ingest-cli.ts https://<your-site> --limit 20 --yes
bun ingest-cli.ts stats <domain>                    # snapshot READY, PG chunks == Qdrant points
```

If the run refuses with exit 3 naming a live job, a previous run died
mid-flight leaving a stuck non-terminal row — flip that job + snapshot to
`FAILED` (see TASKS.md #6 note) and re-run. Stuck rows block all default-cap
ingests by design.

## 3. Second-machine / after-pull workflows

**Pulling changes on another machine — the full loop:**

```bash
git pull
bun install              # ALWAYS after a pull; links new workspaces (e.g. @ag-ui/analytics)
docker compose up -d     # if this machine was off / containers stopped
bun run db:migrate       # applies any new drizzle/ migrations; no-op if current
bun scripts/qdrant-init.ts   # no-op if already valid; needed if volume was wiped
bun dev                  # restart dev processes (env changes need a restart too)
```

Checklist with the "why":

| Step | Run when | Breaks if skipped |
|---|---|---|
| `bun install` | every pull | `@ag-ui/*` import errors, new workspace unresolved |
| `docker compose up -d` | machine restart / fresh boot | DB/Redis/Qdrant connection refused |
| `bun run db:migrate` | `drizzle/` changed | API 500s: `relation "error_events" does not exist`, unknown column |
| `bun scripts/qdrant-init.ts` | volume wiped / fresh machine | Qdrant 404 `company_chunks` |
| `bun dev` | after any of the above | stale code / env still in memory |

> `bun install` is cheap when nothing changed (`Checked N installs ... no changes`)
> and mandatory when something did. Just always run it.

**Confirming you are up to date** (fast, no flags):

```bash
bun run db:migrate                        # "[✓] migrations applied successfully!" and no new work
docker compose ps                         # all three Up
curl -s localhost:3001/health             # status ok
```

**What travels in git vs what stays local:**

| In git ✅ | Local only ❌ (recreate per machine) |
|---|---|
| All source, `drizzle/` migrations, `skills-lock.json`, `.agents/skills` | `.env` (copy from `.env.example`, fill keys) |
| `docs/` incl. parity record + analytics runbook | Docker volumes (`pgdata`, `redisdata`, `qdrant_storage`) |
| `TASKS.md`, `SETUP.md` (this file) | `storage/`, `node_modules/`, `.next/`, `dist/`, `*.sql` backups |

`.agents/skills` is committed and heavy — a fresh clone downloads it with
everything else; do not hand-delete entries, use `npx skills remove`.

## 4. Troubleshooting (ordered by how often it bites)

| Symptom | Cause → fix |
|---|---|
| `@ag-ui/*` import fails after pull | Stale workspace links → `bun install` |
| `Could not resolve "@ag-ui/analytics"` | New workspace not linked → `bun install` |
| API 500s on DB calls | Postgres down or schema behind → `docker compose up -d` + `bun run db:migrate` |
| `relation "error_events"/"widget_theme_overrides" does not exist` | Migrations `0006`/`0008` not applied → `bun run db:migrate` |
| `column "browser"/"tz_offset"/"path" does not exist` | `0010`/`0011` not applied → `bun run db:migrate` |
| `db:migrate` fails: `relation "..." already exists` | Ledger behind schema → follow §2.4 "If db:migrate fails" (record, don't drop) |
| `page_views exists but is not partitioned` | Someone ran `db:push` → drop `page_views` (it should be empty), re-run `db:migrate` |
| Dashboards empty / realtime flat, no errors | Worker not running → `bun run --filter @ag-ui/worker dev` |
| Web shows API errors / empty data | `NEXT_PUBLIC_API_URL` pointing elsewhere → set to `http://localhost:3001`, restart web |
| Ingest refuses: exit 3, lists a live job | Stuck non-terminal row → mark job + snapshot `FAILED`, re-run |
| Ingest refuses: exit 2, names a job | Identical selection already crawling → wait for it or cancel it |
| Qdrant 404 collection | Wiped volume or new machine → `bun scripts/qdrant-init.ts` |
| Embeddings fail | Missing/invalid `OPENAI_API_KEY` in `.env` (needs process restart) |
| `bun install` → `unable to write files to tempdir: EACCES` | Bun global cache unwritable → `BUN_INSTALL_CACHE_DIR="$PWD/.bun-cache" bun install` |
| `Script "run" not found in package` | Wrong flag order → `bun run --filter <pkg> dev` |
| `--playwright` crashes | Browsers not installed → `bunx playwright install chromium` |
| Port clash on 3000/3001 | Another process holds it → `PORT=` / `WEB_PORT=` in `.env`, keep the two `NEXT_PUBLIC_*` keys in sync — and set `APP_URL` to the new web port or every unsafe (POST) request fails CSRF with "Invalid request origin" |
| Fresh machine has no companies | Expected — volumes don't transfer. `bun run seed` for the demo dataset, or re-ingest per corpus. |
| Every dashboard visit bounces to `/login` even after logging in | Cookie is scoped to the site you logged in on. Log in through `http://localhost:3000` itself (not a `127.0.0.1` or LAN alias) — same hostname everywhere, or the cookie never matches |

**Repairing analytics data** (orphan session rows, HLL drift after a rollup-logic
change) — rebuild rollups for a range instead of touching rows by hand:

```bash
bun run --filter @ag-ui/worker rebuild:analytics                    # last 30 days
bun run --filter @ag-ui/worker rebuild:analytics 2026-10-01 2026-10-07
```

## 5. Command cheat sheet

```bash
# --- setup / after pull ---
bun install                                   # link workspaces (after any package.json change)
docker compose up -d                          # infra
bun run db:migrate                            # apply schema (0000..0011), idempotent
bun scripts/qdrant-init.ts                    # ensure vector collection

# --- run ---
bun dev                                       # all three runtimes
bun run seed / bun run seed:reset             # demo dataset (demo@ag-ui.local) / wipe + reseed
bun run --filter @ag-ui/api dev               # API only (:3001, /swagger, /health)
bun run --filter web dev                      # web only (:3000)
bun run --filter @ag-ui/worker dev            # worker only (required for analytics)

# --- ingest / retrieval ---
bun ingest-cli.ts <url> --limit 20 --yes      # ingest
bun ingest-cli.ts <url> --discover-only --limit 5
bun ingest-cli.ts stats <domain>              # PG vs Qdrant agreement
bun ingest-cli.ts query <d> "question"        # retrieval probe
bun ingest-cli.ts facts <domain>              # fact table
bun ingest-cli.ts --help                      # all pipeline options

# --- analytics ---
bun scripts/seed-analytics-fixtures.ts        # seed demo data (--clear to remove)
bun run --filter @ag-ui/worker rebuild:analytics [from] [to]

# --- health / checks ---
curl localhost:3001/health
docker compose ps
docker exec ag-ui-postgres psql -U postgres -d ag_ui -c "\dt"
./node_modules/.bin/tsc --noEmit -p packages/<pkg>/tsconfig.json
```

## 6. Reference

* `docs/analytics-runbook.md` — analytics deploy order, env, API contract, rollups, repair.
* `docs/DESIGN.md` — architecture.
* `docs/spec/ag_ui_product_specification_v3.md` — product spec.
* `docs/parity-check.md` — Postgres ↔ Qdrant parity record (read before touching `QDRANT_DUAL_WRITE`).
* `TASKS.md` — pipeline status and known issues.
* `.env.example` — the authoritative list of environment keys.
