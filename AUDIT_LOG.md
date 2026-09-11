# ag-ui Project Audit & Milestone Log

This document serves as the chronological, living audit trail for all architectural decisions, milestone completions, configuration updates, and feature implementations across the `ag-ui` repository.

---

## Milestone 0: Architecture Formulation & Environment Validation
**Date**: 2026-09-11  
**Status**: Completed  

### Architectural Decisions Confirmed:
1. **Repository Name**: Formally established as `ag-ui`.
2. **Unified Runtime**: Standardized 100% on **Bun** (runtime, package manager, and workspaces).
3. **Monorepo Task Runner**: Standardized on **Turborepo** conforming to official guidelines (package-level tasks, explicit `turbo run` syntax, caching).
4. **Database & ORM**: PostgreSQL with `pgvector` extension; Drizzle ORM selected for zero binary dependencies and native vector extension support.
5. **Queue Engine**: Redis (via native Memurai on Windows listening on `127.0.0.1:6379`) running BullMQ.
6. **Dockerized PostgreSQL + pgvector**:
   - Docker container `ag-ui-postgres` with `pgvector/pgvector:pg16` active on `localhost:5432`.
   - Host connectivity verified via Windows terminal.
   - Vector extension (`v0.8.6`) created and verified.
7. **Single Source of Truth**: Doubled down on `packages/contracts` using Zod for compile-time types (`z.infer`) and runtime validation across API, Workers, and LLM GenUI payloads.

---

## Milestone 1: Monorepo Foundation & Scaffolding (Phase 1)
**Date**: 2026-09-11  
**Status**: Completed    

### Deliverables:
- [x] Root orchestration files:
  - `package.json` with native Bun `workspaces`: `["apps/*", "packages/*", "workers/*"]` & `"packageManager": "bun@1.4.2"`.
  - `turbo.json` with pipeline definitions (`build`, `dev`, `lint`, `clean`) and empty output declarations for non-emitting packages.
  - `tsconfig.base.json` & root `tsconfig.json`.
  - `.gitignore` & `docker-compose.yml`.
  - `AUDIT_LOG.md`.
- [x] Internal packages scaffolding (`packages/*`):
  - `packages/contracts`: Core Zod schemas (`Company`, `Crawl`, `BrandTokens`, `VisualSpec`, `Answer`).
  - `packages/database`: Drizzle ORM setup + pgvector schema definition (`companies`, `companySnapshots`, `brands`, `documents`, `chunks` with `vector(1536)`, and `facts`).
  - `packages/shared`: Logger, env validation, constants.
  - `packages/queues`: BullMQ queue definitions (`crawlQueue`, `processingQueue`, `embeddingQueue`).
- [x] Applications scaffolding (`apps/*` & `workers/*`):
  - `apps/api`: Elysia + Bun modular backend skeleton with Swagger UI (`/swagger`) and `/health`.
  - `apps/web`: Next.js 15 (App Router, Tailwind CSS, TypeScript) on Bun.
  - `workers/worker`: BullMQ background queue worker on Bun.
- [x] Workspace verification:
  - `bun install`: All 7 workspace packages linked with zero errors.
  - `bun run build`: All 7 packages compiled successfully via Turborepo (`7 successful, 7 total`).
  - Turbo caching verified: 6 packages restored from cache instantly.
  - Elysia API verified: `/health` returns `200 OK`.
  - Database connectivity verified: PostgreSQL + `pgvector` (`v0.8.6`) active on `localhost:5432`.
  - Redis connectivity verified: Memurai active on `127.0.0.1:6379`.

---

## Milestone 2: Environment Configuration & Credential Harmonization
**Date**: 2026-09-11  
**Status**: Completed  

### Changes & Cherry-Picked Integrations:
1. **Runtime Variable Harmonization**:
   - Updated `packages/shared/src/env.ts` to support `RUNTIME_ENV` (with fallback to `NODE_ENV`).
2. **LiveKit Realtime Voice Integration**:
   - Integrated internal voice agent WebRTC connection endpoints (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL`).
3. **AI Models & Adapters**:
   - Configured active API keys for **OpenAI** (`OPENAI_API_KEY`), **Google Gemini** (`GOOGLE_API_KEY`), and **Sarvam AI** (`SARVAM_API_KEY`).
4. **Media & Visual Assets**:
   - Configured Pixabay API (`NEXT_PUBLIC_PIXABAY_API_KEY`) and internal media host (`MEDIA_BASE_URL`).
5. **Auth & OAuth**:
   - Retained Google OAuth client credentials and redirect URIs (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SECRET_KEY`).
6. **Deliberately Excluded**:
   - `MONGODB_URL` & `MONGODB_DB_NAME`: Excluded in adherence to architectural single-source-of-truth mandate (PostgreSQL + pgvector).
   - Third-party notification channels (`WHATSAPP_ACCESS_TOKEN`, `SENDER_EMAIL`) parked for post-MVP.

---

## Milestone 3: Database Schema & Vector Index Deployment
**Date**: 2026-09-11  
**Status**: Completed  

### Deliverables & Verification:
- Pushed complete relational model to PostgreSQL (`ag_ui`) via Drizzle ORM:
  - `companies`: Primary domain entity with unique domains and URLs.
  - `company_snapshots`: Versioned snapshots for immutable crawling provenance with cascade deletes.
  - `brands`: Brand tokens and logo storage linked to companies.
  - `documents`: Normalized crawled content categorized by page type (`about`, `pricing`, `product`, etc.).
  - `chunks`: Segmented text chunks with native `vector(1536)` embeddings.
  - `facts`: Structured key-value subject-predicate-value facts with confidence scores and source provenance.
  - `conversations` & `messages`: Thread history and assistant messages storing citations (`evidence`) and visual specs (`visual_spec`).
- Vector Indexing:
  - Implemented and verified `chunks_embedding_idx` using `hnsw` with `vector_cosine_ops`.
- Verified live in database: All 8 relations confirmed via `psql \dt` and `\d chunks`.

---

## Milestone 4: Ingestion & Crawler Engine Deployment (@ag-ui/crawler)
**Date**: 2026-09-11  
**Status**: Completed  

### Deliverables & Verification:
- Storage Layer (`packages/shared/src/storage.ts`):
  - Created provider-agnostic `StorageProvider` interface (`upload`, `get`, `getUrl`, `delete`).
  - Implemented `LocalStorageProvider` for local development serving assets from `./storage/`.
- SSRF Security Protection (`packages/crawler/src/ssrf.ts`):
  - DNS resolution validation and private/loopback/cloud metadata IP blocking (`127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, `169.254.169.254`).
- LLMs.txt Prioritization (`packages/crawler/src/llms-txt.ts`):
  - Probing and direct ingestion of `/llms-full.txt` and markdown URL extraction from `/llms.txt`.
- Discovery Engine (`packages/crawler/src/discovery.ts`):
  - `robots.txt` and `sitemap.xml` parser with route priority scoring (`/pricing`, `/about`, `/products`).
- Dual-Tier Fetcher (`packages/crawler/src/fetcher.ts`):
  - Tier 1 HTTP fetch via Cheerio with client-side SPA shell detection.
  - Tier 2 Playwright headless browser fallback.
- Content Extractor (`packages/crawler/src/extractor.ts`):
  - Mozilla Readability + Cheerio boilerplate stripping (nav, footers, cookie banners) and category inference.
- Brand Extractor (`packages/crawler/src/brand.ts`):
  - Favicon, OpenGraph logo, primary/secondary colors, and typography token extraction into `BrandTokens`.
- Full Crawler Orchestrator (`packages/crawler/src/index.ts`):
  - `CompanyCrawler` coordinating SSRF -> LLMs.txt -> Sitemap -> Priority Crawl Loop -> Brand Extraction.
- Automated Test Suite (`packages/crawler/test-crawler.ts`):
  - All 5 test suites passed: SSRF protection, Storage Provider, LLMs.txt parsing, Content cleaning, and Brand token extraction.
- Turborepo Build:
  - All 8 packages compiled successfully with zero errors.

---

## Milestone 5: End-to-End Ingestion Pipeline (API, Queue, Worker & Database Persistence)
**Date**: 2026-09-11  
**Status**: Completed  

### Deliverables:
1. **Worker Package Integration (`workers/worker`)**:
   - Added `@ag-ui/crawler` workspace dependency.
   - Implemented `crawlWorker` processor handling `QUEUE_NAMES.CRAWL`.
   - Automated state transitions: updates snapshot to `CRAWLING` -> executes `CompanyCrawler.crawl()` -> updates snapshot to `READY` (or `FAILED`).
   - Database writes via Drizzle ORM:
     - Upserts extracted brand tokens into `brands` table (`tokens`, `logoUrl`).
     - Bulk inserts crawled pages and markdown into `documents` table (`url`, `title`, `category`, `content`).
2. **Elysia API Companies Routes (`apps/api`)**:
   - `POST /api/companies`: Validates URL format and executes SSRF safe validation; provisions `companies` and `company_snapshots` (status `QUEUED`); pushes job to BullMQ `crawlQueue`; returns `201 Created`.
   - `GET /api/companies`: Lists all companies with their latest snapshot status and brand metadata.
   - `GET /api/companies/:id`: Fetches company metadata, snapshot history, and brand tokens.
   - `GET /api/companies/:id/documents`: Lists all ingested documents and previews for the latest snapshot.
3. **Database & ORM Enhancements (`packages/database`)**:
   - Exported all `drizzle-orm` operators (`eq`, `desc`, `and`, `or`, `sql`) from package root for seamless consumer consumption.
---

## Milestone 6: Knowledge Chunking & Vector Embeddings Pipeline
**Date**: 2026-09-11  
**Status**: Completed  

### Deliverables:
1. **Semantic Markdown Chunker (`packages/shared/src/chunker.ts`)**:
   - Developed heading-aware section parser (`#`, `##`, `###`).
   - Implemented 1800-character target window (~450 tokens) with 250-character sliding overlap.
   - Prepends breadcrumbs to each chunk: `[Document: {title} | Section: {heading}]`.
2. **OpenAI Embedding Generator (`packages/shared/src/embeddings.ts`)**:
   - Integrated OpenAI `text-embedding-3-small` generating 1536-dimensional vectors.
   - Implemented batching (64 items per call) with unit-normalized fallback for offline testing.
3. **Deterministic Fact Extractor (`packages/shared/src/facts.ts`)**:
   - Regex and heuristic extractor for commercial attributes: `domain`, `contact_email`, `github_repository`, `twitter_handle`, `pricing_tier`, `office_location`.
4. **Monorepo Root Env Resolution (`packages/shared/src/env.ts` & `turbo.json`)**:
   - Created `autoLoadMonorepoEnv()` traversing parent directories to ensure root `.env` is inherited across all workspace subpackages.
   - Added `globalEnv` array in `turbo.json` declaring AI and database keys.
5. **Worker Orchestration (`workers/worker/src/index.ts`)**:
   - Chained execution: `CRAWLING` -> Ingest docs & brand -> `PROCESSING` -> Semantic chunking -> Batch 1536-dim embedding generation -> Bulk insert to `chunks` table -> Fact extraction -> Insert into `facts` table -> `READY`.
6. **API Endpoints (`apps/api/src/routes/companies.ts`)**:
   - `GET /api/companies/:id/chunks`: Lists generated vector chunks, character counts, and previews.
   - `GET /api/companies/:id/facts`: Returns structured deterministic facts for the company.
7. **End-to-End Verification**:
   - All 8 packages compiled cleanly with Turborepo (`8 successful, 8 total`).
   - Crawled and processed `https://resend.com` into 17 chunks and 2 facts per snapshot.
   - Executed live vector cosine similarity search with pgvector: query `"How do I send emails using React Email components?"` achieved 60.52% cosine similarity matching exact React Email code blocks.


