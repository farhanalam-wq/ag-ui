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

