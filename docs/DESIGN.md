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
- Styling: Tailwind CSS 3.4 (`apps/web/tailwind.config.ts`), CSS variables in `apps/web/app/globals.css`. Dark default (`class="dark"` in `apps/web/app/layout.tsx`).
- Components: shadcn/ui (Zinc, CSS variables) + Radix primitives in `apps/web/components/ui/`. You own the code — never ship default state unstyled.
- State: Zustand (`apps/web/stores/`), `useState` for local only. Never `useState` for pointer/scroll physics — use `useMotionValue` if needed (rare here).
- Icons: `@phosphor-icons/react` ONLY. `lucide-react` is legacy — do not add new Lucide usage. One family per tree.
- Fonts: `next/font` self-hosted, `font-display: swap`. Never `<link>` Google Fonts in production.

### 2.1 Token hierarchy (mandatory)

```
Primitive (raw) → Semantic (purpose) → Component (usage)
```

**Rule:** No raw hex / no raw Tailwind palette (`bg-blue-500`, `text-slate-500`) in `app/**/page.tsx` or `components/`. Always reference semantic token or Tailwind semantic alias (`bg-primary`, `text-muted-foreground`, `bg-surface`, `text-text-2`, `var(--chart-1)`).

Future location: `apps/web/tokens/design-tokens.json` → generates `apps/web/app/tokens.css` → mapped in `tailwind.config.ts`. Until then, `globals.css` `:root` / `.dark` is the source. Validate with: `grep -rn "#[0-9a-fA-F]\{6\}" apps/web/app apps/web/components --include="*.tsx" | grep -v tokens` must be empty.

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

### 3.2 Semantic (light / dark)

| Semantic | Light | Dark | Notes |
|---|---|---|---|
| `background` | `zinc-50` | `zinc-950` | `apps/web/app/globals.css:7,43` |
| `surface` / `card` | `#FFFFFF` | `zinc-900/60` | raised panel, must separate from bg via border OR elevation, not both |
| `surface-elevated` | `#FFFFFF` + border | `zinc-900` + `border-white/10` + inner highlight | popover, drawer, dropdown |
| `text-1` | `zinc-950` | `zinc-50` | headings, KPI values. Contrast ≥7:1 target |
| `text-2` | `zinc-600` | `zinc-400` | body, labels. Contrast ≥4.5:1 mandatory |
| `text-3` | `zinc-500` | `zinc-500` | captions, timestamps, helper. Never for body |
| `border-subtle` | `zinc-200` | `white/10` | dividers, card borders |
| `accent` | `brand-600` | `brand-500` | single accent lock — whole app uses this blue, no per-page accent |
| `accent-ink` | `#FFFFFF` | `#09090B` | text on accent button. Verify 4.5:1 |

**Color Consistency Lock:** Once Electric Blue is the accent, every CTA, link, active nav, and primary chart series uses it. A rose CTA on one page + blue on another = fail. Status colors never substitute for accent.

### 3.3 Chart palette (ordered, colorblind-safe)

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

### 3.4 Dark mode protocol

- Dual-mode from start. `dark:` variant OR CSS vars — pick vars (current approach). Do not mix strategies per file.
- Hierarchy parity: if CTA pops in light, it pops in dark. Borders visible in both (`zinc-200` ↔ `white/10`).
- Scrim: `black/60` + `backdrop-blur-md`. Measure composed result for legibility.
- Test both modes before ship. Never ship seen-in-one-mode-only.

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

### 5.3 Elevation

- Light: `border border-border-subtle` + `shadow-[0_1px_2px_rgba(0,0,0,0.04)]`. Tint shadows to bg hue, never pure-black `rgba(0,0,0,.1)` blobs.
- Dark: `border-white/10` + `shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]`. No outer neon glows.
- Cards only when elevation = hierarchy. Otherwise group with `border-t` / `divide-y` / whitespace. For density 7, prefer plain layout + 1px dividers over card boxes.

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

Animate `transform` + `opacity` only. Existing `menu-in / collapsible-down/up` in `globals.css:129-172` is canonical. Honor `prefers-reduced-motion: reduce` — collapse to static. No scroll-hijack, no marquee (max 0 per internal page), no infinite pulse on cards.

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
| KPI trend, area/bar/donut, funnel bars, latency p50/p95 | shadcn/ui Chart (Recharts) | Composable, themed, accessible, zero extra bundle |
| Intent Radar bubble/cluster, funnel flow, Entity Graph node-link, large series (>1k pts) | Apache ECharts via `echarts-for-react` | Perf + clustering + force layout where Recharts janks |

One system per chart. No Nivo + Recharts + ECharts mixing on same page. Check `apps/web/package.json` before import — output install command if missing.

### 8.2 Every chart ships with

1. **Title + InsightCaption:** `Trend` + `Pricing Evaluation +32% WoW, driven by /pricing after widget open.` No caption = incomplete.
2. **Axes:** mono `12px text-3`, `tabular-nums`, human units (`1.2k`, `3m 12s`, `p95 820ms`). No raw ms dumps.
3. **Legend:** top-right, zinc, max 4 items. Direct-label lines when only 1–2 series.
4. **States:** loading skeleton matching chart shape (never spinner), empty with CTA, error inline with fix. Table fallback via `<details>` for SR + export.
5. **Tooltips:** dark elevated card, mono numbers, `%` + absolute, timestamp + source. No truncation.

```tsx
<Card>
  <CardHeader><CardTitle className="text-base">Intent distribution</CardTitle>
  <p className="text-sm text-muted-foreground">Pricing Evaluation leads; 41% reach Decision.</p></CardHeader>
  <CardContent><ChartContainer config={config}><AreaChart …/></ChartContainer></CardContent>
</Card>
```

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

## 9. Components (states = design)

Build from `apps/web/components/ui/*`. Never hand-roll dialog/popover/tooltip/table — use Radix-backed shadcn.

| Component | Spec |
|---|---|
| `Button` | `h-9 px-4 text-sm font-medium rounded-lg`. Primary: `bg-brand-600 text-white hover:bg-brand-500 active:scale-[0.98]`. Secondary: `border`. Ghost: text-only. Disabled: `opacity-50 pointer-events-none` + reason tooltip. Contrast AA min. |
| `Card` | `rounded-xl border bg-card p-5`. Title `16 semibold`, sub `13 text-2`. No nested cards. If >6 cards on page, switch to dividers. |
| `Input/Select/Slider` | Label above, helper in markup (optional), error below. `h-9 rounded-lg border-input`. No placeholder-as-label. Focus: `ring-2 ring-brand-600/30 border-brand-600`. |
| `Badge/Chip` | `rounded-full px-2.5 py-0.5 text-xs font-medium`. Status: dot + label. `READY emerald, CRAWLING blue pulse (once), FAILED rose, DRAFT zinc`. |
| `Tabs` | Underline style for archetype switching, pill only for filters. Content `mt-4`. |
| `Drawer/Sheet` | Right `w-[480px]`, header + scroll body + footer actions. Used for transcript, dossier, diff, chunk inspector. |
| `Empty` | Centered icon (Phosphor 24 zinc) + title + 1-line why + primary CTA. E.g. “No conversions yet — Configure trigger.” |
| `Error` | Inline rose border + what + how to fix + Retry. Toasts only for transient (saved, copied). |
| `Skeleton` | Shape-matched (`h-[180px] rounded-xl`), never spinner for charts/tables. |

Form a11y: `<label>`, `aria-describedby` helper, `aria-invalid` + error role, color never sole indicator.

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
3. **Build:** shadcn primitives only, semantic tokens only, Phosphor only, `shadcn Chart` default / ECharts only for radar/graph/funnel-large. `min-h-[100dvh]` never `h-screen`, Grid never flex-math, `max-w-[1400px] mx-auto`.
4. **Critique:** If plan reads as generic default for any SaaS (test: would same plan fit a different brief?) — revise that part, state what changed + why.
5. **Pre-flight (fail = don't ship):**
   - [ ] No hardcoded hex, no second accent, no mixed icon libs
   - [ ] Eyebrows ≤1 per 3 sections, no 3-equal-cards, no split-header-as-default
   - [ ] Every chart has InsightCaption + empty/loading/error + table fallback
   - [ ] Buttons contrast AA, one line, one label per intent
   - [ ] Both themes checked, 375px + desktop, focus visible, reduced-motion collapses
   - [ ] Numbers mono tabular-nums, human units, funnel order consistent

**Banned (AI tells):** AI-purple glow, warm-cream `#F4F1EA` + terracotta `#D97757`, near-black `#0B0B0B` as black, all-caps eyebrow per section, `A · B · C` meta strings, `WORD — fragment` labels, `→` on every button, mono for small labels-as-decoration, gradient text headers, custom cursors, hand-rolled div-screenshots, text-only page claiming minimalism.

---

## 13. Definition of Done

Prime, pristine, consistent: one job per page, insight in 5s, tokens only, one accent, one icon family, one radius rule, charts with captions, states for loading/empty/error, a11y + both themes verified. If it looks like it could be any dashboard, it failed — revise toward ag-ui's intelligence-chain story: `Behaviour → Interaction → Intent → Outcome`.
