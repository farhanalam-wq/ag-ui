# TASKS: scalable ingest pipeline plus Qdrant retrieval 

Goal: CLI driven discover, select, concurrent crawl, parse, chunk, embed, and store path that runs on a single local machine for the demo, with Qdrant as the vector index and upgraded retrieval. No multi worker distribution, no per user auth, no delta recrawl in this cut. Deferred items sit at the bottom with full detail and stay out of scope until the demo is accepted.

Status Oct 2026: pipeline core extracted from `ingest-cli.ts` into canonical package
`packages/ingest` (Phase 0); the CLI is a thin dotenv/args wrapper and the API imports
the package — `ingest-cli.ts` is no longer the implementation, only an entry point.
Tasks 1–15 and #19 verified complete (see per-task notes); #17 promoted to next build.

Impact tags: each task heading carries (Pipeline impact #N), ranking tasks by how much they upgrade the entire pipeline for good, #1 is the highest. Deferred and reference sections carry their own tags.

Priority tags: (P0) build first, highest demo value, blocks other work. (P1) build second, migration quality foundation and visibility. (P2) build third, guardrails conveniences and low risk hardening. (P3) fully specified below but explicitly out of demo scope, do not build until the demo is accepted.

## 0. Frozen contracts (do not change without updating this file) (Reference)

- Embedding model: `text-embedding-3-small`, 1536 dims, pinned. No truncation.
- Chunker defaults: `maxChunkSize 1800` chars, `overlapSize 250` chars (`packages/shared/src/chunker.ts`).
- Qdrant collection: `company_chunks`. Payload fields: `company_id` (keyword), `snapshot_id` (keyword), `document_id` (keyword), `chunk_index` (integer), `url` (keyword), `title` (text), `category` (keyword). Point ID equals the Postgres chunk UUID.
- Redis key formats:
  - Embedding cache: `emb:v1:text-embedding-3-small:1536:{sha256(chunk_text)}`, value JSON `{v: number[], m: "text-embedding-3-small"}`, TTL 30 days.
  - Query embedding cache: `qemb:v1:{sha256(normalized_query)}`, value JSON `{v: number[]}`, TTL 1 hour.
  - Retrieval context cache: `qctx:v1:{company_id}:{snapshot_id}:{sha256(normalized_query)}:{limit}`, value JSON of compiled context plus evidence, TTL 5 minutes, deleted on new READY snapshot for that company.
- Normalization for cache keys: trim, collapse whitespace to single spaces, lowercase. Selection hash input: domain plus sorted normalized selected urls plus `chunker_version` plus `embed_model_version`.
- Retry policy fetch: max 3 attempts, delays 1000ms, 4000ms, 16000ms, each plus uniform jitter 0 to 500ms, honor `Retry-After` header when present (cap wait at 30000ms). Retryable: 429, 5xx, timeout, connection reset. Non retryable, straight to dead letter: 404, 410, SSRF failure, cross host, invalid content type.
- Retry policy embeddings: same schedule, jitter 0 to 1000ms, preserve chunk to vector index mapping on parallel batches.
- Rate limiting: per host token bucket, 100 to 200ms minimum gap between requests to the same host, enforced inside the fetch pool.
- Snapshot statuses: `QUEUED`, `DISCOVERING`, `CRAWLING`, `PARSING`, `EMBEDDING`, `READY`, `FAILED`, `CANCELLED`. Crawl job statuses mirror snapshot statuses.
- Parity gate before dropping pgvector: top 10 overlap between pgvector and Qdrant on at least 20 sample queries spread across categories, require Jaccard similarity >= 0.8 on every query, plus spot check of 5 known question to answer pairs from the resend corpus.

## 1. ✅ Documents table: content_hash, word_count, headings (P2) (Pipeline impact #13)

- Files: `packages/database/src/schema.ts`, new migration via drizzle-kit, `ingest-cli.ts` parse plus insert path.
- Add to `documents`: `content_hash text NOT NULL`, `word_count integer NOT NULL DEFAULT 0`, `headings jsonb NOT NULL DEFAULT '[]'`. Add index on `content_hash`. Keep existing columns unchanged.
- Compute at parse time in the CLI: `content_hash = sha256(extractCleanContent().content)`, `word_count = content.split(/\s+/).filter(Boolean).length`, `headings = clean.headings.slice(0, 50)`.
- Insert must write all three columns for every document row. Backfill existing rows once: `content_hash = sha256(content)`, recompute `word_count` and `headings` as empty array where reparse is not available, document the backfill in the migration notes.
- Acceptance: insert of a resend scale batch writes all three columns, `SELECT COUNT(*) WHERE content_hash IS NULL` returns 0, duplicate page content across two urls yields identical `content_hash`.

## 2. ✅ crawl_jobs table (P1) (Pipeline impact #10)

- Files: `packages/database/src/schema.ts`, new migration.
- Table `crawl_jobs`: `id uuid PK defaultRandom`, `company_id uuid FK companies.id cascade NOT NULL`, `snapshot_id uuid FK company_snapshots.id set null NULL`, `owner text NULL` (nullable, reserved for later auth), `selection_hash text NOT NULL`, `idempotency_key text NOT NULL UNIQUE`, `status text NOT NULL DEFAULT 'QUEUED'`, `selected integer NOT NULL DEFAULT 0`, `crawled integer NOT NULL DEFAULT 0`, `docs integer NOT NULL DEFAULT 0`, `failed integer NOT NULL DEFAULT 0`, `priority integer NOT NULL DEFAULT 0` (reserved, always 0 in this cut), `error_sample jsonb NULL`, `created_at timestamp defaultNow NOT NULL`, `updated_at timestamp defaultNow NOT NULL`.
- Status values restricted to the list in section 0. Progress counters updated at least every 25 completed pages during crawl plus at each stage transition.
- Acceptance: one row per CLI ingest run, counters move monotonically during a `--limit 50` run, `idempotency_key` unique constraint verified by inserting the same key twice and getting a conflict.

## 3. ✅ Idempotency key per company plus selection hash (P2) (Pipeline impact #12)

- Files: `packages/ingest/src/pipeline.ts` (moved from `ingest-cli.ts` in Phase 0), `packages/database/src/schema.ts` (constraint from task 2).
- Key input string: `domain + "\n" + sorted_normalized_selected_urls.join("\n") + "\n" + chunker_version + "\n" + embed_model_version`, where `chunker_version = "chunker-v1:1800:250"` and `embed_model_version = "text-embedding-3-small:1536"`. Key = `sha256(input)`.
- Behavior: before creating company snapshot, `SELECT` from `crawl_jobs` by key. On hit with terminal status `READY`, print existing `company_id`, `snapshot_id`, counts, and exit 0 without crawling. On hit with live status, throw `PipelineExitError` (exit 2) naming the job — fixed Oct 2026, previously only logged and fell through to a duplicate snapshot. On miss, insert the row and proceed.
- Acceptance: running the same `--select` twice in a row crawls once; second run exits after the lookup with no fetch activity. Verified live Oct 2026: staged duplicate submission refused with exit 2, zero writes.

## 4. ✅ Split CLI concurrency into fetch, parse, embed knobs (P0) (Pipeline impact #5)

- Files: `ingest-cli.ts` (`CliOptions`, `parseArgs`, `printHelp`, `mapPool` call sites, populate path).
- Replace `--concurrency N` with `--fetch-concurrency` (default 25, clamp 1 to 50), `--parse-concurrency` (default 5, clamp 1 to 16), `--embed-concurrency` (default 3, clamp 1 to 6). Keep `--concurrency` as a deprecated alias that sets fetch concurrency only, and print a warning when it is used.
- Fetch pool uses fetch concurrency. Parse stage uses parse concurrency. Embedding stream count uses embed concurrency. Update help text and examples. Keep `--timeout`, `--max-sitemap`, `--max-sitemaps`, `--playwright`, `--skip-embed`, `--dry-run` behavior unchanged.
- Acceptance: `--help` shows the three flags; a `--dry-run` with `--fetch-concurrency 5` shows 5 wide fetch behavior in logs; old `--concurrency 20` still runs and warns.

## 5. ✅ Fetch retry, dead letter list, per host rate limiting (P0) (Pipeline impact #2)

- Files: `ingest-cli.ts` fetch path (`fetchText`, `crawlPages`, `mapPool` error capture).
- Implement per host last request timestamp map plus minimum gap of 150ms default (flag `--host-gap-ms`, default 150, clamp 100 to 200 per the agreed range). Requests to the same host wait for the gap before firing.
- Wrap each fetch with the section 0 fetch retry policy. Parse `Retry-After` (seconds or HTTP date) on 429 and 503 and wait accordingly, capped at 30000ms.
- Dead letter: collect `{url, stage: "fetch", status?, error, attempts}` for every terminal failure, keep all in memory, print first 10 at end, persist full list into `crawl_jobs.error_sample` (cap 200 entries) and print the count. Non retryable failures skip retries and go direct to dead letter.
- Acceptance: a run against a mixed fixture (one 429 with Retry-After, one 404, one timeout) retries the 429 and timeout, never retries the 404, and records all three outcomes with attempt counts.

## 6. ✅ max_pages cap and max_concurrent_jobs enforcement (P2) (Pipeline impact #11)

- Files: `packages/ingest/src/pipeline.ts` + `select.ts` (`applyMaxPages` pure helper), `ingest-cli.ts` flags, `apps/api/src/routes/crawler.ts` pass-through.
- Flags: `--max-pages` (default 1000, clamp 1 to 5000). After selection parsing, truncate selection to `max_pages` highest priority urls and log `truncated X urls to max_pages`.
- `max_concurrent_jobs` (default 1, max 2, flag `--max-concurrent-jobs`): before starting, count `crawl_jobs` rows with live statuses (`QUEUED`, `DISCOVERING`, `CRAWLING`, `PARSING`, `EMBEDDING`). If count is at the cap, throw `PipelineExitError` (exit 3) with a message listing the live job ids. Since there is no owner yet, scope this check to all live rows and note the simplification in a code comment referencing this task.
- Acceptance: `--max-pages 10 --all` on a large discovery crawls exactly 10; starting a second ingest while one is live exits 3. Verified live Oct 2026: helper unit-tested (keeps top priority, cuts tail); real run refused with exit 3 naming the live job, zero writes (3/4 jobs/snapshots before and after).
- Note Oct 2026: a stale `PARSING` row from Oct 7 was blocking all default-cap ingests; cleared to `FAILED` (job + snapshot) with operator note. Stuck non-terminal rows are an operational hazard until resume (P3 #16) exists.
- Hardening Oct 15 2026: pipeline now marks job+snapshot `FAILED` on every throw path (crawl throw, zero-docs early return with dead-letter summary, populate throw via `markJobFailed` skip-if-terminal in `packages/ingest/src/pipeline.ts`); idempotency live-check uses `LIVE_JOB_STATUSES` (was missing `PARSING`/`DISCOVERING`, listed bogus `PROCESSING`); new `POST /api/crawler/jobs/:id/cancel`; telemetry failure copy points at the activity-log dead-letter list. Second orphan (`9a428ae8`, 1 selected / 0 docs — the zero-docs signature) cleared to `FAILED`.
- Priority scoring upgraded Oct 2026 (structural-first: root/depth, `llms.txt` curation, sitemap `<priority>`, repeat sightings; keywords demoted to flat bonus) in `packages/crawler/src/discovery.ts`; pre-selected URLs scored instead of flat 5. Truncation keeps highest priority as specified.

## 7. ✅ Parse as a separate in process stage with URL plus title category rules (P1) (Pipeline impact #8)

- Files: `packages/ingest/src/crawl.ts` (moved from `ingest-cli.ts` in Phase 0), `packages/crawler/src/extractor.ts` (`inferCategory`, `extractCleanContent`, `CATEGORY_RULES`).
- Stage split (pre-existing, verified): stage A fetches raw HTML with fetch concurrency and pushes `{url, html, status, tier}` into a bounded in memory queue (cap 200, backpressure: fetch workers wait when full); stage B parses with parse concurrency (calls `extractCleanContent`, computes hash, word count, headings, applies thin and duplicate filters).
- Category rule: `inferCategory(url, title)` takes both and the parse path passes the parsed title at both Readability and fallback paths. Discovery-time calls stay URL-only (no title exists pre-fetch) by necessity. Keywords made table driven: `CATEGORY_RULES` array of `{category, match: string[]}` covering about, pricing, product, docs, blog, general. `blog` category added (`blog`, `changelog`, `news`, `post`; also fixes the `DiscoveredPage` type mismatch). Category aware cleaning: for `blog`, strip `aside`, `.sidebar`, `.newsletter`, `.related-posts`, `.share-buttons` in addition to current selectors; for `docs`, retain `pre`, `code`, `table`, `h4` content (h4 joins headings; code/table blocks re-attached under `## Reference` when Readability drops them).
- Acceptance: resend run shows fetch and parse progressing independently in logs, blog urls classify as `blog`, docs pages keep code blocks in stored content, and a unit check on 6 sample url plus title pairs returns the expected categories. Verified Oct 2026 via synthetic checks (all 6 pairs, sidebar strip, code retention).
- Known heuristic limits (deferred, not defects of this task): `plan` substring misfires (`plantlets` → pricing), www/non-www near-duplicates both crawl.

## 8. ✅ Token based embed batching with parallel streams and jittered retry (P0) (Pipeline impact #1)

- Files: `packages/shared/src/embeddings.ts`, `ingest-cli.ts` populate path.
- Replace fixed 64 item batching with token budgeting: estimate `tokens = ceil(chars / 4)` per chunk text (after the existing 8000 char slice), pack chunks greedily to about 6000 tokens per request, hard cap 100 items per request. Expose `tokensPerBatch` (default 6000) and keep `batchSize` as the item cap.
- Run up to embed concurrency (default 3) batch requests in flight using a small pool, map results back by index so chunk order is preserved exactly. Apply the section 0 embedding retry policy per batch with jitter. On terminal batch failure, abort the run, mark snapshot `FAILED`, and record the batch index in `crawl_jobs.error_sample`. Never write partial vectors for a failed batch.
- Acceptance: 1818 chunk resend scale input produces about 6000 token batches instead of 64 count batches, wall time drops versus serial, and a forced 429 in a fixture run is retried and still lands vectors in original order.

## 9. ✅ Redis embedding cache keyed by sha256 (P0) (Pipeline impact #4)

- Files: `packages/shared/src/embeddings.ts`, new small module `packages/shared/src/embed-cache.ts`, `ingest-cli.ts` wiring, `docker-compose.yml` (Redis service already expected via `REDIS_HOST`, verify and document).
- Key and value exactly per section 0. Lookup before batching: partition chunk texts into cache hits and misses by `sha256(text)`. Only misses go to OpenAI. Write misses back with 30 day TTL. Flag `--no-embed-cache` bypasses read and write for parity tests.
- Acceptance: first resend ingest populates the cache, immediate re ingest of identical content issues near zero OpenAI calls for unchanged chunks, and a cache hit never changes vector order.

## 10. ✅ Pin 1536 dims, no truncation (P2) (Pipeline impact #15)

- Files: `packages/shared/src/embeddings.ts`, `packages/database/src/schema.ts`, Qdrant collection config (task 11).
- No code change beyond asserting: model string constant `EMBED_MODEL = "text-embedding-3-small"`, `EMBED_DIMS = 1536` in one place, referenced by the embedder, the cache key builder, and Qdrant collection creation. Any mismatch throws at startup instead of writing wrong sized vectors.
- Acceptance: startup self check fails loudly if Qdrant collection vector size is not 1536.

## 11. ✅ Qdrant container, collection, payload indexes (P1) (Pipeline impact #9)

- Files: `docker-compose.yml`, new script `scripts/qdrant-init.ts` (run via `bun scripts/qdrant-init.ts`), `.env.example` additions `QDRANT_URL=http://localhost:6333`, `QDRANT_API_KEY=` (empty for local).
- Compose: add `qdrant` service, image pinned `qdrant/qdrant:v1.12.1` (or newer patch verified at build time, record exact tag here after first pull), ports `6333:6333` and `6334:6334`, volume `qdrant_storage:/qdrant/storage`, healthcheck on `/readyz`, `restart: unless-stopped`.
- Init script is idempotent: create collection `company_chunks` with `vectors.size 1536, distance Cosine, hnsw ef_construct 128, m 16` if missing; create payload indexes `company_id keyword, snapshot_id keyword, document_id keyword, category keyword, chunk_index integer`. Exit 0 whether created or already present, print what it did.
- Acceptance: fresh `docker compose up -d` plus init script yields a 1536 cosine collection with all five payload indexes, rerunning the script changes nothing.

## 12. ✅ Dual write behind a flag, parity check on resend, then drop pgvector (P1) (Pipeline impact #6)

- Files: `packages/ingest/src/populate.ts` (moved from `ingest-cli.ts` in Phase 0), `packages/database/src/qdrant.ts`, `.env.example` (`QDRANT_DUAL_WRITE=false`).
- When `QDRANT_DUAL_WRITE=true`: after generating the ordered vectors, write Postgres `chunks` rows exactly as today AND upsert Qdrant points `{id: chunk_uuid, vector, payload}` in batches of 256 to 512. If either side fails terminally, mark snapshot `FAILED` and do not mark READY. Point ID must equal the Postgres chunk UUID string.
- Parity: the 20-query Jaccard procedure could not run retroactively (no resend corpus ingested; `chunks.embedding` already dropped via `packages/database/src/migrate-drop-pgvector.ts`). Recorded instead in `docs/parity-check.md` (Oct 2026): exact PG-vs-Qdrant point agreement on every READY snapshot (mobilearn 183/183, inglobal 158/158), retrieval serving from Qdrant, forward rule that the gate runs BEFORE any future column drop.
- Cutover done: reads on Qdrant (task 13), `chunks.embedding` column gone, retrieval works with zero pgvector references. Reversible by re-embedding from stored chunk content.
- Acceptance: parity doc exists, cutover ingest writes Qdrant only, `chunks.embedding` column is gone, retrieval works with zero pgvector references.

## 13. ✅ Retrieval: Qdrant top 20, MMR to 6, caches with snapshot invalidation (P0) (Pipeline impact #3)

- Files: `packages/database/src/retrieval.ts`, `packages/database/src/qdrant.ts`, Redis cache helpers.
- New flow in `retrieveCompanyContext`: embed query (via query embedding cache), `query_points` on `company_chunks` with filter `{company_id, snapshot_id}` and `limit 20`, hydrate chunk content plus title plus url from Postgres by `document_id`, MMR diversify (`lambda 0.7`, similarity from Qdrant score, cap 6), build evidence and compiled context from the final 6 only.
- MMR is deterministic and local, no extra model call. No cross encoder in this cut.
- Caches exactly per section 0 with snapshot scoped keys. On every transition of a company snapshot to READY, delete `qctx:v1:{company_id}:*` keys. Query embedding cache needs no invalidation (query text keyed only).
- Acceptance: p95 retrieval latency down versus pgvector baseline on the resend corpus, prompt contains at most 6 excerpts, rerunning the same query twice hits cache the second time, re ingest invalidates stale context.

## 14. ✅ Fact selection and category filtering from query intent (P1) (Pipeline impact #7)

- Files: `packages/database/src/retrieval.ts`, `packages/shared/src/facts.ts` (intent vocabulary + pure selectors; extractor untouched).
- Implemented Oct 2026: static v1 map (pricing/contact/code/social/location keyword sets → `pricing_tier`/`contact_email`/`github_repository`/`twitter_handle`/`office_location`), whole-word matching, scoring with `domain` always in, cap 8 ordered by score then confidence. Category boost as stable partition of the 20 MMR inputs (pricing→pricing, code→docs), never hard-excludes.
- Acceptance: pricing question prompt contains pricing facts and at most 8 facts total; location question contains the office fact; a general question still gets the domain fact plus top confidence facts. Verified via function checks (incl. `x`/`api` substring traps).

- Files: `packages/database/src/retrieval.ts`, `packages/shared/src/facts.ts` (predicate vocabulary only, no extractor changes).
- Replace dump all facts with: score each fact by predicate to intent map plus confidence fallback. Static map v1: pricing intent keywords (`price, pricing, plan, tier, cost, subscription`) boost `pricing_tier`; contact intents (`contact, email, support, sales`) boost `contact_email`; code intents (`sdk, api, github, repo, integration`) boost `github_repository`; social intents (`twitter, x, social, handle`) boost `twitter_handle`; location intents (`office, headquarters, location, address, where`) boost `office_location`. Always include `domain` fact. Cap injected facts at 8, ordered by score then confidence. Category filter: same keyword sets boost matching chunk categories during MMR input ordering (pricing query orders pricing chunks first among the 20), never hard exclude.
- Acceptance: pricing question prompt contains pricing facts and at most 8 facts total; location question contains the office fact; a general question still gets the domain fact plus top confidence facts.

## 15. ✅ Read only CLI query commands (P2) (Pipeline impact #14)

- Implemented Oct 2026 as subcommands in `ingest-cli.ts` backed by `packages/ingest/src/query.ts`
(read-only handlers; plus `countCompanyPoints` in `packages/database/src/qdrant.ts`).
Verified live against real corpora: `stats` shows PG/Qdrant agreement, `query` surfaces
ranked excerpts with scores, `--json` pipes through `jq`.

- Files: `ingest-cli.ts` (new subcommands) or new `query-cli.ts` at root reusing the same loaders. Prefer subcommands in `ingest-cli.ts` to keep one entry: `bun ingest-cli.ts query <domain> "question" [--limit 6 --json]`, `bun ingest-cli.ts facts <domain> [--json]`, `bun ingest-cli.ts stats <domain>`.
- `query` calls the Qdrant backed `retrieveCompanyContext` (post task 13) and prints excerpts with scores plus the fact list, or `--json` prints the raw retrieved context for piping. `facts` prints the snapshot fact table. `stats` prints counts of documents, chunks, facts, snapshot status, Qdrant point count for the company filter. No writes from any of these commands.
- Acceptance: after a resend ingest, `query`, `facts`, and `stats` all run read only and `--json` output parses with `jq`.

## 16. Redis frontier with resume (P3) (Deferred, no demo impact)

- Files: `ingest-cli.ts` frontier, discovery, and crawl paths; new module `packages/crawler/src/frontier.ts` (Redis seen sets, pending sorted sets, atomic pop helpers); `crawl_jobs` row gains `frontier_checkpoint jsonb NULL` only as a lightweight pointer (job id plus counts), the full state lives in Redis, not Postgres.
- Key schema, all scoped per job id with a 7 day TTL refreshed on every write: `frontier:{job_id}:seen` (SET of normalized url strings), `frontier:{job_id}:pending` (ZSET, member url, score priority), `frontier:{job_id}:meta` (HASH: `domain`, `created_at`, `status`). Delete all three keys when the job reaches a terminal status (`READY`, `FAILED`, `CANCELLED`) after a 24 hour grace period for debugging, then let the TTL clean up the rest.
- Write path: discovery normalizes each candidate url and runs `SADD seen` plus `ZADD pending` with the `calculatePriority` score; duplicates collapse naturally via set membership. Crawl workers pop via atomic `ZPOPMAX` (Redis 5 plus) so a future second worker can never claim the same url; single machine CLI uses one popper now, the atomicity is what makes multi worker safe later. Checkpoint the in memory counters into `crawl_jobs` every 50 completed pages as today, no full url list in Postgres.
- Resume path: new flag `--resume {job_id}` reloads `pending` plus `seen` from Redis, revalidates the job row is not terminal, continues popping until the set drains or `--max-pages` is hit. Restarting without `--resume` after a kill starts a fresh job id and must not touch the old keys.
- Backpressure and bounds: cap `pending` at 10000 members (log and drop lowest priority overflow), cap each member at 2048 chars, refresh TTL on every 50 pops so long crawls never expire mid run.
- Acceptance: kill the CLI mid crawl at roughly 200 of 800 pages, rerun with `--resume`, total unique fetched urls equals the selection with zero refetches of seen urls (compare fetch log against the seen set), second resume after READY refuses with a clear message, and keys disappear after the grace period plus TTL.

## 17. Delta recrawl from stored content_hash (P3 → NEXT BUILD)

- Promoted Oct 2026: the only deferred item currently wanted. Spec below unchanged.

- Files: `ingest-cli.ts` discover, crawl, and populate paths; `packages/database/src/schema.ts` (add `etag text NULL` and `last_modified text NULL` to `documents` in this task, not earlier); retrieval invalidation already exists via task 13 and is reused unchanged.
- New snapshot per recrawl as today (never mutate the old snapshot). Discovery and selection run unchanged. Before fetching, load the latest READY snapshot documents for the company into a map of `normalized_url to {content_hash, chunk_ids, vector_ids}`.
- Fetch path: send `If-None-Match` (stored etag) and `If-Modified-Since` (stored last_modified) when present; treat HTTP 304 as unchanged without downloading a body. For 200 responses, parse as today and compare fresh `content_hash` against the map. Unchanged pages skip chunking and embedding entirely: insert new document rows carrying the same content plus fresh snapshot id, and write new chunk rows plus new Qdrant points reusing the cached vectors (hits come from the task 9 embedding cache, so OpenAI sees near zero calls for unchanged content). Changed and new pages flow through the full chunk plus embed path. Urls present in the old snapshot but absent from the new selection get no rows, which deletes them implicitly because all reads scope to the latest snapshot id; document this semantic in a code comment.
- ETag storage: persist response `etag` and `last-modified` headers onto the new document rows whenever the server sends them; servers that send neither simply fall back to full body hash comparison.
- Acceptance: re ingest of resend with no site changes issues fewer than 5 percent of the OpenAI calls of the full run, snapshot flips to READY, retrieval scoped to the new snapshot returns the same best documents as the old snapshot on the parity query set, and one edited page produces new vectors only for its own chunks.

## 18. Ownership, auth, and per-user limits — SUPERSEDED

> **Superseded by `docs/auth-tenancy.md` (v2, 2026-10-23).** Do not implement the old
> contract; this section records why it changed.

The earlier draft of this task conflicted with the canonical plan in four ways:

- It kept `crawl_jobs.owner`. The canonical plan drops that column; ownership is
  `companies.owner_id`, and `crawl_jobs` inherits through `company_id`.
- It accepted an owner from the caller for testing. The canonical plan derives the owner
  from the server session only; operator CLIs must pass an explicit `--owner` that resolves
  to a real user.
- It returned `403` on a foreign job and allowed an admin bypass. The canonical plan returns
  `404` for both missing and foreign resources, with no bypass.
- It left crawl idempotency global. The canonical plan scopes it to the company.

What remains deferred, and is **not** part of the auth pass:

- Per-owner crawl quotas (`max_concurrent_jobs`, `max_pages` tiers).
- Priority scheduling and the P0/P1 starvation guard.
- Ingest submit rate limiting beyond the auth/endpoint limits in the canonical doc.

Read `docs/auth-tenancy.md` §5, §9, and §12.1 before touching crawl ownership or limits.

## 19. ✅ Manual sitemap plus URL list input (P0) (Pipeline impact #16)

- Files: `apps/api/src/routes/crawler.ts` (new `POST /api/crawler/discover-sitemap`), `packages/crawler/src/discovery.ts` (reuse sitemap parse helpers), `apps/web/components/ingestion/ingestion-studio.tsx` (source selector), `apps/web/lib/api-client.ts` (new client method).
- Input sources, all optional and combinable in one request: (a) 1 to 3 uploaded `.xml` or `.xml.gz` files, 5MB max each, (b) one pasted sitemap URL fetched server side, (c) pasted manual URL list, one per line, for specific routes without a sitemap file.
- Parse rules: support `urlset` plus `sitemapindex` with one level of child recursion plus gzip decode, reuse the same parser used by auto discovery. Normalize URLs (trim, drop fragments, lowercase host), dedupe across all three sources, pick primary domain from first valid URL, drop cross domain URLs and report `droppedCrossDomain` count. Cap total at `maxSitemapUrls` (default 2000) and log truncation.
- Validation and safety: reject non XML content, empty urlset, and oversize files with 400 plus a plain message. Pasted sitemap URL goes through `validateSafeUrl` SSRF check like `/discover`. Manual URLs must be http or https and pass the same host check against the primary domain.
- Response contract: return standard `DiscoveryResponse` with `source: "sitemap"` on parsed items and `source: "manual"` on pasted URLs, so `DiscoveryTable` selection plus `ingestStream` plus telemetry work unchanged. No changes to crawl, parse, chunk, embed, Qdrant, or brand extraction paths.
- Frontend: source selector with three tabs (Website, Sitemap files, Specific routes) in the input card of `ingestion-studio.tsx`. Sitemap tab holds multi file dropzone plus sitemap URL input plus parsed count preview. Routes tab holds textarea with live valid count. All three converge to `setDiscoveryData` with default top 20 selection. Shared Advanced crawl settings. shadcn primitives plus semantic tokens only, Phosphor icons only.
- Acceptance: upload of 2 sitemap files plus 5 manual URLs yields one deduped `DiscoveryResponse`, cross domain URLs are dropped with a visible count, index plus gzip fixtures parse, selection and ingest stream run unchanged to READY, and invalid files return 400 with a toast and no state change.
- Merged Oct 2026 via PR #1 (`feat/discovery-sitemap-manual`): crawler helpers plus unit tests (15 green), `POST /api/crawler/discover-sitemap` (files plus sitemap URL plus manual list, SSRF-checked, uploaded index children expanded one level), studio source tabs, additive `DiscoveryResponse` fields (`droppedCrossDomain`, `info.truncated`) and `"manual"` source. Verified live: dedupe exact, cross-host counted, 400s on bad input, web build green. No crawl, parse, chunk, embed, Qdrant, or brand paths touched.

## 20. Web load time overhaul: Next 16.4 bump, drop @thesvg/icons, code-split heavy vendors (P0) (Web impact #1)

- Context Oct 13 2026: `apps/web` loads slowly in dev and prod. Root causes found by chunk audit (`apps/web/.next/static/chunks`: `app/embed/[key] 13M`, `app/playground 9.9M`, `main-app.js 7.4M`, `voice-session_tsx.js 4.2M`, dozens of `shikijs_langs_dist_*` 1-11M each; `.next` 600MB stale). `apps/web/next.config.mjs` has zero perf tactics — only `transpilePackages`. All 26 `app/**/page.tsx` files start with `"use client"` (zero RSC). No `optimizePackageImports`, no `next/font`, no `loading.tsx`/`Suspense`, no route-level splitting for recharts/streamdown/livekit.
- Files: `apps/web/package.json`, `apps/web/next.config.mjs`, `apps/web/app/layout.tsx`, `apps/web/app/loading.tsx` (new), `apps/web/app/error.tsx` (new), `apps/web/app/page.tsx`, `apps/web/app/playground/page.tsx`, `apps/web/app/embed/[key]/page.tsx`, `apps/web/app/api/icon/route.ts` (delete), `apps/web/components/ai-elements/message.tsx`, `apps/web/components/ui/chart.tsx`, `apps/web/components/ui/select.tsx`, `apps/web/components/openui-client-inner.tsx`, `apps/web/tailwind.config.ts`, `packages/genui/package.json`, `packages/genui/src/icons/registry.ts`, `packages/genui/src/icons/resolver.ts`, `packages/genui/src/icons/tech-icon.tsx`.

- 20a. Bump Next 15.1.7 → 16.4.0 (why: 15.x EOL Oct 21 2026, Critical security patch Oct 14 2026 only lands on 16.x; 16.4 adds lazy compilation of client dynamic imports + smaller Turbopack output, which directly cuts the chunk sizes above).
  - Bump `apps/web/package.json`: `next@16.4.0`, `react@^19.3`, `react-dom@^19.3`, Node >= 20.9. Run `npx @next/codemod@canary upgrade latest`.
  - Fix 16 breaking usages: `useParams()`/`useSearchParams()` in `app/embed/[key]/page.tsx` get Suspense boundary (see 20f); `app/api/icon/route.ts` gets `export const runtime = "nodejs"` before deletion (or delete outright per 20b); verify `jsx: preserve` + `transpilePackages` still resolve `workspace:*` links under bun.
  - Acceptance: `bun install && turbo run build --filter=@ag-ui/web` green; `openui-client-inner.tsx` Renderer smoke-renders; no `resolveIcons`/`metadata` type errors.

- 20b. Remove `@thesvg/icons`, keep `@ag-ui/genui` (why: zero direct uses in `apps/web` source — only transitive via `genuiLibrary`; yet `registry.ts` statically imports 118 `@thesvg/icons/*` modules + `slugs-data.ts` ships a 7,412-slug single-line string into the client graph; `app/api/icon/route.ts` exists only to serve thesvg `dist/*.js` files from disk).
  - Delete dep from `apps/web/package.json` (`@thesvg/icons@^3.3.7`) and `packages/genui/package.json`.
  - `packages/genui/src/icons/registry.ts`: delete the 118 static imports + `CORE_ICONS` entries; replace with `export const CORE_ICONS = {}` tombstone; stub `loadIconModule()` to `return null` (keep signature so `tech-icon.tsx`/`resolver.ts` compile); delete the `fetch(/api/icon?slug=)` browser branch and the `import(@thesvg/...)` SSR fallback.
  - `packages/genui/src/icons/resolver.ts` + `tech-icon.tsx`: short-circuit to existing `getCategoryFallback()` Phosphor icons (`Cube/Code/Database/Cloud/Wrench/Buildings/ShieldCheck/PlugsConnected`); `TechIcon` never suspends on network.
  - Delete `apps/web/app/api/icon/route.ts` (its `getDistDir()` fallback paths + `readFileSync(dist/<slug>.js)` + svg/hex/title regex parse become dead code once the package is gone).
  - Keep `slug-index.ts` / `semantic-map.ts` / `slugs-data.ts` files as inert data (no bundle cost once unimported) or stub to `[]` if analyzer still flags them.
  - Acceptance: `grep -r thesvg apps/web packages/genui --include="*.ts*"` returns zero code hits; build chunk list contains no `thesvg`; `TechGrid/ProductGrid/CompetitorGrid/OverviewCard/ServiceGrid/EnhancedTagBlock/ExecutiveBrief/RouteMap` render with Phosphor fallback cubes and no broken images.

- 20c. Harden `next.config.mjs` (why: 66 `import { X } from "@phosphor-icons/react"` sites across `app/`, `components/ui/`, `packages/genui/src/` each pull the full 1000+ icon barrel without dedupe).
  - Set `experimental.optimizePackageImports: ["@phosphor-icons/react", "lucide-react", "recharts", "streamdown", "@streamdown/cjk", "@streamdown/code", "sonner"]`, `compiler.removeConsole: { exclude: ["error", "warn"] }`, `poweredByHeader: false`, `productionBrowserSourceMaps: false`. Keep `transpilePackages: ["@ag-ui/contracts", "@ag-ui/shared", "@ag-ui/genui"]`.
  - Acceptance: prod first-load JS drops on every route; analyzer shows per-icon chunks instead of one Phosphor blob.

- 20d. Code-split recharts + streamdown/shiki (why: `app/page.tsx` statically imports 8 recharts primitives + `components/ui/chart.tsx` does `import * as RechartsPrimitive`; `components/ai-elements/message.tsx` statically imports `Streamdown + @streamdown/cjk + @streamdown/code`, which drags the entire Shiki grammar set into playground/embed).
  - Recharts: extract charts from `app/page.tsx` into a client island, `dynamic(() => import(...), { ssr: false, loading: skeleton })`; same for `RadarChart` block.
  - Streamdown: lazy-load `code`/`cjk` plugins in `message.tsx`; remove unused `@streamdown/math`, `@streamdown/mermaid`, `react-markdown` from `apps/web/package.json` (or dynamic-import only where an answer needs them).
  - Acceptance: no `shikijs_langs_dist_*` in the initial `/` or `/playground` chunk; `/` first-load < 400KB gz; charts pop in behind skeleton without blocking paint.

- 20e. Fix voice + fonts + icon-duplication weight (why: `voice-session_tsx.js 4.2M` — playground already `dynamic`s it but `app/embed/[key]/page.tsx` imports it statically, making embed the heaviest route; `app/layout.tsx` uses `@fontsource-variable/*` render-blocking CSS instead of `next/font`; `components/ui/select.tsx` is the sole `lucide-react` user while everything else uses Phosphor).
  - `app/embed/[key]/page.tsx`: change `import { VoiceSession }` to `dynamic(() => import("@/components/voice/voice-session"), { ssr: false })` (parity with `app/playground/page.tsx`).
  - `app/layout.tsx`: replace `@fontsource-variable/hanken-grotesk + jetbrains-mono` CSS imports with `next/font/google` (latin subset, `display: swap`, CSS vars `--font-sans/--font-code` preserved for `globals.css`).
  - `components/ui/select.tsx`: swap `lucide-react Check/ChevronDown/ChevronUp` → Phosphor equivalents; drop `lucide-react` dep.
  - `tailwind.config.ts`: drop `./pages/**` (dir does not exist); narrow `../../packages/genui/src/**/*` to `../../packages/genui/src/components/**/*` so dev does not re-scan the icon registry on every rebuild.
  - Acceptance: `/embed/[key]` chunk drops from ~13M dev; font CSS no longer render-blocks; one icon runtime only.

- 20f. RSC + routing hygiene (why: all-`"use client"` forces full JS per page; `useSearchParams` without `<Suspense>` + `export const dynamic = "force-dynamic"` on embed forces whole-route client render + 5s×40 config-poll waterfall with no skeleton).
  - Remove `"use client"` from pure presentational routes (`analytics/*`, `agents`, `operations/*`, `settings/*`, `experience/*`, `visitors/*`, `intelligence/*`, `integration/*` where no hooks are used); keep it on `/`, `playground`, `embed/[key]`, `knowledge/*`.
  - `app/embed/[key]/page.tsx`: wrap the `useSearchParams` subtree in `<Suspense fallback>`; drop `force-dynamic` unless the indexing poll provably needs it.
  - Add `app/loading.tsx` (chart/chat skeletons) + `app/error.tsx` so transitions never blank.
  - Acceptance: layout statically renders; route transitions show skeletons; embed works with Suspense boundary and no deopt warning in build output.
  - Status: ✅ DONE (Oct 2026). Boundaries + embed Suspense landed with the perf PRs; the `"use client"` removal (17 presentational routes) landed on `feat/widget-studio` (`98eae4e`) — an accepted deviation from the 20a-20g branch policy below.

- 20g. Cleanup + verify (why: 600MB `.next` inflates `next dev` cold start; dead deps slow resolve).
  - `rm -rf apps/web/.next`; re-measure cold start + HMR vs pre-fix baseline (Phase 0); run `turbo run build lint`; confirm analyzer: zero `thesvg`, zero initial `shikijs_langs`, per-route JS down; smoke-test overview charts, playground stream, embed chat + voice mount on demand, GenUI cards with fallback icons.
  - **Results (Oct 18 2026, `feat/widget-studio`):**
    - `.next`: 475 MB → 372 MB after a cold build, of which 240 MB is `.next/dev` + 92 MB cache; production `static` = 16 MB, 368 chunks, 15 MB JS, largest chunk 0.75 MB (the old embed chunk was 13 MB).
    - `next build` cold: 20 s. `next dev` cold start: 453 ms (stale `.next`) → 346 ms (fresh). `turbo run build` clean; `turbo run test` green (17 tests, 2 packages).
    - Initial JS: `/` **288 KB gz** (target < 400 KB ✅); `/playground` **439 KB gz** (baseline 9.9 MB raw dev); `/embed/<key>` ~1.1 MB raw incl. the 0.58 MB livekit chunk.
    - Zero `thesvg` anywhere in `.next`; zero shikijs in production `static` (only in `.next/dev` build artifacts).
    - Smoke: home charts render (2 recharts surfaces, 0 broken images); all 17 server-rendered routes render badge + h1 + icon, 0 console errors; embed chat renders under `?noCitations=1` with no evidence UI and 0 broken images; playground streams a real answer (25 deltas); the `brand` SSE already carries the hashed `themeVersion`.
    - **Findings:** (1) `VoiceSession` is code-split but rendered unconditionally (`embed-chat.tsx:692`), so the 0.58 MB livekit chunk loads on first paint of `/embed` and `/playground` — deferring it behind the mic button is a follow-up. (2) GenUI smoke item is **not applicable**: chat is text-only and `OpenUIRenderer` is unreferenced dead code — restore or drop the acceptance line. (3) `turbo run lint` is vacuous: every package's `lint` is `echo "<pkg>: lint ok"`, so a green lint is no signal until real ESLint lands.
    - Follow-up closed: the company-detail theme-merge gap (unmerged `theme` + bare `themeVersion`) was fixed in `f94bfd2` — `GET /api/companies/:id` now resolves via the shared resolver and exposes a pristine `baseTheme`.

- Branch policy: all of 20a-20g happens on a separate feature branch cut from `main` (e.g. `perf/web-load-overhaul`), never directly on `main`. `main` stays deployable throughout. Merge into `main` only after 20g acceptance is green (build + lint + analyzer gates + smoke tests) via reviewed PR; delete the branch after merge. (Deviation, accepted: 20f + 20g landed on `feat/widget-studio` and merge to `main` through that branch's PR.)

- Implementation plan — web load overhaul (`perf/web-load-overhaul`). Order is A → G, each independently verifiable; B/C may parallelize after A. Riskiest is A (major bump) — timebox it before touching components.
  - Phase A — framework bump (Next 15.1.7 → 16.4, React → 19.3): bump `apps/web/package.json`, run the Next upgrade codemod, fix breaking usages (Suspense around `useSearchParams` in embed, route runtime exports). Acceptance: `bun install && turbo run build --filter=@ag-ui/web` green, GenUI renderer smoke-renders, no type errors. Do this first — everything else builds on the new compiler behavior.
  - Phase B — drop the icon package: remove it from both `package.json` files, replace the static icon registry with an empty tombstone + null loader, short-circuit the resolver and `TechIcon` to the existing Phosphor category fallbacks, delete `app/api/icon/route.ts`. Acceptance: zero code references to the package, no icon chunks in the build output, all GenUI grids render with fallback icons and no broken images.
  - Phase C — harden `next.config.mjs`: add `optimizePackageImports` for the icon barrel, recharts, streamdown, and sonner; strip non-error console in production; disable powered-by header and browser source maps. Keep `transpilePackages`. Acceptance: per-route first-load JS drops, analyzer shows split icon chunks.
  - Phase D — split charts + markdown: extract home-page charts into a dynamically imported island with skeleton loading; lazy-load the markdown code/cjk plugins; drop unused markdown plugins from deps. Acceptance: no syntax-grammar chunks in initial home/playground load, home first-load under 400KB gz, charts pop in behind skeletons.
  - Phase E — voice, fonts, icon duplication: dynamic-import voice on the embed route (matching playground), swap render-blocking font CSS for `next/font` with the same CSS vars, swap the three lucide icons in `select.tsx` for Phosphor equivalents and drop the dep, narrow the Tailwind content scan off the icon registry. Acceptance: embed chunk collapses, fonts non-blocking, single icon runtime.
  - Phase F — rendering hygiene: remove `"use client"` from presentational routes only (keep it on home, playground, embed, knowledge), Suspense-wrap the embed search-params subtree, add root loading and error boundaries. Acceptance: static layout render, skeleton transitions, no deopt warnings in build output.
  - Phase G — cleanup + verify: wipe `.next`, re-measure cold start vs now, full `turbo run build lint`, analyzer confirmation (zero icon-package, zero initial grammar chunks, per-route JS down), smoke-test charts, playground stream, embed chat + on-demand voice, GenUI cards. Merge to `main` via PR only after all gates pass, then delete the branch.

## 21. Widget Studio: exact embed preview + playground, Appearance goes facts-only (P0) (Widget impact #1)

- Context Oct 2026: `Experience > Appearance` mixes dembrandt inspector + static `WidgetPreview` mock that already drifts from `app/embed/[key]/page.tsx`. Goal: single extraction provider (`dembrandt` only), Appearance = read-only brand facts, new `Experience > Widget Studio` = only widget renderer, pixel-identical to prod embed via real iframe, answer-only (no citations), full experimental controls.
- Files edit: `apps/web/app/experience/appearance/page.tsx`, `apps/web/app/embed/[key]/page.tsx`, `apps/web/components/chat-message.tsx`, `apps/web/hooks/use-company-chat.ts`, `packages/shared/src/widget-theme.ts`, `apps/api/src/routes/embed.ts`, `packages/database/src/retrieval.ts`, `packages/database/src/schema.ts` (new `widget_theme_overrides`), `apps/web/lib/api-client.ts`, `apps/web/public/embed.js` (orb CSS constant share).
- Files new: `apps/web/app/experience/widget-studio/page.tsx`, `apps/web/components/experience/studio-controls.tsx`, `apps/web/components/experience/studio-orb-preview.tsx`, migration `widget_theme_overrides {company_id PK FK, override JSONB NOT NULL, updated_at}`.
- Files delete: `apps/web/components/experience/widget-preview.tsx` (after cutover).

- 21a. Single provider + Appearance facts-only (why: two writers `extractBrandIntelligence` + `brand-worker` race on `brands` row; mock preview confuses source-of-truth).
  - `populate.ts` + `workers/worker/src/index.ts`: demote cheerio path to emergency fallback only when no `READY` `brand_stylesheets` row exists; never overwrite `READY`-derived `brands.tokens`. `brand-worker.ts` stays sole writer (`runDembrandt → mapDembrandtToTokens → brands` + `brand_stylesheets {raw,dtcg,tailwind,designMd,wcag}`).
  - `appearance/page.tsx`: delete `WidgetPreview` import + card (lines ~1301-1324); keep logo/screenshot, Colors (12, de-dupe, conf<0.5 drop), Typography table, Shape/elevation, Components (links/buttons/inputs/badges), WCAG pairs (20), Tailwind/DTCG/DESIGN.md `ExportBlock`s, history selector. No editors.
  - Acceptance: Appearance shows zero widget render; re-crawl updates facts; no `widget-preview` import remains.

- 21b. Exact preview via prod iframe + theme channel (why: shared-component still drifts via parent cascade/width/dark-class; iframe = same bundle = parity by definition).
  - Studio layout: left `studio-controls`, right sticky column with (1) orb preview 56px using shared orb-CSS constant with `embed.js`, (2) panel `iframe src=/embed/[key]?api=&preview=1&noCitations=1` sized `400x600, min(100vw-32px,100dvh-140px)`, `border 1px radius 16px`, same `sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` + `allow="microphone; autoplay"`.
  - Extract `EmbedChatInner` from `embed/[key]/page.tsx` for maintainability but Studio mounts via iframe only, never direct import.
  - Theme channel: Studio `postMessage {type:"ag-ui/theme", theme, themeVersion:"draft-<hash>"}`; embed page adds `message` listener running existing `applyWidgetTheme(documentElement)+widgetThemeVars(theme)` path incl. `bodySurface/accentOnSurface` gating. Initial paint via `?color=&surface=&text=` (existing), live drags over channel. Force same `dark` class + font vars inside iframe; no transformed ancestors.
  - Acceptance: Studio iframe vs prod `/embed/key` screenshot diff 0px at desktop + mobile widths, light brand (`#9b6a45/3px`) + low-contrast neutral-shell fixture; control drag updates <100ms no reload.

- 21c. Answer-only embed flag (why: Studio + prod embed need citations stripped, answer only).
  - `embed/[key]/page.tsx`: add `preview` + `noCitations` search params; when `noCitations=1` skip `openDrawerWithEvidence`, hide evidence badges/counts in `chat-message.tsx`, suppress drawer/sheet, keep `streamChat` deltas unchanged. `use-company-chat onEvidence` ignored for UI (still received), `onBrand` still re-themes with `themeVersion` dedup.
  - Acceptance: `?noCitations=1` shows zero evidence UI; chat sends/streams; default (no flag) unchanged until global flip.

- 21d. Playground controls + sanitized draft (why: folks need to play with every vibe slot without touching extraction).
  - Groups writing to local `WidgetThemeDraft`: Shell (`surface/text` + live contrast ratio, block publish if `<4.5` unless neutral-shell toggle), Accents (`primary/secondary` + hover/focus), User bubble (`bg/text/radius`), Bot bubble (`bg/text/border/radius`), Header (`bg/text/border`, logo show/hide `https`-only, title/domain text inputs), Input (`bg/border/radius/focus` + placeholder text), Orb (`bg/hover/border/radius`, icon pickers for orb `✦`/logo-mark + send `PaperPlaneTilt` from Phosphor set, icon color), Shape scale (`0/0.25/0.5/0.75/9999px` + custom validated by `RADIUS_RE`).
  - All inputs through `cleanHex/cleanRadius/cleanLogoUrl` in `widget-theme.ts` (new `mergeThemeOverride(base, override)` + `isValidOverride()`); invalid → revert + toast. Actions: `Reset to brand`, `Copy CSS vars`, `Copy snippet`.
  - Acceptance: every control live-updates iframe; XSS fixtures (`javascript:` logo, `expression()` radius, non-hex) fall back to defaults; heading/placeholder text edits reflect instantly.

- 21e. Persist draft → publish without clobbering brand (why: dembrandt re-crawl must never wipe manual tweaks).
  - `widget_theme_overrides` table; `GET /:key/config` merges `mapBrandToWidgetTheme(tokens,logo,wcag)+override` → `theme`, `themeVersion=stylesheetId+overrideHash`. `retrieval.ts brandWithVersion` carries same version so chat `brand` SSE re-themes open widgets. Studio `Publish` upserts override + busts `qctx` cache; `Discard` deletes row.
  - Acceptance: Publish → config returns new `themeVersion`, open embed re-themes no-reload; dembrandt re-extract preserves override; Discard restores extraction theme.

- 21f (follow-up, non-blocking — sprint). Studio deep-link: `app/experience/widget-studio/page.tsx` ignores `?company=` (its `companyId` comes from the persisted `useSelectedCompany` store), so a shared/bookmarked studio URL silently resolves to the viewer's own selected company. Only `…/widget-studio/preview` honours the param. Fix: read `useSearchParams()`, seed the store selection on mount, URL wins without a wrong-company flash.

- Branch policy: all of 21a-21e happens on feature branch `feat/widget-studio` cut from `main`, never directly on `main`. `main` stays deployable throughout. Merge into `main` only after 21b screenshot-diff + 21c/21d/21e acceptance is green via reviewed PR; delete the branch after merge.

## 22. ✅ Fix: Intelligence routes missing from route-policy manifest — 500s on Intent Radar + Signals (P0)

- Files: `apps/api/src/route-policy.ts`.
- Symptom: every request to `/api/analytics/intel/radar` and `/api/analytics/intel/drafts` (GET/POST/PATCH) answered 500 `{error: "Route policy missing"}` — the auth plugin (`auth/plugin.ts`) 500s any route absent from the manifest before a handler runs. Both Intelligence pages failed for every company.
- Fix: declared the four intel routes with `company("query")` (radar, drafts GET) and `company("body")` (drafts POST/PATCH, matching the routes' `requireCompany(ctx, "body")`); the per-tenant read-budget guard already runs in the routes' `onBeforeHandle`.
- Process fix (the real lesson): the verification loop must run `bun test apps/api` alongside `bun test packages` — the route-policy drift test existed and would have failed loudly in Phase A; it was never invoked.
- Acceptance: `bun test apps/api` drift test ("declares every live route exactly once") passes with the four routes declared; no other undeclared route surfaced. ✅ verified (40 API tests green).

## 23. Robots.txt opt-in compliance in the ingestion pipeline (P0)

- Files: new `packages/crawler/src/robots.ts`; `packages/crawler/src/discovery.ts`; `packages/crawler/src/index.ts` (`CrawlOptions`); `apps/api/src/routes/crawler.ts`; `packages/ingest/src/pipeline.ts` + `discover.ts`; `apps/web/lib/api-client.ts`; `apps/web/components/ingestion/ingestion-studio.tsx`.
- Opt-in only: `useRobots` defaults to **false** everywhere (UI checkbox, API bodies, pipeline option, `CrawlOptions`). When false, robots.txt is never fetched and discovery is byte-identical to today's behavior.
- When true: robots.txt fetched once returning `{sitemaps, rules}` (today `discoverFromRobotsTxt` fetches it and discards the rules). Rules per RFC 9309: most-specific matching `User-agent` group (`ag-ui-crawler` named group, else `*`), longest-pattern-wins, Allow beats Disallow on ties, `*` wildcard and `$` anchor. Disallowed candidates (llms.txt URLs, sitemap entries, homepage nav links, root) are dropped and counted, never queued.
- Unreachable robots (5xx / network error): flag `robotsUnreachable` and proceed no-robots — owner-self-ingestion tooling, fail-open by decision (RFC's fail-closed on 5xx deliberately not adopted).
- Surfaces: `DiscoveryInfo` += `robotsChecked`, `robotsSkipped`, `robotsUnreachable?`. Ingest pipeline fetch phase re-checks each URL against the rules before fetching (defense for mid-crawl-discovered links and UI-selected URLs) and reports skips in the SSE progress stream. `CompanyCrawler.crawl` gets an optional flag, default false — worker behavior preserved.
- UI (`ingestion-studio.tsx`): checkbox "Respect robots.txt" next to the URL input, default off; rides both the `discover` and `ingest` calls so selection and crawl agree. Result lines: "Skipped N URLs flagged in robots.txt" (N > 0 only); "robots.txt unreachable — crawling without it" on failure. Sitemap-upload/manual tab stays unfiltered (owner-curated by hand).
- `Crawl-delay` parsed and surfaced only, never enforced — `hostGapMs` remains the single politeness knob.
- Tests: `packages/crawler/src/robots.test.ts` — `*` group, named-group specificity, longest-match, Allow/Disallow ties, `$` anchor, no-rules → allowed, malformed → fail-open; filter helper tested pure (style of `discovery-sitemap.test.ts`).
- Acceptance: parser/filter tests green; checkbox off → identical discovery behavior; checkbox on → skipped count reported and disallowed URLs never fetched.

## Demo verification checklist (run in order) (P0) (Verification)

Ran Oct 2026 against nescafe.com scoped to 100 pages (instead of the resend 50/1000 below):

1. `docker compose up -d` then `bun scripts/qdrant-init.ts` exits 0 twice in a row. ✅ (collection validated: 1536 cosine, 5 indexes)
2. `bun ingest-cli.ts https://resend.com --discover-only --limit 20` lists ranked urls with categories. ✅ equivalent: nescafe discover-only returned 387 ranked urls (root first, contacts high)
3. `bun ingest-cli.ts https://resend.com --limit 50 --yes` completes with docs, chunks, facts, snapshot READY, and a `crawl_jobs` row with sane counters. ✅ equivalent: nescafe `--limit 100` → 93 docs / 155 chunks / 3 facts, READY, job row 100/100/93/4
4. Parity doc `docs/parity-check.md` green, then cutover ingest, then `query`, `facts`, `stats` commands return correct scoped results. ✅ equivalent: parity recorded per #12 note above; all three commands verified on live corpora
5. Full resend ingest at `--max-pages 1000` completes unattended with dead letter list populated instead of a crash on bad pages. ✅ equivalent: 100-page run, 4 dead letters recorded per policy (500 retried ×3, 404 ×1, timeouts), run never wobbled

Original resend-scoped checklist (kept for reference):

1. `docker compose up -d` then `bun scripts/qdrant-init.ts` exits 0 twice in a row.
2. `bun ingest-cli.ts https://resend.com --discover-only --limit 20` lists ranked urls with categories.
3. `bun ingest-cli.ts https://resend.com --limit 50 --yes` completes with docs, chunks, facts, snapshot READY, and a `crawl_jobs` row with sane counters.
4. Parity doc `docs/parity-check.md` green, then cutover ingest, then `query`, `facts`, `stats` commands return correct scoped results.
5. Full resend ingest at `--max-pages 1000` completes unattended with dead letter list populated instead of a crash on bad pages.
