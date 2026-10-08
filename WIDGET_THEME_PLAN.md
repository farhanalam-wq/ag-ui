# Per-Company Embed Theming — Implementation Plan

Source of truth: company A's stylesheet themes company A's embed only.
Isolation is structural: `GET /api/embed/:key/config` resolves opaque widget
key → `companyId` → that company's `brands` row (`apps/api/src/routes/embed.ts`).
No key, no theme. Revoked key → 410.

**Fonts are out of scope everywhere** (licensing + availability). The embed
keeps its system font stack permanently.

## Phase 0 — Theme contract + guards (shared)

New `packages/shared/src/widget-theme.ts`:

- `mapBrandToWidgetTheme(tokens)` →
  `{ primary, secondary, radius, surface, text, logoUrl }`.
  Sanitized: hex-only colors (`/^#([0-9a-f]{3}|[0-9a-f]{6})$/i`),
  radius allowlist (`px|rem|%`), `https:` logos only. Anything else →
  safe defaults. Tokens originate from scraped third-party CSS — never
  applied raw.
- `passesAA(fg, bg)` — WCAG relative-luminance contrast. `surface`/`text`
  apply only when text-on-surface ≥ 4.5 **and** primary-on-surface ≥ 3;
  otherwise neutral shell, brand confined to header band + launcher.
- Unit tests: inglobal fixtures (`#9b6a45`, `3px`) + adversarial
  (`javascript:` logo, `expression()` radius, non-hex colors).

## Phase 1 — Apply in both widget clients (no API change)

`/:key/config` already ships full `tokens`; nothing new to fetch.

- Inner `apps/web/app/embed/[key]/page.tsx`: replace the single
  `--brand-primary` set with full-dict apply via `applyWidgetTheme(el, theme)`.
  primary → send CTA, user bubbles, links, focus rings; secondary → chips,
  hovers, avatar ring; radius → bubbles/cards/inputs
  (`rounded-[var(--brand-radius)]`); gated surface/text; logo avatar with
  initial-letter fallback. `?color=` / `?title=` overrides keep precedence.
- Outer `apps/web/public/embed.js`: orb background = primary, hover =
  secondary, orb radius, orb logo mark w/ fallback. Vanilla JS, no deps.
- `apps/web/tailwind.config.ts` + `globals.css`: add `--brand-surface` /
  `--brand-text` vars with neutral defaults (primary/secondary/radius
  already var-driven).

## Phase 2 — API enrichment (`apps/api/src/routes/embed.ts`)

- `/:key/config` gains `theme` (server-sanitized via the Phase 0 helper) +
  `themeVersion` (`stylesheetId` + snapshot version). `brand` stays for compat.
- `EmbedConfig` extended; clients skip re-apply when version unchanged.

## Phase 3 — Live re-theme

- Inner page listens to the existing `brand` SSE event on `/:key/chat` and
  re-applies when `themeVersion` moves (no reload). Orb re-fetches config on
  open when cached copy is stale (> 5 min).

## Phase 4 — Depth (after stylesheet Phase 2)

- Shadow scale → launcher/card elevation; theme version pinned to snapshot
  version so theme follows knowledge rollback.

## Verification (per phase)

- inglobal control render (primary `#9b6a45`, radius `3px`, secondary).
- Synthetic low-contrast fixture → neutral-shell assertion.
- Isolation: key A ⇒ only A theme; revoked ⇒ 410.
- XSS fixtures → sanitized defaults. Per-company screenshots.
