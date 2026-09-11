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
---

## Milestone 7: Hybrid Retrieval & Streaming SSE Chat Endpoint with Brand-Adaptive GenUI Triggering
**Date**: 2026-09-11  
**Status**: Completed  

### Deliverables:
1. **Interactive Map Schema Expansion (`packages/contracts/src/visual-spec.ts`)**:
   - Extended `VisualSpecSchema` union with the `map` component type.
   - Defined `MapMarkerSchema` with `label`, `address`, `lat`, and `lng`.
2. **Hybrid Context Retrieval Engine (`packages/database/src/retrieval.ts`)**:
   - Implemented `retrieveCompanyContext(companyId, query)` combining:
     - Deterministic SQL facts query from `facts` table.
     - Semantic vector search using OpenAI `text-embedding-3-small` (1536-dim) and pgvector cosine similarity (`1 - (chunks.embedding <=> queryEmbedding)`).
     - Brand token resolution from `brands` table (`primaryColor`, `fontFamily`, `style`).
     - Evidence citation compiler and structured prompt builder.
3. **OpenAI Multi-Tool Generator & GenUI Parser (`packages/shared/src/llm.ts`)**:
   - Implemented `streamChatCompletionGenerator` yielding real-time text `delta`, parsed `visual` specs, and `done` events.
   - Built index-aware multi-tool accumulator (`toolCallsByIndex`) to independently assemble concurrent tool calls without corrupted JSON concatenations.
   - Emits structured `VisualSpec` objects (`pricing`, `stats`, `products`, `timeline`, `comparison`, `map`).
4. **Native Elysia SSE Streaming Routes (`apps/api/src/routes/chat.ts`)**:
   - `POST /api/companies/:id/chat`: Streaming SSE endpoint emitting events (`status`, `brand`, `evidence`, `delta`, `visual`, `done`).
   - `GET /api/companies/:id/conversations`: Lists all historical conversation threads for a company.
   - `GET /api/conversations/:id/messages`: Returns all multi-turn messages and persisted visual specs for a session.
5. **PostgreSQL Multi-Turn & GenUI Persistence**:
   - Automatic conversation and message row creation in `conversations` and `messages` tables.
   - Stores user questions and assistant answers alongside evidence citations and JSON `visualSpec`.
6. **End-to-End Live Verification**:
   - Tested live query `"What are the core developer products and features provided by Resend?"` against `http://localhost:3001/api/companies/:id/chat`.
   - Verified real-time delta tokens streamed live directly from OpenAI `gpt-4o-mini`.
   - Verified GenUI visual component triggered with `type: "products"` and 7 structured product items.
   - Verified full session persistence in PostgreSQL with `visualSpec: true` and 7 evidence citations.
   - Strictly enforced zero emojis across all outputs, logs, and prompt guidelines.

---

## Milestone 8: Brand-Adaptive Next.js 15 Frontend & Full GenUI Component Suite (Phase 5)
**Status**: In Progress  
**Target Package**: `apps/web`

### Completed Deliverables:
1. **Static Web UI & PromptInput Component Layout**:
   - Implemented `@ai-elements/prompt-input` conforming component specification in `apps/web/components/ai-elements/prompt-input.tsx`.
   - **Hidden Irrelevant Options**: File upload dropzone, image attachments, audio recorder, and model selector hidden in favor of clean enterprise Q&A interface.
   - **Exposed Relevant Options**: Mode badge (`Hybrid pgvector`), company scope badge (`Target: domain`), dynamic placeholder, and Enter-to-submit keybinding.
   - **Company Selector**: Seamlessly toggles scope between indexed companies (`resend.com`, `anthropic.com`, `redhat.com`, `stripe.com`) with real-time brand color adaptation.
   - **Suggested Query Chips**: Clicking any chip instantly populates the PromptInput textarea.
   - **Zero Emojis Enforced & Phosphor Icons**: Strictly `@phosphor-icons/react` icons and crisp typography throughout (zero Lucide icons or emojis).
   - **Production Build Validated**: `next build` static export tested and passing (4/4 pages).

### Planned Deliverables:
1. **Dynamic Brand Theming Engine**:
   - Injects company brand tokens into CSS custom properties (`--brand-primary`, `--brand-secondary`, `--brand-style`, `--brand-radius`).
   - Seamless live theme adaptation across companies (e.g. Stripe, Red Hat, Anthropic, Resend).
2. **Real-Time Streaming Chat Canvas**:
   - Client-side SSE stream reader consuming `POST /api/companies/:id/chat`.
   - Real-time token typing display with stage badges (`retrieving`, `synthesizing`).
   - **Collapsible Evidence Drawer**: Interactive citation sidebar citing document titles, exact URLs, chunk excerpts, and relevance percentages.
3. **Comprehensive Generative UI Component Suite**:
   - **3D CardStack / ProductList**: Tactile, swipeable card stack (Framer Motion) with media previews, tags, descriptions, and action links.
   - **PricingTable**: Responsive tier cards with recommended plan highlight, billing toggles, and feature checklists.
   - **StatsGrid**: Commercial metrics cards with values, trend indicators, and labels.
   - **InteractiveMap**: OpenStreetMap view with custom company pins and "Get Directions" distance calculation.
   - **Timeline**: Milestone roadmap component with chronological points and status badges.
   - **ComparisonTable**: Side-by-side feature comparison matrix.
   - **Interactive Action Forms**:
     - `ContactForm`: Lead capture / inquiry submission with instant validation.
     - `MeetingScheduler`: Demo / call booking widget with date/time selection.
4. **Dual Consumption Models**:
   - **Full-Screen Immersive Canvas (`/`)**: Comprehensive intelligence workspace with company switcher, document preview drawer, and multi-turn chat.
   - **Embeddable Floating Widget (`/embed` + `public/widget.js`)**: Isolated zero-collision iframe widget with expandable launcher orb for third-party websites.

---

## Milestone 9: Real-Time Web Search Fallback & Deep Crawling (Phase 6)
**Status**: Planned  
**Target Packages**: `packages/crawler`, `packages/database`, `apps/api`

### Planned Deliverables:
1. **Live Search Engine Integration**:
   - Internet & news search fallback (SearXNG / web search API) when documentation chunks lack real-time context.
2. **Deep Enterprise Crawling**:
   - Configurable crawl depth controls (20, 50, 100 pages) for large multi-product corporate domains.

---

## Milestone 10: Real-Time Voice AI & LiveKit Audio Stream (Phase 7)
**Status**: Planned  
**Target Packages**: `packages/voice`, `apps/api`, `apps/web`

### Planned Deliverables:
1. **LiveKit WebRTC Audio Channel**:
   - Bi-directional audio tracks with low latency (<500ms).
2. **Fast Speech-to-Text (STT) & Text-to-Speech (TTS)**:
   - Real-time streaming transcription and synchronized voice synthesis.
3. **Voice Activity Detection (VAD) & Ultra-Fast Barge-In**:
   - Silero VAD turn detection with <300ms interruption handling.
4. **Floating Voice Dock**:
   - Interactive audio frequency visualizer, microphone controls, and live subtitle streamer.
