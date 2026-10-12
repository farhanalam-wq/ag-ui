# SETUP — Fresh-Machine Guide for ag-ui

> This file is the single setup runbook: from an empty machine to a running stack.
> Architecture lives in `docs/DESIGN.md` + `docs/spec/ag_ui_product_specification_v3.md`;
> pipeline status lives in `TASKS.md`. If this file disagrees with a config file,
> the config file wins — then fix this file.

## 0. How this repo is shaped (30 seconds)

Bun workspaces + Turborepo. Three runtimes: 
* `apps/web` (Next.js :3000), 
* `apps/api` (Elysia :3001), 
* `workers/worker` (BullMQ). 

Shared code in
`packages/*` (`ingest` = canonical pipeline, `database`, `crawler`, `shared`,
`queues`, `contracts`, `brand`, `extract`, `genui`). 

Infra (Postgres, Redis, Qdrant) runs in Docker. 

The CLI `ingest-cli.ts` is a thin wrapper, not the
implementation — but it is the fastest way to drive ingestion locally.

## 1. Prerequisites

| Need | Version | Check | Notes |
|---|---|---|---|
| Bun | **1.4.2** (pinned in root `packageManager`) | `bun --version` | Plain `bun install` activates the pinned toolchain. Do not use npm/pnpm here. |
| Docker + Compose | any recent | `docker compose version` | Provides Postgres, Redis, Qdrant. No local installs of these needed. |
| Git | any recent | `git --version` | |
| OpenAI API key | — | — | Mandatory: embeddings + chat. Everything else boots without it, ingestion does not run. |
| Playwright browsers | only if `--playwright` | n/a | JS-shell fallback is OFF by default. If you enable it: `bunx playwright install chromium` inside `packages/crawler` scope. |

No Node.js required. No Python. No separate package manager.

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
| `REDIS_HOST` / `REDIS_PORT` | **yes** | `127.0.0.1` / `6379` with §2.3 |
| `PORT` / `WEB_PORT` | no (defaults 3001/3000) | Change only on port conflicts |
| `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_BACKEND_URL` | yes, keep `http://localhost:3001` | Web talks to the API through these. If the API moves, both must move. |
| `QDRANT_DUAL_WRITE` | no, keep `false` | Cutover is done; never re-enable without reading `docs/parity-check.md` |
| LiveKit / VoiceKit / ElevenLabs / Sarvam / Pixabay keys | only for voice + media | Stack runs fine without them; voice routes 401/429 without keys |

`.env` is gitignored — it never travels between machines. That is the #1 cause of
"works here, broken there": every new machine needs this step.

### 2.3 Infrastructure

```bash
docker compose up -d
docker compose ps   # all three Up
```

| Service | Container | Ports | Data lives in |
|---|---|---|---|
| Postgres 16 (+pgvector image, unused) | `ag-ui-postgres` | 5432 | `pgdata` volume |
| Redis 7 | `ag-ui-redis` | 6379 | `redisdata` volume |
| Qdrant v1.12.1 | `ag-ui-qdrant` | 6333/6334 | `qdrant_storage` volume |

Volumes are local-only (gitignored). A fresh machine starts with an **empty
knowledge base** — companies/snapshots do not transfer; plan one ingest per
corpus (see §2.6).

### 2.4 Database schema — from scratch

```bash
bun --filter @ag-ui/database run db:push
```

This applies `packages/database/drizzle/*` to the Postgres from §2.3.
Expected: drizzle-kit reports tables created, no errors. Verify:

```bash
docker exec ag-ui-postgres psql -U postgres -d ag_ui -c "\dt"
# expect: companies, company_snapshots, brands, documents, chunks, facts,
#         conversations, messages, crawl_jobs, widget_keys, ...
```

**After a schema change** (you edited `packages/database/src/schema.ts`):

```bash
bun --filter @ag-ui/database run db:generate   # writes a new drizzle/ migration
git add packages/database/drizzle              # migrations ARE committed
bun --filter @ag-ui/database run db:push       # apply locally
```

Every other machine gets the migration via `git pull` + `db:push`. Never edit
applied migration SQL in place — add a new one.

### 2.5 Vector collection

```bash
bun scripts/qdrant-init.ts   # exit 0, "Already present & validated" on re-runs
```

Idempotent: creates `company_chunks` (1536-dim cosine, HNSW) + the 5 payload
indexes if missing. Run it on every fresh machine, and any time Qdrant data was
wiped (`docker compose down -v` deletes `qdrant_storage`).

### 2.6 Run everything

```bash
bun dev   # turbo: web :3000 + api :3001 + worker, one log stream
```

Single-service alternatives:

```bash
bun x turbo --filter web dev        # Next.js only
bun --filter @ag-ui/api run dev     # Elysia only (:3001, /swagger, /health)
bun --filter @ag-ui/worker run dev   # worker only
```

### 2.7 Prove it works (same gates as the pipeline checklist)

```bash
curl localhost:3001/health                          # {status,...}
# open http://localhost:3001/swagger
bun ingest-cli.ts stats <a-known-domain>            # DB + Qdrant counts agree
bun ingest-cli.ts https://example.com --discover-only --limit 5
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

**Pulling changes on another machine:**

```bash
git pull
bun install                                   # package.json changed? always safe to re-run
bun --filter @ag-ui/database run db:push      # drizzle/ changed? applies new migrations
# restart dev processes (web/api pick up code; env changes need a restart too)
```

**What travels in git vs what stays local:**

| In git ✅ | Local only ❌ (recreate per machine) |
|---|---|
| All source, `drizzle/` migrations, `skills-lock.json`, `.agents/skills` | `.env` (copy from `.env.example`, fill keys) |
| `docs/` incl. parity record | Docker volumes (`pgdata`, `redisdata`, `qdrant_storage`) |
| `TASKS.md`, `SETUP.md` (this file) | `storage/`, `node_modules/`, `.next/`, `dist/` |

`.agents/skills` is committed and heavy — a fresh clone downloads it with
everything else; do not hand-delete entries, use `npx skills remove`.

## 4. Troubleshooting (ordered by how often it bites)

| Symptom | Cause → fix |
|---|---|
| `@ag-ui/*` import fails after pull | Stale workspace links → `bun install` |
| API 500s on DB calls | Postgres down or schema behind → `docker compose up -d` + `db:push` |
| Web shows API errors / empty data | `NEXT_PUBLIC_API_URL` pointing elsewhere → set to `http://localhost:3001`, restart web |
| Ingest refuses: exit 3, lists a live job | Stuck non-terminal row → mark job + snapshot `FAILED`, re-run |
| Ingest refuses: exit 2, names a job | Identical selection already crawling → wait for it or cancel it |
| Qdrant 404 collection | Wiped volume or new machine → `bun scripts/qdrant-init.ts` |
| Embeddings fail | Missing/invalid `OPENAI_API_KEY` in `.env` (needs process restart) |
| `--playwright` crashes | Browsers not installed → `bunx playwright install chromium` |
| Port clash on 3000/3001 | Another process holds it → `PORT=` / `WEB_PORT=` in `.env`, keep the two `NEXT_PUBLIC_*` keys in sync |
| Fresh machine has no companies | Expected — volumes don't transfer. Re-ingest per corpus. |

## 5. Command cheat sheet

```bash
bun install                                   # link workspaces (after any package.json change)
docker compose up -d                          # infra
bun --filter @ag-ui/database run db:push      # apply schema
bun scripts/qdrant-init.ts                    # ensure vector collection
bun dev                                       # all three runtimes
bun ingest-cli.ts <url> --limit 20 --yes      # ingest
bun ingest-cli.ts stats <domain>              # PG vs Qdrant agreement
bun ingest-cli.ts query <d> "question"        # retrieval probe
bun ingest-cli.ts facts <domain>              # fact table
./node_modules/.bin/tsc --noEmit -p packages/<pkg>/tsconfig.json
```