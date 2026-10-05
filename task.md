# Feature Branch — Evaluated Tasks Reference

Source: full `feature` (7a06809) vs `main` (6e78193) + `origin/main` (1569532) analysis.
Merge status: NO conflicts — fast-forward only. Local `main` is 4 commits stale.
Scope: 9 commits, 26 files, +1310/−348.

> Status (2026-10-05): ALL PHASES IMPLEMENTED on `feature` working tree.
> Verified: `turbo run build --force` 9/9 green, root `tsc --noEmit` clean,
> crawler suite 9/9 green. Known pre-existing (not introduced here):
> `apps/api` tsc fails with TS6059 rootDir config errors (api build script is a no-op echo),
> `bun build` warns on playwright `chromium-bidi` optional deps.
> One judgment call vs the plan below: 2.3 keeps nearest-wins merge *within* the repo
> (stops at repo root) instead of breaking after the first `.env`, so a partial subpackage
> `.env` can never shadow root secrets.

---

## Phase 0 — Verify build (unblocks everything)

- [ ] 0.1 Run `bun install` (turndown, @types/turndown, tsc all missing — node_modules has 6 dirs).
- [ ] 0.2 Per-package `tsc --noEmit` + `turbo run build` + crawler tests (`packages/crawler/test-crawler.ts`).
- [ ] 0.3 Move `@types/turndown` from `dependencies` to `devDependencies` (`packages/crawler/package.json`).

## Phase 1 — Security

- [ ] 1.1 CSS injection via font interpolation (MED-HIGH)
  - Where: `packages/crawler/src/brand.ts:409-416` (GF link, unsanitized),
    `:420-427` (@import regex allows `;{}`), → `:476-477,492-493` →
    `apps/web/hooks/use-company-chat.ts:151-158`, `apps/web/public/embed.js:139-146`.
  - Safe as-is: colors (`parseColorToHex :81-110`), radius breakout (`:201` excludes `;!}`),
    CSS font-family path (`:431` allowlisted).
  - Fix: `sanitizeFontName()` allowlist `^[A-Za-z][A-Za-z0-9 \-]{0,48}$` at 414-415, 424-425;
    `sanitizeRadius()` allowlist at 443-444; filter `cssVariables` keys to
    `^--brand-[a-z-]+$` (cap 30 / 200 chars) in `use-company-chat.ts:162-167`;
    strip `@import|url(|expression|behavior|javascript:` before `textContent` assignment.
  - Tests: GF-link breakout payload → sanitized; benign font preserved.

- [ ] 1.2 Voice webhook has no per-call binding (HIGH)
  - Where: `apps/api/src/routes/voice.ts:17,20,197-208` writes `roomCompanyMap` +
    Redis `voice:room:*`, zero reads (verified by grep). `apps/api/src/routes/voice-tool.ts:34-47`
    shared secret only; `:110-122` trusts body `company_id`; schema `:183-186` has no room field.
  - Fix: add `room_name` to tool schema; after auth resolve
    `roomCompanyMap.get(room) ?? redis.get('voice:room:'+room)`; 403 on mismatch, 409 on unknown.
    Export lookup from `voice.ts` or move to `@ag-ui/database`. Update VoiceKit tool to send `room_name`.
  - Tests: room mismatch → 403; unknown room → 409.

- [ ] 1.3 Rate-limit IP spoofing + fail-open (MEDIUM)
  - Where: `getClientIp` in `voice.ts:22-28`, `voice-tool.ts:16-22` (leftmost XFF trusted);
    `packages/database/src/rate-limit.ts:15-18` (bucket), `:59,66-67` (fail-open).
  - Fix: rightmost XFF hop, only trust XFF when `TRUSTED_PROXY=1` else socket IP/`unknown`;
    fail-closed or alert for `voice-tool` scope.

## Phase 2 — Correctness

- [ ] 2.1 Markdown extractor migration (HIGH, operational)
  - Where: `packages/crawler/src/extractor.ts:71-79` (Readability→turndown), `:96-108` (fallback→turndown).
    Stored via `ingest-cli.ts:1145`. Old snapshots stay plaintext → mixed-format vector store.
  - Fix: canonical = Markdown; full re-ingest with snapshot version bump; verify `packBatches`
    token budget vs markup inflation (or embed stripped variant, store Markdown for display).
  - Gap: `stripToSpeechSafe` (`voice-tool.ts:49-60`) strips `|*_#>\`` but NOT `[t](u)` or ``` fences →
    URLs/fence tags spoken. Add link/fence/heading rules.

- [ ] 2.2 Qdrant dimension inferred from data (MEDIUM)
  - Where: `packages/database/src/qdrant.ts:126-127` passes `points[0].vector.length` into
    `ensureQdrantCollection(:67-70)`, vs frozen 1536 contract (`:4-10`). Index errors `:101-107` swallowed.
  - Fix: `EMBEDDING_DIMS = 1536` constant; throw on any length mismatch (existing throw path marks
    snapshot FAILED); check index-creation responses, log non-OK.

- [ ] 2.3 `.env` discovery overshoot + duplicated resolver (MEDIUM)
  - Where: `packages/shared/src/env.ts:6-34` walks 5 levels, no break, merges every ancestor `.env`;
    `:24` skips empty values; auto-runs `:37` + `server.ts:4-7`. `llm.ts:27-58` duplicates scan,
    mutates `process.env:46`.
  - Fix: stop at repo root (workspaces/`package.json`/`.git`), break after first `.env`;
    `resolveOpenAIKey` calls `autoLoadMonorepoEnv()` then reads env — no I/O, no mutation.

## Phase 3 — Hygiene / docs

- [ ] 3.1 `any`-escapes + never-validated schema (LOW-MED)
  - Where: `apps/api/src/routes/crawler.ts:285`, `ingest-cli.ts:1110,1127-1131`,
    `use-company-chat.ts:148`. Grep: zero `BrandTokensSchema.parse/safeParse` call sites
    (`packages/contracts/src/brand.ts:3-23` all-new-fields-optional → compatible but unenforced).
  - Fix: type the three sites; add `normalizeTokens()` for flat-vs-nested; one `safeParse` gate
    on ingest write + one on API read (log-and-fallback).

- [ ] 3.2 Fallback brand theme flip (LOW — needs product decision)
  - Where: `ingest-cli.ts:1117-1122` dark (`#09090b`/`#fafafa`) → light (`#ffffff`/`#09090b` + `theme:"light"`).
  - Fix: confirm intentional or restore dark / set `"auto"`.

- [ ] 3.3 Documentation drift
  - `SETUP.md`: root `tsconfig.json` mislabeled "Shared base" (that's `tsconfig.base.json`); documents
    `voice:room:*` "per-call isolation" as active (it isn't — see 1.2); zero mention of turndown /
    Markdown change / re-ingest requirement / Qdrant self-heal; `VOICEKIT_API_URL/_KEY/_ASSISTANT_ID`
    never listed (only `VOICE_TOOL_SECRET` ×1).
  - Fix all of the above; drop the unenforced isolation claim until 1.2 lands.

## Non-issues (evaluated, no action)

- Root `tsconfig.json` dropping `references` → correct (no package sets `composite: true`).
- `packages/crawler/tsconfig.json` dropping `rootDir` → inert (`tsc --noEmit`, `main` = `./src/index.ts`).
- `BrandTokensSchema` additions → all `.optional()`, existing `jsonb` rows validate.
- `resolveOpenAIKey` returning `""` → both call sites (`llm.ts:71`, `embeddings.ts:185`) use `!apiKey`; no behavior change.
- Boot log `OPENAI_API_KEY configured: ${!!...}` (`server.ts:51`) → leaks nothing.
- `.gitignore` change → inert (plan file never tracked).
- `validateSafeUrl` IS applied to stylesheet fetches (`brand.ts:173`); blocked sheets fail silently via `allSettled`.
