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
**Status**: Completed ✅  

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


