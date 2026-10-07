# ag-ui / Vaani — DESIGN.md
> Single Source of Truth for Visuals, UI & UX.
> For humans and AI agents. If it conflicts with ad-hoc code, this file wins.

**Design Read:** Internal B2B intelligence console for technical founders, marketers, and ops, with a Linear-clean minimalist language, leaning toward shadcn/ui + Tailwind + Geist + restrained motion + insight-first data-viz.

**Dials:** `DESIGN_VARIANCE 5 / MOTION_INTENSITY 3 / VISUAL_DENSITY 7`
- Variance 5: offset, not artsy. Left-aligned headers, asymmetric 2:1 splits for viz, never centered marketing heroes inside the app.
- Motion 3: static + micro-feedback only. No scroll-hijack, no marquees, no perpetual loops.
- Density 7: cockpit. Tight 8/12/16 rhythm, 1px dividers over cards, mono for all numbers.

---

## 1. Principles (non-negotiable)

1. **Prime, pristine, no cognitive overload.** One page = one job = one primary action. Everything else is progressive disclosure (tabs, drawers, collapsible).
2. **Intention visible.** Every element answers "why is this here?" Headers carry verb + context. Charts carry insight captions. Empty states carry next action. No decorative dividers, gradient washes, or icon-for-decoration.
3. **Insight over decoration.** Analytics must produce a takeaway in <5 seconds. KPI + delta + sparkline + 1-line insight. Never a naked number.
4. **Consistency over novelty.** Reuse 4 page archetypes (Section 7). Do not invent a new layout per route.
5. **Quiet craft.** Neutral Zinc base, one Electric Blue accent, generous whitespace, hairline borders. Boldness lives in data clarity, not in chrome.

Anti-goal: run-of-the-mill AI slop — purple glows, centered heroes, 3-equal-cards, Inter+slate default, gradient text, emoji icons, fake div-screenshots.

---

## 2. Stack & Source of Truth

- Framework: Next.js 15 App Router, React 19, RSC by default. Interactivity isolated to `"use client"` leaves.
- Styling: Tailwind CSS 3.4 (`apps/web/tailwind.config.ts`), CSS variables in `apps/web/app/globals.css` as single source (`:root` = Light, `.dark` = Dark). Color theming via CSS vars ONLY (`bg-card text-foreground border-border`). `dark:` variant allowed ONLY for non-color tweaks (e.g. `dark:backdrop-blur-md`, layout). Never `dark:bg-gray-800 / dark:text-white` for color — use `bg-card / text-foreground`. Theme via `next-themes` `ThemeProvider` + `ModeToggle` in shell header. Ship intent: `enableSystem + defaultTheme="system"` with persisted override (current `class="dark"` hard-lock in `layout.tsx` is dev-only, remove before ship). One page = one theme lock — sections never invert mid-scroll.
- Components: shadcn/ui is PRIMARY (Zinc, CSS variables) + Radix primitives in `apps/web/components/ui/`. ai-elements is PRIMARY for AI surfaces in `@/components/ai-elements/`. Rule: if shadcn or ai-elements has it, use it — never hand-roll. You own the code (copy-paste distribution) — never ship default state unstyled. Run `bunx --bun shadcn@latest` / `bunx --bun ai-elements@latest` per packageManager `bun@1.4.2`; check `components.json` aliases (`@/components`, `@/lib/utils`) and `apps/web/package.json` before import.
- State: Zustand (`apps/web/stores/`), `useState` for local only. Never `useState` for pointer/scroll physics — use `useMotionValue` if needed (rare here).
- Icons: `@phosphor-icons/react` ONLY for new code. `lucide-react@1.45 + @thesvg/icons` in `apps/web/package.json` are legacy — do not import in new files; replace on touch with Phosphor equivalent (`Search → MagnifyingGlass`, etc). Keep one weight per hierarchy (`regular 1.5` UI, `bold 2.0` active nav only), sizes `16/20/24`, `aria-hidden` decorative / `aria-label+Tooltip` standalone, target ≥44px.
- Fonts: `next/font` self-hosted `Geist Sans + Geist Mono`, `font-display: swap`. Install delta (not yet in `package.json`): `bun add geist` then `import { GeistSans } from 'geist/font/sans'`. Fallbacks `Inter Tight + JetBrains Mono`. Never `<link>` Google Fonts. Body `font-sans`, all numbers `font-mono tabular-nums`.

### 2.1 Token hierarchy (mandatory)

```
Primitive (raw) → Semantic (purpose) → Component (usage)
```

**Rule:** No raw hex / no raw Tailwind palette (`bg-blue-500`, `text-slate-500`) in `app/**/page.tsx` or `components/`. Always reference semantic token or Tailwind semantic alias (`bg-primary`, `text-muted-foreground`, `bg-card border-border`, `var(--chart-1)`).

Source today: `apps/web/app/globals.css` `:root` = Light, `.dark` = Dark. Future: `apps/web/tokens/design-tokens.json` → `apps/web/app/tokens.css` → mapped in `tailwind.config.ts`. Do not create a second token file until that path exists.

Copy-paste starter (HSL for opacity control, per `design-system` skill):
```css
:root {
  --background: 0 0% 98%; --foreground: 240 10% 3.9%;
  --card: 0 0% 100%; --card-foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%; --muted-foreground: 240 3.8% 35%;
  --border: 220 13% 88%; --input: 220 13% 82%; --ring: 221 83% 53%;
  --brand-600: 221 83% 53%; --chart-1: 224 86% 51%; --chart-2: 160 84% 39%;
  --chart-3: 38 92% 50%; --chart-4: 258 90% 66%; --chart-5: 189 94% 43%;
}
.dark {
  --background: 240 10% 3.9%; --foreground: 0 0% 98%;
  --card: 240 10% 6%; --card-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%; --muted-foreground: 240 5% 64.9%;
  --border: 0 0% 100% / 0.1; --input: 0 0% 100% / 0.15; --ring: 217 91% 60%;
  --brand-500: 217 91% 60%;
}
```
Tailwind maps `background/foreground/card/muted/border/input/ring/brand/chart-*` to `hsl(var(--x))`. Add `chart-1..8` to `tailwind.config.ts` once, never per page.

Validate (must be empty outside tokens):
```bash
grep -rn "#[0-9a-fA-F]\\{6\\}" apps/web/app apps/web/components --include="*.tsx" | grep -v tokens
grep -rn "bg-blue-500\\|text-slate-500\\|bg-gray-800" apps/web/app apps/web/components --include="*.tsx"
```

---

## 3. Color System

Base: Zinc neutrals. Accent: Electric Blue. Status hues are reserved — never use them for brand decoration.

### 3.1 Primitives

| Token | Light | Dark | Use |
|---|---|---|---|
| `--zinc-50/950` | `#FAFAFA` / `#09090B` | same | app bg / deepest surface |
| `--brand-600` | `#2563EB` | `#3B82F6` | primary action, links, active chart series |
| `--brand-500` | `#3B82F6` | `#60A5FA` | hover, secondary series |
| `--emerald-500` | `#10B981` | `#34D399` | positive delta, success, converted |
| `--amber-500` | `#F59E0B` | `#FBBF24` | blindspot, warning, needs-review |
| `--rose-500` | `#F43F5E` | `#FB7185` | error, destructive, churn |
| `--violet-500` | `#8B5CF6` | `#A78BFA` | intent / AI-derived only, sparing |

No pure `#000000` / `#FFFFFF`. Off-black `zinc-950`, off-white `zinc-50`.

### 3.2 Semantic (Light / Dark — both first-class)

> Light is not an inverted Dark. Both are designed. Assume ~50% of users live in Light (daytime ops, bright offices). Design Light for paper-clarity, Dark for focus-calm. Same information, same hierarchy, same accent — different expression of surface and depth.

| Semantic | Light (`:root`) | Dark (`.dark`) | Contrast / Notes |
|---|---|---|---|
| `background` | `zinc-50 #FAFAFA` | `zinc-950 #09090B` | App canvas. Content must separate via `surface` + `border-subtle`, not transparency alone. |
| `surface` / `card` | `#FFFFFF` + `border-zinc-200` | `zinc-900/60` + `border-white/10` | Light: solid white, border mandatory. Dark: translucent allowed + inner highlight. Never transparent-white on `zinc-50` — hierarchy collapses. |
| `surface-elevated` | `#FFFFFF` + border + `0_1px_2px` shadow | `zinc-900` + `border-white/10` + `inset_0_1px_0_white/6` | Popover, drawer, dropdown, tooltip. Light tooltip = white + border, Dark tooltip = zinc-900. |
| `text-1` | `zinc-950` | `zinc-50` | Headings, KPI values. Target ≥7:1 in both. |
| `text-2` | `zinc-600` | `zinc-400` | Body, labels. Mandatory ≥4.5:1 in both. Light `zinc-500` for body = fail. |
| `text-3` | `zinc-500` | `zinc-500` | Captions, timestamps, axis ticks, helper. Never for body or CTA. Icon meaningful state needs ≥3:1 against adjacent bg in both. |
| `border-subtle` | `zinc-200 #E4E4E7` | `white/10` | Must be visible in both. Light dividers disappearing on white = fail. Dark borders disappearing on zinc-950 = fail. |
| `input-bg` / `input-border` | `white` / `zinc-300` | `zinc-900` / `white/15` | Light inputs need stronger border than cards (`300` vs `200`) to read as fields. Placeholder `zinc-400` Light / `zinc-500` Dark, still ≥4.5:1 for label+helper. |
| `accent` | `brand-600 #2563EB` | `brand-500 #3B82F6` | Single accent lock. Light uses deeper cut for contrast on white; Dark uses lighter cut for pop on black. |
| `accent-ink` | `#FFFFFF` on `brand-600` | `#09090B` or `#FFFFFF` per token | Verify ≥4.5:1. Light: white on `#2563EB` passes. Dark: check `brand-500` + ink combo, add `font-medium` if borderline. Focus ring `brand-600/30` Light / `brand-500/40` Dark. |

**Color Consistency Lock:** Once Electric Blue is the accent, every CTA, link, active nav, and primary chart series uses it. A rose CTA on one page + blue on another = fail. Status colors never substitute for accent.

### 3.3 Chart palette (ordered, colorblind-safe, dual-mode verified)

```
--chart-1: #2B62F5 (blue, primary series)
--chart-2: #10B981 (emerald)
--chart-3: #F59E0B (amber)
--chart-4: #8B5CF6 (violet, intent only)
--chart-5: #06B6D4 (cyan)
--chart-6: #F43F5E (rose, loss/error only)
--chart-7: #71717A (zinc, baseline/comparison)
--chart-8: #A1A1AA (zinc-light, context)
```

Max 4 series per chart. Baseline/comparison always zinc dashed. Positive emerald, negative rose — never invert.

Per-mode expression (same hue, different surround):
- Gridlines: Light `zinc-200`, Dark `white/10`. Axis ticks `text-3` mono 12px in both.
- Area fill: Light `accent/12 + stroke 2px`, Dark `accent/20 + stroke 2px` — Light needs less wash to stay crisp on white.
- Tooltip: Light `bg-white border-zinc-200 shadow-md`, Dark `bg-zinc-900 border-white/10`. Mono numbers in both.
- Donut center total: `text-1` in both. Legend `text-2` in both, never `text-3` for legend labels.

### 3.4 Light / Dark Parity Protocol (replaces dark-only thinking)

Per `ui-ux-pro-max` Light/Dark + `web-design-guidelines` + `ui-styling` theming:

- **Token-driven, never hardcoded.** All surfaces/text/icons/borders/charts via semantic tokens mapped per theme (`:root` ↔ `.dark`). No per-screen hex. No `bg-white dark:bg-gray-800` ad-hoc pairs — use `bg-card border-border-subtle`.
- **Surface readability:**
  - Light: cards `#FFF` on `zinc-50` MUST have `border-zinc-200` + `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`. Overly transparent surfaces that blur hierarchy = fail. Sticky table header `bg-white/85 backdrop-blur`, not translucent zinc.
  - Dark: cards `zinc-900/60` on `zinc-950` MUST have `border-white/10` + inner highlight. No pure-black shadows, no neon outer glows.
- **Text contrast:** Body `text-2` ≥4.5:1 in both modes. Test Light and Dark independently — never assume Dark values work in Light. Large display ≥3:1 minimum, body target AAA where possible.
- **Border/divider visibility:** Separators visible in both. Audit: Light dividers on white, Dark dividers on zinc-950, focus/disabled/hover states equally distinguishable in both. Defining states for one theme only = fail.
- **State parity:** Pressed/focused/disabled/selected/skeleton have explicit Light + Dark values. Focus ring always visible: Light `ring-2 ring-brand-600/30 + border-brand-600`, Dark `ring-brand-500/40`.
- **Scrim + modal legibility:** Measure composed result. Light: `black/40 + backdrop-blur-md` over white content still isolates drawer. Dark: `black/60 + backdrop-blur-md`. Reusing one opacity without checking real bg = fail.
- **No pure values:** No `#000000` / `#FFFFFF` as theme bg. Off-black `zinc-950`, off-white `zinc-50` / `#FFF` surface only.
- **Theme behavior:** Respect `prefers-color-scheme` via `enableSystem`. Manual `ModeToggle` persists override. Sidebar/header/main all swap together — never light sidebar + dark main.
- **Ship gate:** Open every archetype in both modes during dev. Never ship seen-in-one-mode-only. Screenshot Light + Dark for PageHeader, KPI row, one chart, one table, one drawer before marking done.

---

## 4. Typography

### 4.1 Families

| Role | Font | Fallback | Usage |
|---|---|---|---|
| UI / Display | `Geist Sans` | `Inter Tight, system-ui` | headlines, body, buttons, nav |
| Data / Mono | `Geist Mono` | `JetBrains Mono, ui-monospace` | KPI values, timestamps, event names, URLs, code, tables numerics |

One sans for headline + body. No serif in app (serif reserved for editorial/marketing only — dashboards with serif = fail). Banned defaults: `Inter` as sole default without tightening, `Fraunces` / `Instrument Serif`.

Load via `next/font`:
```tsx
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
// body: font-sans, numbers: font-mono tabular-nums
```

### 4.2 Scale (The Elements of Typographic Style, tight)

| Level | Size / Leading / Tracking | Weight | Use |
|---|---|---|---|
| `display` | `30/36 -0.02em` | 600 | page title only (`PageHeader`), max 1 per page |
| `h2` | `20/28 -0.01em` | 600 | section title |
| `h3` | `16/24 -0.005em` | 600 | card title, drawer title |
| `body` | `14/20 normal` | 400 | default UI text |
| `small` | `13/18 normal` | 400/500 | table cells, helper |
| `caption` | `12/16 normal` | 400/500 | timestamps, axis ticks, badges. `text-text-3` |
| `mono-num` | `tabular-nums font-mono` | 500/600 | all metrics, counts, latencies |

Rules:
- Line length <80ch, body `max-w-[65ch]`.
- Sentence case everywhere. No ALL-CAPS labels except `caption` eyebrows (max 1 per 3 sections).
- No single-word accent color/italic in headlines. Emphasis = same-family bold/italic only.
- Button labels 1–3 words, one line at desktop. No wrapping CTAs. One label per intent (`Publish` → toast `Published`).

---

## 5. Spacing, Shape, Elevation

### 5.1 Spacing rhythm (4/8 base)

```
4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
py-16–py-24 for sections, gap-4 cards, gap-2 input blocks
Page: max-w-[1400px] mx-auto px-4 md:px-6, main py-6
Telemetry grid: KPI gap-4, viz gap-4, table mt-6
```

### 5.2 Shape (pick once, lock it)

```
cards: rounded-xl (12px)
inputs: rounded-lg (8px)
chips/badges/pills: rounded-full
buttons: rounded-lg (8px) — NOT pill, to match inputs
drawer/modal: rounded-l-xl / rounded-xl
```

Mixed systems allowed only with documented rule above. Round buttons on square cards = fail.

### 5.3 Elevation (Light paper vs Dark depth)

- Light (paper-clarity for daytime Light users): `bg-white border-zinc-200` + `shadow-[0_1px_2px_rgba(16,24,40,0.05)]`. Borders do the separation, shadow is whisper. Never pure-black `rgba(0,0,0,.1)` blobs, never gradient washes. Table header `bg-white/85 backdrop-blur`, sidebar `bg-white`, header `bg-white/80 backdrop-blur-md`.
- Dark (focus-calm): `border-white/10` + `shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`. No outer neon glows. Sidebar `zinc-950`, header `zinc-950/80 backdrop-blur-md`.
- Cards only when elevation = hierarchy. Otherwise group with `border-t` / `divide-y` / whitespace. For density 7, prefer plain layout + 1px dividers over card boxes — especially in Light where 6 white cards on zinc-50 quickly reads as clutter; use dividers after 6.
- Light-specific trap: white cards on `zinc-50` with `border-transparent` or shadow-only = invisible hierarchy. If border is removed, elevation must increase — never remove both.

### 5.4 Z-index scale (never arbitrary `z-50`)

```
z-10: sticky table headers
z-30: app header (see StudioShell h-14)
z-40: sidebar overlay (mobile)
z-50: drawer / modal / popover / toast / grain
```

### 5.5 Breakpoints

`sm 640 / md 768 / lg 1024 / xl 1280 / 2xl 1536`. Multi-col above `md` collapses to single-col `w-full px-4 py-8` below. Declare mobile fallback in same component.

---

## 6. Iconography, Imagery, Motion

### 6.1 Icons (Phosphor only)

```tsx
import { ChartLine, Database, Microphone, Globe, Lightning } from '@phosphor-icons/react';
```

- Sizes as tokens: `sm 16 / md 20 / lg 24`. Stroke `1.5` (regular) for UI, `2.0` (bold) for active nav only. Never mix weights at same hierarchy.
- Decorative icons beside text: `aria-hidden="true"`. Standalone icon buttons: `aria-label` + tooltip.
- No emoji as structural icons. No hand-rolled SVG paths. Missing glyph → second Phosphor weight or `@radix-ui/react-icons`, never draw from scratch.
- Touch target ≥44×44. Expand `hitarea` when glyph is 16.

Common map: Overview `ChartLine`, Knowledge `Database`, Agents `Robot`, Persona `Palette`, Audition `FlaskConical`, Runtime `Code`, Website `Globe`, Agent `ChatCircle`, Intent `Crosshair`, Conversion `Target`, Radar `Radar`, Signals `Lightning`, Sessions `Clock`, Leads `Users`, Activity `ListChecks`, Errors `WarningCircle`, API `Key`, Billing `CreditCard`, Team `UserPlus`.

### 6.2 Imagery

App is data-product — no stock photos, no gradient blobs as hero. Visuals = charts, entity graphs, live previews. Entity avatars use initials + zinc bg, never colored gradients per user.

### 6.3 Motion tokens

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--dur-1: 130ms; /* menu, tooltip */
--dur-2: 180ms; /* collapsible, drawer */
--dur-3: 240ms; /* chart enter */
```

Animate `transform` + `opacity` only. Existing `menu-in / collapsible-down/up` in `globals.css:129-172` is canonical. Honor `prefers-reduced-motion: reduce` — collapse to static + disable `CRAWLING` pulse + chart enter animation. Honor `prefers-reduced-transparency` — header/drawer fall back to solid `bg-card` (no `backdrop-blur` / `bg-white/80`). No scroll-hijack, no marquee (max 0 per internal page), no infinite pulse on cards.

---

## 7. Layout & Information Architecture

### 7.1 Global shell (already built — do not redesign)

`apps/web/components/studio-shell.tsx:82-137` + `apps/web/components/sidebar/app-sidebar.tsx`:

```
[Sidebar 260px] [Inset: Header h-14 sticky + Breadcrumb + ModeToggle | Main scroll]
```

- Sidebar grouping per spec v3 §4 (Overview / Knowledge Foundry / Agent Orchestration / Persona Studio / Audition Lab / Client Runtime / Unified Telemetry / Demand Radar / Prospect Ledger / Operations / Settings). Keep labels verbatim — vocabulary is wayfinding.
- Header: `h-14`, `border-b`, `backdrop-blur-md`, `SidebarTrigger + Breadcrumb (text-xs) + ModeToggle`. No second nav line at desktop. Height cap 56px.
- Main: `flex-1 flex-col overflow-y-auto`, inner `max-w-[1400px] mx-auto px-4 md:px-6 py-6 w-full`.

### 7.2 Four page archetypes (use exclusively)

**A. Telemetry (Overview, Analytics/*, Intelligence/*)**
```
PageHeader [title + date-range + agent-select + primary action]
KPI row (4 max, grid-cols-2 xl:grid-cols-4)
Main split: Trend (col-span-2) + Breakdown (col-span-1)
Table + Drawer
```
**B. Studio (Experience/*, Knowledge/ingest, Integration/embed, Intelligence/signals)**
```
PageHeader
Split: Form (left 5 cols) + Live Preview (right 7 cols, sticky top-20)
Footer bar: Discard / Save + last-saved timestamp
```
**C. Ledger (Visitors/*, Knowledge/sources+snapshots, Operations/*, Settings/api+team)**
```
PageHeader + search/filter bar
Dense table (sticky header, mono numbers, row → drawer)
Right Drawer (transcript / diff / log / dossier), never modal for reading
```
**D. Lab (Playground, Knowledge/graph, Agents)**
```
PageHeader
Split: Canvas/Chat (left) + Inspector (right 380px: citations/chunks/latency or bindings)
```

New route? Pick nearest archetype. No new archetype without updating this file.

### 7.3 PageHeader spec (mandatory for every route)

```tsx
<div className="flex flex-wrap items-end justify-between gap-4">
  <div>
    <h1 className="text-[30px] leading-9 tracking-tight font-semibold">Website Analytics</h1>
    <p className="text-sm text-muted-foreground mt-1 max-w-[65ch}">Passive behavior from script. No extra tag needed.</p>
  </div>
  <div className="flex items-center gap-2">[DateRange][AgentSelect][PrimaryAction]</div>
</div>
```

- Title = plain verb, not system name. Sub = one line, ≤20 words, what + why.
- Controls right-aligned, wrap on mobile. One primary action max.

---

## 8. Data-Viz System (insight-first)

### 8.1 Library policy

| Need | Library | Why |
|---|---|---|
| KPI trend, area/bar/donut, funnel bars, latency p50/p95 | shadcn/ui Chart (Recharts) via `ChartContainer + ChartTooltip` | Composable, themed via `var(--chart-*)`, accessible, zero extra bundle |
| Intent Radar bubble/cluster, funnel flow, Entity Graph node-link, large series (>1k pts) | Apache ECharts via `echarts-for-react` + `useEChartsTheme()` wrapper reading CSS vars | Perf + clustering + force layout where Recharts janks |

One system per chart. No Nivo + Recharts + ECharts mixing on same page. Check `apps/web/package.json` before import — output install command if missing (`bun add recharts echarts echarts-for-react`).

Token-wired example (copy, don't invent colors):
```tsx
const config = {
  assisted: { label: "Assisted", color: "var(--chart-1)" },
  baseline: { label: "Baseline", color: "var(--chart-7)" },
} satisfies ChartConfig;
<ChartContainer config={config}>
  <AreaChart data={data}>
    <CartesianGrid stroke="var(--border)" vertical={false} />
    <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
    <ChartTooltip content={<ChartTooltipContent />} />
    <Area dataKey="assisted" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.12} strokeWidth={2} />
    <Line dataKey="baseline" stroke="var(--chart-7)" strokeDasharray="4 4" dot={false} />
  </AreaChart>
</ChartContainer>
```
// ECharts: pass `color: [cssVar('--chart-1'), ...]`, `backgroundColor: 'transparent'`, `textStyle: { color: cssVar('--muted-foreground') }`. No hardcoded hex in option.
Zero-data onboarding: empty chart area shows `Empty` (icon + "No data for range — Run crawl / Adjust dates") + preserves axes skeleton, never blank card.

### 8.2 Every chart ships with (dual-mode)

1. **Title + InsightCaption:** `Trend` + `Pricing Evaluation +32% WoW, driven by /pricing after widget open.` No caption = incomplete. Caption `text-2` Light + Dark, never `text-3` for insight.
2. **Axes / Grid:** mono `12px text-3`, `tabular-nums`, human units (`1.2k`, `3m 12s`, `p95 820ms`). Grid Light `zinc-200`, Dark `white/10`. No raw ms dumps. Light axis on white must still hit 4.5:1 — use `zinc-500`, not `zinc-300`.
3. **Legend:** top-right, `text-2`, max 4 items. Direct-label lines when only 1–2 series.
4. **States:** loading skeleton matching chart shape (Light `bg-zinc-200/70`, Dark `bg-white/10`, never spinner), empty with CTA, error inline with fix. Table fallback via `<details>` for SR + export.
5. **Tooltips:** elevated card per §3.4 (Light white, Dark zinc-900), mono numbers, `%` + absolute, timestamp + source. No truncation. Tooltip text `text-1`/`text-2`, never low-contrast `text-3` for values.

```tsx
<Card>
  <CardHeader><CardTitle className="text-base">Intent distribution</CardTitle>
  <p className="text-sm text-muted-foreground">Pricing Evaluation leads; 41% reach Decision.</p></CardHeader>
  <CardContent><ChartContainer config={config}><AreaChart …/></ChartContainer></CardContent>
</Card>
```
// ChartContainer reads CSS vars — no hardcoded stroke/fill per theme. Grid/axis colors come from tokens so Light/Dark swap automatically.

### 8.3 KPI card spec

```
[Label 12px text-2] [Info tooltip]
[Value 28px mono semibold tabular-nums] [Delta pill: ▲12.4% emerald / ▼3.1% rose]
[Sparkline 64x24, accent stroke, no axes]
[Insight 12px text-3, 1 line]
```

Deltas always vs prior equivalent period, with tooltip `vs prior 7d`. Positive-good = emerald, negative-bad = rose; for latency/error invert semantics explicitly.

### 8.4 Tables

- Sticky header `bg-muted/50 backdrop-blur`, row `h-12 border-b border-subtle hover:bg-muted/40`, mono for numbers/URLs/latency, status via dot + label (not color alone).
- Right-aligned numerics, left-aligned text. Pagination + `Export CSV` for >25 rows.
- Row click → Drawer, never full-page jump for reading.

### 8.5 Formatting

- Counts: `1.2k / 3.4M`. Money: `$499`. Dwell: `3m 12s`. Latency: `p50 420ms / p95 1.1s`. Dates: `Oct 7, 14:32`. Percent: `1 decimal` for deltas, `0` for rates.
- Funnel `Awareness → Consideration → Decision` always left→right, same order everywhere.

---

## 9. Components — shadcn PRIMARY, ai-elements for AI (states = design)

> Source policy (per `shadcn` + `ai-elements` skills): Use existing first. Compose, don't reinvent. If shadcn or ai-elements ships it, import it. Custom `div` chrome for Button/Card Dialog Table Empty Alert Skeleton Chat bubbles = fail.

### 9.1 shadcn/ui — default for all app chrome

Installed today in `apps/web/components/ui/`: `avatar, breadcrumb, button, collapsible, dropdown-menu, input, separator, sheet, sidebar, skeleton, tooltip`. Before writing custom UI: `bunx --bun shadcn@latest search -q "<need>"` then `bunx --bun shadcn@latest docs <component>` + fetch URLs, then `bunx --bun shadcn@latest add <component>`.

Use for: `Button, Card, Table, Badge, Avatar (+AvatarFallback always), Tabs (+TabsList>TabsTrigger), Dialog/Sheet/Drawer (+Title always, sr-only if hidden), Select (+SelectGroup>SelectItem), Input, Textarea, Slider, Switch, Checkbox, RadioGroup, Combobox, Tooltip, HoverCard, Popover, DropdownMenu (+DropdownMenuGroup>Item), Command in Dialog, Alert for callouts, Empty for empty states, Skeleton (never custom pulse div), Separator (never hr/div-border), Sonner toast (Radix base), Chart (Recharts wrapper), Sidebar, Breadcrumb, Pagination, Accordion`.

Rules: variants before custom styles (`variant="outline" size="sm"`). Semantic colors only (`bg-primary text-muted-foreground`). `className` for layout only — never override component color/typography. Spacing `flex gap-*` (never `space-x-*`), equal WH `size-*`, `truncate` shorthand, `cn()` for conditionals, no manual `dark:` color overrides, no manual z-index on overlays. Forms: `FieldGroup+Field` (never raw div grid), `InputGroup+InputGroupInput`, 2–7 options = `ToggleGroup`, grouping = `FieldSet+FieldLegend`, validation `data-invalid + aria-invalid`. Icons in Button: `data-icon="inline-start/end"`, no sizing classes. Loading Button: `Spinner + disabled`, never `isPending` prop.

### 9.2 ai-elements — primary for conversational surfaces only

Install per need: `bunx --bun ai-elements@latest` → code lands in `@/components/ai-elements/` ( respects `components.json`). Use for Lab + Ledger reading: `/playground` chat, `/visitors/conversations` transcript, voice playback, tool/citation displays.

Use: `Conversation, Message, MessageContent, MessageResponse, PromptInput, MessageScroller (+MessageScrollerButton for jump-to-latest, owns streaming follow/anchoring — never custom useStickToBottom), Bubble for surfaces, Attachment for files, Marker for system notes/dividers, ChainOfThought, Tool displays, CodeBlock, AudioPlayer, Artifact/Canvas where needed`. Compose chat primitives — never hand-rolled bubble divs or raw scroll containers. Props extend HTML primitives, style with tokens (Zinc + Electric Blue, Light white / Dark zinc-900) to match §3–§5. Verify `tsconfig @/*` alias + `AI SDK + shadcn` prereqs per skill.

### 9.3 Archetype → source map (mandatory)

| Archetype | shadcn | ai-elements |
|---|---|---|
| A. Telemetry | `Card+CardHeader/Title/Description/Content, Chart, Table, Badge, Tooltip` | — |
| B. Studio | `FieldGroup+Field, Input, Select, Slider, Switch, Tabs, Card, Sheet` for preview | — (Signals drafts use `Card+Tabs`, not chat) |
| C. Ledger | `Table, Sheet (drawer w-[480px]), Avatar+Fallback, Badge, Input (search), Pagination, Empty, Skeleton` | `AudioPlayer` for session playback, `Marker` for system notes |
| D. Lab | `Sheet (inspector), Collapsible, Badge (score), Tooltip, Separator` | `Conversation+MessageScroller+Message+Bubble+PromptInput+ChainOfThought+CodeBlock+Tool` |

### 9.4 Spec (Light / Dark parity — built on both libs)

| Component | Spec (Light / Dark parity) |
|---|---|
| `Button` | `h-9 px-4 text-sm font-medium rounded-lg`. Primary: Light `bg-brand-600 text-white hover:bg-brand-500`, Dark `bg-brand-500 text-zinc-950 or white per contrast + hover brighter`, `active:scale-[0.98]`. Secondary: `border-border-subtle bg-surface`. Ghost: text-only. Disabled: `opacity-50 pointer-events-none` + reason tooltip in both. Contrast AA min in both — audit white-on-blue Light and ink-on-blue Dark separately. |
| `Card` | `rounded-xl border bg-card p-5`. Light `bg-white border-zinc-200`, Dark `bg-card border-white/10`. Title `16 semibold text-1`, sub `13 text-2`. No nested cards. If >6 cards on page, switch to dividers (critical in Light). |
| `Input/Select/Slider` | Label above (`text-2`), helper in markup (optional), error below (rose-600 Light / rose-400 Dark). `h-9 rounded-lg`. Light `bg-white border-zinc-300`, Dark `bg-zinc-900 border-white/15`. No placeholder-as-label. Focus: Light `ring-2 ring-brand-600/30 border-brand-600`, Dark `ring-brand-500/40 border-brand-500`. Placeholder contrast still readable in Light. |
| `Badge/Chip` | `rounded-full px-2.5 py-0.5 text-xs font-medium`. Status: dot + label (never color alone). Light fills `emerald-50/blue-50/rose-50/zinc-100` with `700` text; Dark fills `emerald-500/15` etc with `300` text. `READY emerald, CRAWLING blue pulse (once, respects reduced-motion), FAILED rose, DRAFT zinc`. |
| `Tabs` | Underline style for archetype switching, pill only for filters. Active tab `text-1 + accent underline`, inactive `text-2`. Content `mt-4`. |
| `Drawer/Sheet` | Right `w-[480px]`, Light `bg-white`, Dark `bg-zinc-900`, header + scroll body + footer actions. Scrim per §3.4. Used for transcript, dossier, diff, chunk inspector. |
| `Empty` | Centered icon (Phosphor 24, `text-3`) + title `text-1` + 1-line why `text-2` + primary CTA. E.g. “No conversions yet — Configure trigger.” Same in both, icon never `zinc-300` in Light (fails 3:1). |
| `Error` | Inline rose border + what + how to fix + Retry. Light `border-rose-200 bg-rose-50 text-rose-900`, Dark `border-rose-500/30 bg-rose-500/10 text-rose-200`. Toasts only for transient (saved, copied). |
| `Skeleton` | Shape-matched (`h-[180px] rounded-xl`), Light `bg-zinc-200/70`, Dark `bg-white/10`, never spinner for charts/tables. |

Form a11y: `<label>`, `aria-describedby` helper, `aria-invalid` + error role, color never sole indicator.

### 9.5 Interaction contracts (no guessing)

- **Table:** shadcn `Table` + header `bg-muted/50 backdrop-blur sticky top-0 z-10`. Props: sortable headers (`aria-sort`), filter `Input` with `SearchIcon data-icon`, pagination (`Pagination + page-size Select`), row `hover:bg-muted/40 focus-visible:ring-2`, selected `bg-accent/8 + left border accent`. Numbers right-aligned mono, text left. >25 rows = pagination + Export CSV. Row → `Sheet` drawer, `Enter` opens, `Esc` closes, focus returns to row.
- **Drawer (`Sheet`):** `w-[480px] desktop / w-full mobile (max-w-full)`, `SheetTitle` always (sr-only ok), focus-trap + `Esc` + scrim click close, footer actions sticky bottom. Never modal for reading transcripts/diffs/logs.
- **Header controls:** `DateRange = Popover + Calendar (or Select 7d/30d/90d MVP)` + `AgentSelect = Select + SelectGroup>SelectItem (All agents + list)` + one `Button primary`. Right-aligned `flex gap-2 flex-wrap`, truncates on mobile.
- **Form error example:**
```tsx
<FieldGroup>
  <Field data-invalid>
    <FieldLabel htmlFor="url">Root URL</FieldLabel>
    <Input id="url" aria-invalid placeholder="https://acme.com" />
    <FieldDescription>Must return 200 + allow robots.</FieldDescription>
  </Field>
</FieldGroup>
```
- **Chat streaming:** `MessageScroller` container `aria-live="polite"`, input `PromptInput` always labelled, stop-stream `Button` visible during stream, `prefers-reduced-motion` disables auto-scroll animation. Graph/radar bubbles: keyboard-focusable nodes (`tabIndex 0`, `Enter` opens inspector), list fallback table for SR + no-JS.

---

## 10. Page-by-Page Guidance (spec v3)

- **`/overview` (Telemetry):** 4 KPIs (active scripts, live sessions, voice min, assisted lift) + Demand Pulse top-5 intent chips + Health list (snapshot version, crawl status, ping). Insight captions mandatory.
- **`/knowledge/ingest` (Studio):** URL input + depth slider 1–5 + exclusions + Live Extraction Visualizer (5-stage pipeline timeline) + Crawl History table. Visualizer = log timeline, not spinner.
- **`/knowledge/sources` (Ledger):** Tabs (Pages / Sitemaps / Docs / Snippets / robots). Pages table: URL mono, status code badge, last-crawled, enable toggle.
- **`/knowledge/snapshots` (Ledger):** Snapshot cards + 1-click Rollback (confirm) + Diff Inspector side-by-side green/red, mono.
- **`/knowledge/graph` (Lab):** ECharts force graph, entity colors by type, orphan nodes amber ring + count. Click → inspector.
- **`/agents` (Lab):** Agent cards + Partition Bindings drawer (snapshot, domains, voice). No table for <6 agents.
- **`/experience/appearance` (Studio):** Scraped tokens swatches + geometry radio (bottom-right/left, drawer/sheet) + theme sync toggle + widget preview iframe.
- **`/experience/personality` (Studio):** Tone presets (3 cards) + Directives markdown editor + Voice Studio (voice select, speed 0.8–1.25x slider, energy preset). Sentiment modulation as info callout.
- **`/experience/behavior` (Studio):** Trigger rules list (dwell 30s/pricing, exit-intent) + greeting chips preview + grounding confidence slider with fallback explainer.
- **`/playground` (Lab):** Chat left + Citation & Chunk Inspector right (source URL, score bar, latency mono) + Prompt Debugger collapsible (Base/Admin/Runtime layers).
- **`/integration/embed` (Studio):** Script snippet code block + Copy + Framework tabs (Next/React/Webflow/Shopify/WP/GTM) + Ping indicator (emerald pulse + last handshake mono).
- **`/integration/domains` (Ledger):** Origin whitelist table + path include/exclude inputs with `[data-conversion]` hint.
- **`/analytics/*` (Telemetry):** Shared header (date + agent). Website: visitors/sessions/dwell + landing/exit tables. Agent: open rate/depth/voice%/CTR + p50/p95 latency chart. Intent: distribution donut + trend + funnel. Conversions: total/baseline/assisted + top pages/intents. Assisted = blue, baseline = zinc dashed.
- **`/intelligence/intent-radar` (Telemetry+ECharts):** Demand cluster bubbles (size=volume, color=intent), Blindspot Index table (query, intent, confidence, volume), Competitor mentions bar.
- **`/intelligence/signals` (Studio):** Draft cards (FAQ + JSON-LD tabs) + Approve/Push (Webflow/WP/GitHub PR) + human-approval gate note. No auto-publish UI.
- **`/visitors/conversations` (Ledger):** Session table + transcript drawer (timestamp mono, audio player, thumbs, metadata: country/device/referrer/chunks).
- **`/visitors/leads` (Ledger):** Dossier cards (contact, BANT tags, stack) + CRM handoff buttons (Slack/HubSpot/SF/webhook). Zero-form language, no fake precision.
- **`/operations/activity+errors` (Ledger):** Audit table (actor, action, time mono) + Error log (level badge, retry, rate-limit hint).
- **`/settings/*` (Ledger/Studio):** API keys masked + webhook list (`lead.captured` etc) + Billing quotas (token/voice/events bars) + Team roles (Admin/Editor/Viewer).

---

## 11. Copy Voice

Conversational, plain verbs, sentence case. Action = outcome (`Save changes`, `Publish` → `Published`). Name by user mental model (`Notifications`, not `webhook config`). Errors explain fix, never apologize vaguely. Empty = invitation. One register per page — no mono-spec + editorial + marketing mix.

Self-audit before ship: re-read every string. Kill broken grammar, unclear referents, cute-but-wrong metaphors, fake-precise `92% / 4.1×` unless from real data or labeled mock.

---

## 12. AI Agent Instructions (read before coding)

1. **Retrieve:** Read this `MASTER` + check `design-system/ag-ui/pages/<page>.md` if exists — page overrides master. No page file → master exclusively.
2. **Plan:** Output 1-line Design Read + archetype (A/B/C/D) + token list before code.
3. **Build:** shadcn PRIMARY (`search → docs → add`, semantic tokens, `FieldGroup+Field`, `gap-*`, `size-*`, `cn()`), ai-elements for chat (`MessageScroller+Message+Bubble+PromptInput`, never custom bubbles), Phosphor only, `shadcn Chart` default / ECharts only for radar/graph/funnel-large. `min-h-[100dvh]` never `h-screen`, Grid never flex-math, `max-w-[1400px] mx-auto`.
4. **Critique:** If plan reads as generic default for any SaaS (test: would same plan fit a different brief?) — revise that part, state what changed + why.
5. **Pre-flight (fail = don't ship):**
   - [ ] shadcn-first: `search` checked, no custom dupe of `Alert/Empty/Skeleton/Badge/Separator/Table/Dialog/Sheet/Tooltip`, full Card composition, Dialog/Sheet Title present, `AvatarFallback` present, `TabsTrigger` in `TabsList`, icons `data-icon` no sizing
   - [ ] ai-elements where chat: no hand-rolled bubbles/scroll hooks, `MessageScroller` owns scroll, `Attachment/Marker` used correctly
   - [ ] No hardcoded hex, no second accent, no mixed icon libs — tokens only (`:root` Light + `.dark`)
   - [ ] Eyebrows ≤1 per 3 sections, no 3-equal-cards, no split-header-as-default
   - [ ] Every chart has InsightCaption + empty/loading/error + table fallback, grid/axis/tooltip verified Light + Dark
   - [ ] Buttons/inputs/badges contrast AA in Light AND Dark (checked separately), one line CTA, one label per intent
   - [ ] Light checked: white cards separate from zinc-50 via border, dividers visible, placeholder/helper ≥4.5:1, tooltip legible on white
   - [ ] Dark checked: borders/inner highlight visible on zinc-950, text-2 ≥4.5:1, scrim isolates drawer
   - [ ] 375px + desktop, focus visible in both, reduced-motion collapses, `prefers-color-scheme` respected + ModeToggle persists
   - [ ] Numbers mono tabular-nums, human units, funnel order consistent

**Banned (AI tells):** AI-purple glow, warm-cream `#F4F1EA` + terracotta `#D97757`, near-black `#0B0B0B` as black, all-caps eyebrow per section, `A · B · C` meta strings, `WORD — fragment` labels, `→` on every button, mono for small labels-as-decoration, gradient text headers, custom cursors, hand-rolled div-screenshots, text-only page claiming minimalism.

---

## 13. Definition of Done (measurable)

Prime, pristine, consistent = all boxes ticked. If it looks like it could be any dashboard, it failed — revise toward `Behaviour → Interaction → Intent → Outcome`.

```bash
# 1. No raw color / no dupe chrome
grep -rn "#[0-9a-fA-F]\\{6\\}" apps/web/app apps/web/components --include="*.tsx" | grep -v tokens # expect empty
# 2. Light + Dark screenshots (PageHeader, KPI row, 1 chart, 1 table, 1 drawer) in both modes
# 3. Contrast: text-1 ≥7:1, text-2 ≥4.5:1, meaningful icon ≥3:1 — checked Light AND Dark separately
# 4. Keyboard: Tab reaches all actions, Enter opens rows/nodes, Esc closes Sheet/Dialog, focus returns, aria-live announces streaming
```
