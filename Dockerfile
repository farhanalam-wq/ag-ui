# syntax=docker/dockerfile:1
#
# Multi-stage image for the ag-ui monorepo (TASKS: docker deployment).
# Targets:
#   base   — repo source + bun install (shared by all services + migrations)
#   api    — Elysia API on Bun (apps/api), port 3001
#   web    — Next.js app (apps/web), port 3000 (NEXT_PUBLIC_* are build args)
#   worker — BullMQ crawl/enrich worker; includes Playwright Chromium
#
# Redis and Qdrant are NOT bundled: point REDIS_URL / QDRANT_URL at your
# managed servers via .env. Postgres+pgvector ships in docker-compose.yml.

ARG BUN_VERSION=1.4.2

# ------------------------------------------------------------- base -----
FROM oven/bun:${BUN_VERSION} AS base
WORKDIR /app

# Manifests first so the install layer only rebuilds when a package.json or
# the lockfile changes — source/doc edits never re-run `bun install`.
# (Workspace globs resolve from these manifests; bun links @ag-ui/* into
# node_modules without the source present.)
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/analytics/package.json packages/analytics/
COPY packages/brand/package.json packages/brand/
COPY packages/contracts/package.json packages/contracts/
COPY packages/crawler/package.json packages/crawler/
COPY packages/database/package.json packages/database/
COPY packages/extract/package.json packages/extract/
COPY packages/genui/package.json packages/genui/
COPY packages/ingest/package.json packages/ingest/
COPY packages/queues/package.json packages/queues/
COPY packages/shared/package.json packages/shared/
COPY workers/worker/package.json workers/worker/
# Retry once: the install step is the longest in the image, and a single
# transient DNS failure (seen in practice) would otherwise redo ~10 min.
RUN bun install --frozen-lockfile || { sleep 10; bun install --frozen-lockfile; }

# Whole repo source (pruned by .dockerignore), on top of the cached install.
COPY . .

# -------------------------------------------------------------- web -----
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
# they must be build args here — runtime env cannot change them.
FROM base AS web-build
ARG NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_LIVEKIT_URL=
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production
RUN cd apps/web && bun run build

# --------------------------------------------------------------- web ----
FROM base AS web
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT_WEB=3000
COPY --from=web-build /app/apps/web/.next /app/apps/web/.next
WORKDIR /app/apps/web
# next/image optimization writes its cache under .next/cache at runtime.
RUN chown -R bun:bun /app/apps/web/.next
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]

# --------------------------------------------------------------- api ----
FROM base AS api
ENV NODE_ENV=production
# Local disk storage (STORAGE_PROVIDER=local default) writes here; mount a
# volume on /app/storage to persist uploads across container replacement.
RUN mkdir -p /app/storage && chown -R bun:bun /app/storage
WORKDIR /app
USER bun
EXPOSE 3001
# Liveness: any HTTP response (even 404) proves the server is up — the
# route policy has no unauthenticated health endpoint by design.
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD bun -e "await fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/');process.exit(0)" || exit 1
CMD ["bun", "apps/api/src/server.ts"]

# ------------------------------------------------------------ worker ----
# Same code as base, plus Playwright Chromium + system libs (the crawl
# worker uses the browser fallback for JS-only pages).
FROM base AS worker
ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/app/.pw-browsers
RUN bunx playwright install --with-deps chromium \
  && chown -R bun:bun /app/.pw-browsers
RUN mkdir -p /app/storage && chown -R bun:bun /app/storage
WORKDIR /app
USER bun
CMD ["bun", "workers/worker/src/index.ts"]
