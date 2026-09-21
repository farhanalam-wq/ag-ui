# TASKS: scalable ingest pipeline plus Qdrant retrieval 

Goal: CLI driven discover, select, concurrent crawl, parse, chunk, embed, and store path that runs on a single local machine for the demo, with Qdrant as the vector index and upgraded retrieval. No multi worker distribution, no per user auth, no delta recrawl in this cut. Deferred items sit at the bottom with full detail and stay out of scope until the demo is accepted.

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

## 3. Idempotency key per company plus selection hash (P2) (Pipeline impact #12)

- Files: `ingest-cli.ts` selection block, `packages/database/src/schema.ts` (constraint from task 2).
- Key input string: `domain + "\n" + sorted_normalized_selected_urls.join("\n") + "\n" + chunker_version + "\n" + embed_model_version`, where `chunker_version = "chunker-v1:1800:250"` and `embed_model_version = "text-embedding-3-small:1536"`. Key = `sha256(input)`.
- Behavior: before creating company snapshot, `SELECT` from `crawl_jobs` by key. On hit with terminal status `READY`, print existing `company_id`, `snapshot_id`, counts, and exit 0 without crawling. On hit with live status, print job id and status and exit 2. On miss, insert the row and proceed.
- Acceptance: running the same `--select` twice in a row crawls once; second run exits after the lookup with no fetch activity.

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

## 6. max_pages cap and max_concurrent_jobs enforcement in the CLI (P2) (Pipeline impact #11)

- Files: `ingest-cli.ts` selection block plus job creation.
- Flags: `--max-pages` (default 1000, clamp 1 to 5000). After selection parsing, truncate selection to `max_pages` highest priority urls and log `truncated X urls to max_pages`.
- `max_concurrent_jobs` (default 1, max 2, flag `--max-concurrent-jobs`): before starting, count `crawl_jobs` rows with live statuses (`QUEUED`, `DISCOVERING`, `CRAWLING`, `PARSING`, `EMBEDDING`) created by this machine marker. If count is at the cap, exit 3 with a message listing the live job ids. Since there is no owner yet, scope this check to all live rows and note the simplification in a code comment referencing this task.
- Acceptance: `--max-pages 10 --all` on a large discovery crawls exactly 10; starting a second ingest while one is live exits 3.

## 7. Parse as a separate in process stage with URL plus title category rules (P1) (Pipeline impact #8)

- Files: `ingest-cli.ts` crawl path, `packages/crawler/src/extractor.ts` (`inferCategory`, `extractCleanContent`).
- Change `crawlPages` from fetch plus parse inside one pool worker to two stages: stage A fetches raw HTML with fetch concurrency and pushes `{url, html, status, tier}` into a bounded in memory queue (cap 200, backpressure: fetch workers wait when full); stage B parses with parse concurrency (calls `extractCleanContent`, computes hash, word count, headings, applies thin and duplicate filters).
- Category rule: `inferCategory(url, title)` already takes both, so call it with the parsed title, not empty string. Keep the keyword sets, but make them table driven: one `CATEGORY_RULES` array of `{category, match: string[]}` at the top of `extractor.ts` covering about, pricing, product, docs, blog, general. Add `blog` category via matches on `blog`, `changelog`, `news`, `post`. Category aware cleaning: for `blog`, strip `aside`, `.sidebar`, `.newsletter`, `.related-posts`, `.share-buttons` in addition to current selectors; for `docs`, retain `pre`, `code`, `table`, `h4` content that the boilerplate stripper would otherwise drop.
- Acceptance: resend run shows fetch and parse progressing independently in logs, blog urls classify as `blog`, docs pages keep code blocks in stored content, and a unit check on 6 sample url plus title pairs returns the expected categories.

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

## 12. 🔄 Dual write behind a flag, parity check on resend, then drop pgvector (P1) (Pipeline impact #6)

- Files: `ingest-cli.ts` populate path, new module `packages/database/src/qdrant.ts` (client, upsert, query helpers), `.env.example` (`QDRANT_DUAL_WRITE=false`).
- When `QDRANT_DUAL_WRITE=true`: after generating the ordered vectors, write Postgres `chunks` rows exactly as today AND upsert Qdrant points `{id: chunk_uuid, vector, payload}` in batches of 256 to 512. If either side fails terminally, mark snapshot `FAILED` and do not mark READY. Point ID must equal the Postgres chunk UUID string.
- Parity procedure on the resend corpus: run at least 20 sample queries spread across pricing, product, docs, blog, about; compare pgvector top 10 vs Qdrant top 10 document id sets; require Jaccard >= 0.8 on every query plus 5 hand checked question to answer pairs returning the same best document. Record results in `docs/parity-check.md` (queries, scores, verdict).
- Cutover only after parity passes: flip reads to Qdrant (task 13), run one clean ingest, then issue the migration dropping the `chunks.embedding` column and removing dual write code paths. Keep the migration file and a backfill note so the decision is reversible by re embedding from stored chunk content.
- Acceptance: parity doc exists with all green checks, cutover ingest writes Qdrant only, `chunks.embedding` column is gone, retrieval works with zero pgvector references.

## 13. 🔄 Retrieval: Qdrant top 20, MMR to 6, caches with snapshot invalidation (P0) (Pipeline impact #3)

- Files: `packages/database/src/retrieval.ts`, `packages/database/src/qdrant.ts`, Redis cache helpers.
- New flow in `retrieveCompanyContext`: embed query (via query embedding cache), `query_points` on `company_chunks` with filter `{company_id, snapshot_id}` and `limit 20`, hydrate chunk content plus title plus url from Postgres by `document_id`, MMR diversify (`lambda 0.7`, similarity from Qdrant score, cap 6), build evidence and compiled context from the final 6 only.
- MMR is deterministic and local, no extra model call. No cross encoder in this cut.
- Caches exactly per section 0 with snapshot scoped keys. On every transition of a company snapshot to READY, delete `qctx:v1:{company_id}:*` keys. Query embedding cache needs no invalidation (query text keyed only).
- Acceptance: p95 retrieval latency down versus pgvector baseline on the resend corpus, prompt contains at most 6 excerpts, rerunning the same query twice hits cache the second time, re ingest invalidates stale context.

## 14. Fact selection and category filtering from query intent (P1) (Pipeline impact #7)

- Files: `packages/database/src/retrieval.ts`, `packages/shared/src/facts.ts` (predicate vocabulary only, no extractor changes).
- Replace dump all facts with: score each fact by predicate to intent map plus confidence fallback. Static map v1: pricing intent keywords (`price, pricing, plan, tier, cost, subscription`) boost `pricing_tier`; contact intents (`contact, email, support, sales`) boost `contact_email`; code intents (`sdk, api, github, repo, integration`) boost `github_repository`; social intents (`twitter, x, social, handle`) boost `twitter_handle`; location intents (`office, headquarters, location, address, where`) boost `office_location`. Always include `domain` fact. Cap injected facts at 8, ordered by score then confidence. Category filter: same keyword sets boost matching chunk categories during MMR input ordering (pricing query orders pricing chunks first among the 20), never hard exclude.
- Acceptance: pricing question prompt contains pricing facts and at most 8 facts total; location question contains the office fact; a general question still gets the domain fact plus top confidence facts.

## 15. Read only CLI query commands (P2) (Pipeline impact #14)

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

## 17. Delta recrawl from stored content_hash (P3) (Deferred, no demo impact)

- Files: `ingest-cli.ts` discover, crawl, and populate paths; `packages/database/src/schema.ts` (add `etag text NULL` and `last_modified text NULL` to `documents` in this task, not earlier); retrieval invalidation already exists via task 13 and is reused unchanged.
- New snapshot per recrawl as today (never mutate the old snapshot). Discovery and selection run unchanged. Before fetching, load the latest READY snapshot documents for the company into a map of `normalized_url to {content_hash, chunk_ids, vector_ids}`.
- Fetch path: send `If-None-Match` (stored etag) and `If-Modified-Since` (stored last_modified) when present; treat HTTP 304 as unchanged without downloading a body. For 200 responses, parse as today and compare fresh `content_hash` against the map. Unchanged pages skip chunking and embedding entirely: insert new document rows carrying the same content plus fresh snapshot id, and write new chunk rows plus new Qdrant points reusing the cached vectors (hits come from the task 9 embedding cache, so OpenAI sees near zero calls for unchanged content). Changed and new pages flow through the full chunk plus embed path. Urls present in the old snapshot but absent from the new selection get no rows, which deletes them implicitly because all reads scope to the latest snapshot id; document this semantic in a code comment.
- ETag storage: persist response `etag` and `last-modified` headers onto the new document rows whenever the server sends them; servers that send neither simply fall back to full body hash comparison.
- Acceptance: re ingest of resend with no site changes issues fewer than 5 percent of the OpenAI calls of the full run, snapshot flips to READY, retrieval scoped to the new snapshot returns the same best documents as the old snapshot on the parity query set, and one edited page produces new vectors only for its own chunks.

## 18. Per user rate limits, ownership checks, queue priority (P3) (Deferred, no demo impact)

- Files: `apps/api/src/routes/companies.ts` (or the ingest submitter that replaces it), progress plus cancel plus query endpoints, `crawl_jobs` `owner` and `priority` columns which already exist from task 2 and stay untouched here.
- Ownership: job creation accepts `owner` (session or user id from the caller, never trust client free text in the deployed version, derive it server side). Progress, cancel, and query endpoints require `owner` match or an admin bypass flag; mismatch returns 403 with the job id and no data. CLI passes `--owner` explicitly in this task for testing, defaulting to `local-ceo`.
- Quotas per owner: `max_concurrent_jobs` counted over live rows filtered by `owner` (default 2), `max_pages` per job by owner tier (default 1000, overridable per owner row when a tier table exists, otherwise a static map in config), ingest submit rate limit of 5 submits per hour per owner via Redis sliding window key `rl:ingest:{owner}` (sorted set of timestamps, 1 hour window, reject with 429 plus `Retry-After`).
- Priority scheduling: `priority` integer, 0 normal, 1 demo or preview jump. The picker always takes the oldest live job with the highest priority first. Starvation guard: any P0 job waiting longer than 10 minutes is treated as P1 for ordering only (column value unchanged, ordering key computed at pick time). Cap P1 jobs at 1 concurrent pick so bulk backfills can never fully starve normal jobs.
- Acceptance: two owners submitting simultaneously each hit their own live job cap independently; a P1 demo job submitted after a P0 bulk job is picked first; a third owner reading another owner's job id gets 403; the rate limiter rejects the 6th submit inside the hour with 429.

## Demo verification checklist (run in order) (P0) (Verification)

1. `docker compose up -d` then `bun scripts/qdrant-init.ts` exits 0 twice in a row.
2. `bun ingest-cli.ts https://resend.com --discover-only --limit 20` lists ranked urls with categories.
3. `bun ingest-cli.ts https://resend.com --limit 50 --yes` completes with docs, chunks, facts, snapshot READY, and a `crawl_jobs` row with sane counters.
4. Parity doc `docs/parity-check.md` green, then cutover ingest, then `query`, `facts`, `stats` commands return correct scoped results.
5. Full resend ingest at `--max-pages 1000` completes unattended with dead letter list populated instead of a crash on bad pages.
