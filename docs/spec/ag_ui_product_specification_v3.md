# ag-ui / Vaani — Complete Product & Technical Specification (v3.0)

## 1. Executive Summary & Strategic Positioning

### 1.1 What is ag-ui / Vaani?
**ag-ui / Vaani** is an autonomous intelligence platform, multimodal conversational agent runtime, and unified telemetry engine that turns any company website into an on-brand, intelligent assistant using a single public URL.

ag-ui bridges the gap between **website analytics**, **conversational artificial intelligence**, **zero-party intent detection**, and **business conversion attribution**. Rather than functioning merely as an isolated chatbot, it operates as an end-to-end customer intelligence system powered by a single client-side runtime script.

### 1.2 The Paradigm Shift
Traditional web infrastructure separates visitor analytics and customer interaction into disconnected silos:
* **Google Analytics & Web Analytics** answer: *"What happened on my website?"* (pageviews, bounce rates, sessions), but cannot uncover what visitors actually wanted, what questions went unanswered, or why high-intent prospects hesitated before abandoning a form.
* **Legacy AI Chatbots (e.g., Chatbase, InfoBeans Expona)** answer: *"Can I match this question to an ingested text chunk?"*, operating as passive support cost centers disconnected from visitor browsing context, funnel progression, or commercial conversions.

**ag-ui unifies the complete visitor lifecycle into a single continuous chain**:
$$\text{Website Behaviour} \longrightarrow \text{Agent Interaction} \longrightarrow \text{Visitor Intent} \longrightarrow \text{Business Outcome}$$

### 1.3 Core Product Deliverables
1. **One Script Integration**: A single client `<script>` tag powers the floating UI, voice runtime, passive page tracking, session attribution, and conversion detection.
2. **Knowledge Foundry**: Automated URL crawling, XML sitemap extraction, stylesheet scraping, and document indexing with zero manual training.
3. **Persona Studio & Audition Lab**: Native brand CSS assimilation, acoustic voice casting (timbre, cadence, tone), and runtime sentiment de-escalation.
4. **Unified Telemetry Engine**: Four synchronized analytics domains (Website, Agent, Intent, Conversion) consuming a single canonical event pipeline.
5. **Demand Radar & Signals (Reverse AEO)**: Real-time clustering of zero-party purchase intent, competitive objection detection, and autonomous drafting of structured FAQs and JSON-LD schema to patch website blind spots.
6. **Prospect Ledger**: Zero-form lead extraction that identifies contact details, technical stack constraints, and BANT qualifications from natural conversations.

---

## 2. System Architecture & Telemetry Pipeline

### 2.1 Target Event Pipeline Architecture
The customer integrates a single script snippet that bootstraps the client SDK runtime:

```
                      CUSTOMER WEBSITE
                             │
                             │ <script src="https://cdn.ag-ui.com/widget.js" data-agent-id="agent_123">
                             ▼
                   ┌───────────────────┐
                   │   AG-UI CLIENT    │
                   │       SDK         │
                   ├───────────────────┤
                   │ • Widget Runtime  │
                   │ • Session Engine  │
                   │ • Identity Store  │
                   │ • Local Buffer    │
                   │ • Event Transport │
                   └─────────┬─────────┘
                             │
                             │ HTTPS / sendBeacon (POST /v1/events)
                             ▼
                     ┌───────────────┐
                     │   Event API   │
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │ Event Pipeline│  (Validation & Normalization)
                     └───────┬───────┘
                             │
                             ▼
                     ┌───────────────┐
                     │  Event Store  │  (PostgreSQL JSONB -> ClickHouse)
                     └───────┬───────┘
                             │
           ┌─────────────────┼──────────────────┐
           ▼                 ▼                  ▼
      Website             Agent              Derived
     Analytics          Analytics             Events
                                                │
                                         ┌──────┴──────┐
                                         ▼             ▼
                                       Intent      Conversion
                                     Analytics     Analytics
                                         │             │
                                         └──────┬──────┘
                                                ▼
                                         AG-UI Dashboard
```

### 2.2 Canonical Event Envelope (`AGUIEvent`)
All telemetry domains consume a unified event schema:

```typescript
interface AGUIEvent {
  event_id: string;
  event_name: string;
  project_id: string;
  agent_id: string;

  // Identity & Session Context
  anonymous_id: string;
  session_id: string;
  conversation_id?: string;
  user_id?: string;

  timestamp: number;

  // Page Telemetry
  page: {
    url: string;
    path: string;
    title?: string;
    referrer?: string;
  };

  // Client Environment
  device: {
    type?: string;
    browser?: string;
    os?: string;
    viewport?: {
      width: number;
      height: number;
    };
  };

  // Domain-Specific Properties
  properties?: Record<string, unknown>;
}
```

### 2.3 Identity and Session Model
* **Anonymous Visitor (`anonymous_id`)**: A persistent first-party client UUID that survives across browser sessions where permitted.
* **Session (`session_id`)**: Represents a period of continuous website browsing. A session closes after 30 minutes of total inactivity. Can contain multiple pageviews, widget interactions, chat turns, and conversion milestones.
* **Conversation (`conversation_id`)**: A unique thread ID representing a specific text or voice exchange with the assistant.
* **Authenticated User (`user_id`)**: Explicitly bound when the host application identifies a logged-in user:
  ```javascript
  AGUI.identify("usr_99812", { plan: "enterprise", company: "Acme Corp" });
  ```

### 2.4 Transport, Batching & Client-Side Resiliency
* **Local In-Memory Queue**: Telemetry events are queued locally and flushed periodically (e.g., every 5 seconds or upon accumulating 10 events) to minimize HTTP requests.
* **Page Exit Unload**: Uses `navigator.sendBeacon()` on `visibility_change` and `page_exit` events to prevent lost data during navigation.
* **Non-Blocking Execution**: Telemetry and conversational networking are completely isolated. Any telemetry failure or network latency will never degrade host page performance or block widget execution.
* **Storage Tiering**: PostgreSQL with structured JSONB indexes powers the initial platform MVP. The canonical event schema guarantees zero-downtime analytical migration to ClickHouse as event volume scales.

---

## 3. Four-Tier Prompt Compilation Architecture

To ensure strict retrieval grounding, anti-hallucination compliance, and safety while granting administrators granular control over edge-case business rules, prompts are compiled using a four-layer architecture:

```
┌────────────────────────────────────────────────────────┐
│ 1. Platform Base Prompt    (Immutable Platform Layer)  │
│    • Strict citation formatting & grounding rules      │
│    • Hallucination barriers & fallback constraints     │
│    • Lead extraction schema & tool call definitions    │
├────────────────────────────────────────────────────────┤
│ 2. Admin Directives        (Client Custom Directives)  │
│    • Phrasing rules (e.g., "Always say Client")        │
│    • Business logic overrides (startup discounts, SLA) │
│    • Competitor deflection boundaries                  │
├────────────────────────────────────────────────────────┤
│ 3. Dynamic Session State   (Injected at Runtime)       │
│    • Current visitor URL path (e.g., /pricing)         │
│    • Local timezone, language, and referrer campaign   │
│    • Cart metadata or active application state         │
├────────────────────────────────────────────────────────┤
│ 4. Visitor Message         (End-User Input)            │
│    • Raw spoken audio turn or written query            │
└────────────────────────────────────────────────────────┘
```

---

## 4. Master Sidebar Navigation & Studio Nomenclature

```text
┌────────────────────────────────────┐
│ Acme Holdings                    ▾ │
├────────────────────────────────────┤
│                                    │
│  Overview                          │
│                                    │
│  KNOWLEDGE FOUNDRY                 │
│    Crawl Runner                    │
│    Sources                         │
│    Version Vault                   │
│    Entity Graph                    │
│                                    │
│  AGENT ORCHESTRATION               │
│    Agents                          │
│                                    │
│  PERSONA STUDIO                    │
│    Brand Styling                   │
│    Voice & Tone                    │
│    Trigger Rules                   │
│                                    │
│  AUDITION LAB                      │
│                                    │
│  CLIENT RUNTIME                    │
│    Script & SDK                    │
│    Allowed Origins                 │
│                                    │
│  UNIFIED TELEMETRY                 │
│    Website Analytics               │
│    Agent Analytics                 │
│    Intent Analytics                │
│    Conversion Attribution          │
│                                    │
│  DEMAND RADAR                      │
│    Intent Radar                    │
│    Signals (Auto-Patch)            │
│                                    │
│  PROSPECT LEDGER                   │
│    Live Sessions                   │
│    Lead Dossiers                   │
│                                    │
│  OPERATIONS                        │
│    Activity Log                    │
│    Error Tracing                   │
│                                    │
│  SETTINGS                          │
│    API & Webhooks                  │
│    Usage & Billing                 │
│    Team Management                 │
│                                    │
└────────────────────────────────────┘
```

---

## 5. In-Depth Module Specifications

### Module 1: Overview (`/overview`)
* **Executive Telemetry Cards**: Real-time counters showing active script executions, live chat sessions, voice minutes, and agent-assisted conversion lift.
* **Demand Pulse**: Top 5 trending semantic intent clusters over the past 24 hours.
* **Knowledge & Integration Health**: Current published snapshot version, last crawl status, and CDN script ping check.

---

### Module 2: Knowledge Foundry (`/knowledge`)

#### 2.1 Crawl Runner (`/knowledge/ingest`)
* **Execution Trigger**: The in-app counterpart of `/onboarding`. Enter root URLs, trigger XML sitemap parsing, and execute crawling.
* **Crawler Parameters**: Crawl depth sliders (levels 1–5), subdomain toggles, and exclusion regex (e.g., `/admin/*`, `/checkout/*`, `*?ref=*`).
* **Live Extraction Visualizer**: Real-time execution logs streaming:
  $$\text{Discovered URLs} \longrightarrow \text{DOM Cleaning} \longrightarrow \text{Boilerplate Removal} \longrightarrow \text{Semantic Chunking} \longrightarrow \text{Vector Indexing}$$
* **Crawl History**: Table of prior runs with duration, page counts, vector token totals, and completion status.

#### 2.2 Sources (`/knowledge/sources`)
* **Web Pages Inventory**: Complete table of indexed URLs with last-crawled timestamps, HTTP response codes, and manual enable/disable toggles.
* **Custom Sitemap Registry**: Upload and sync secondary XML sitemaps (e.g., `sitemap-docs.xml`, `sitemap-products.xml`).
* **Document Hub**: Drag-and-drop document uploader supporting PDF, DOCX, Markdown, TXT, and CSV files (security whitepapers, spec sheets, compliance documentation).
* **Manual Snippet Editor**: Rapid text-entry editor for private company FAQs or contact details absent from the public website.
* **Crawler Directives Inspector**: Read-only display of the target domain's active `robots.txt` and canonical URL structures.

#### 2.3 Version Vault (`/knowledge/snapshots`)
* **Snapshot Archives**: Immutable, point-in-time snapshots of the indexed knowledge base.
* **1-Click Rollback**: Instantly revert the production assistant's vector index to a previous snapshot if a recent website change introduced errors.
* **Diff Inspector**: Side-by-side comparison showing content added, updated, or removed between crawl snapshots.

#### 2.4 Entity Graph (`/knowledge/graph`)
* **Interactive Node-Link Map**: Visual representation of the extracted company entity network.
* **Entities & Relationships**: Visual nodes for Products, Pricing Tiers, Integrations, and Policies, connected by contextual relationships.
* **Orphan Node Detection**: Highlights unlinked or incomplete topics extracted from the site.

---

### Module 3: Agent Orchestration (`/agents`)
* **Agent Directory**: Multi-agent management allowing organizations to deploy specialized assistants across different subdomains (e.g., *Marketing Sales Assistant* vs. *Developer Docs Guide*).
* **Partition Bindings**: Assigns specific agents to unique knowledge snapshots, allowed domains, and voice profiles.

---

### Module 4: Persona Studio (`/experience`)

#### 4.1 Brand Styling (`/experience/appearance`)
* **Scraped Design Tokens**: Automatic extraction of primary brand hex colors, typography, border radii, and brand logos from the site's stylesheet.
* **Widget Geometry**: Placement selection (bottom-right vs. bottom-left), desktop offset margins, and mobile responsive behavior (drawer vs. full sheet).
* **Theme Modes**: Native synchronization with host website dark/light mode classes.
* **Phase 2 — Stylesheet depth (next):**
  * **Multi-page merge** — dembrandt `--crawl N` / `--sitemap` extraction merged with cross-page confidence into one token set per snapshot (single-page root extraction remains the default).
  * **Dark-mode & mobile variants** — `--dark-mode` / `--mobile` runs stored as variants on the stylesheet row, selectable in Appearance.
  * **Drift gate** — per-company token baseline + `--compare` on re-crawl; Appearance surfaces added/removed/changed tokens per snapshot, with optional blocking on drift.
  * **Screenshot proof** — viewport capture persisted once object storage lands (`screenshotUrl` column already exists).
* **Theme drift tracking** — token-hash per stylesheet row; Appearance + Snapshots surface a "colors moved since last extract" flag. Informational minor-level signal only: knowledge versions never bump on theme changes.

#### 4.2 Voice & Tone (`/experience/personality`)
* **Linguistic Character**: Tone presets (e.g., *Concise & Technical*, *Warm & Consultative*, *Corporate & Authoritative*).
* **Admin Custom Directives**: Open markdown editor for fine-tuning edge-case business rules:
  * Nomenclature enforcement (e.g., *"Always refer to users as Members"*).
  * Startup/custom pricing rules (e.g., *"Offer 50% discount to pre-seed startups via founders@acme.com"*).
  * Competitor deflection policies.
* **Voice Studio (Audio Engine)**:
  * **Voice Selection**: Choose male, female, and non-binary voice profiles across regional accents (US Neutral, British RP, Indian English, Australian).
  * **Cadence & Energy Presets**:
    * *High-Energy / Upbeat*: 1.1x speed, wide pitch variation.
    * *Consultative / Balanced*: 1.0x speed, warm mid-tones.
    * *Corporate / Formal*: 0.9x speed, measured cadence, zero colloquialisms.
  * **Fine-Tuning Controls**: Speed sliders ($0.8\text{x}$ to $1.25\text{x}$), expressiveness range, and interruption sensitivity.
  * **Runtime Sentiment Modulation**: Automatically tempers vocal cheerfulness when detecting frustrated user inputs, shifting to a calm, empathetic tone.

#### 4.3 Trigger Rules (`/experience/behavior`)
* **Proactive Engagement Interceptors**:
  * Dwell time triggers (e.g., trigger widget after 30 seconds on `/pricing`).
  * Exit-intent cursor velocity triggers.
* **Greeting & Quick Starter Chips**: Default welcome message and dynamic starter prompts based on current URL path.
* **Strict Grounding Threshold**: Confidence slider governing fallback behavior when information is absent from the knowledge base.

---

### Module 5: Audition Lab (`/playground`)
* **Dual-Modality Sandbox**: Staging environment supporting real-time text chat and live microphone voice streaming.
* **Citation & Chunk Inspector**: Side panel displaying the exact retrieved vector chunks, source URLs, similarity confidence scores, and token latency metrics.
* **Prompt Debugger**: View compiled prompt layers (Base + Admin + Runtime Context) for any message turn.

---

### Module 6: Client Runtime (`/integration`)

#### 6.1 Script & SDK (`/integration/embed`)
* **Single-Line Script**: Lightweight CDN script tag ready for standard HTML headers:
  ```html
  <script src="https://cdn.ag-ui.com/widget.js" data-agent-id="ag_live_982f1" async></script>
  ```
* **Client SDK Evolution**:
  * Phase 1: Internal `@ag-ui/client` powering the script bundle.
  * Phase 2: Public `@ag-ui/sdk` npm package for headless integrations.
* **Framework Quick-Starts**: Implementation guides for Next.js, React, Webflow, Shopify, WordPress, and Google Tag Manager.
* **Health & Ping Indicator**: Live visual indicator verifying active script handshakes with the host domain.

#### 6.2 Allowed Origins (`/integration/domains`)
* **CORS Origin Whitelisting**: Restricts script execution strictly to authorized domains (e.g., `company.com`, `staging.company.com`), preventing unauthorized token consumption.
* **Path Inclusion & Exclusion**: Enable the widget globally while blocking it on sensitive paths like `/checkout` or internal portals.

---

### Module 7: Unified Telemetry Engine (`/analytics`)

#### 7.1 Website Analytics (`/analytics/website`)
* Captures passive visitor behavior across the host domain without requiring third-party analytics scripts.
* **Automatically Collected Events**: `page_view`, `session_start`, `session_end`, `page_exit`, `scroll`, `visibility_change`.
* **Telemetry Metadata**: UTM parameters, referrers, viewports, OS, device classes.
* **Metrics**: Unique visitors, session volume, average dwell time, landing pages, exit pages, and referral attribution.

#### 7.2 Agent Analytics (`/analytics/agent`)
* Measures conversational engagement and assistant runtime performance.
* **Automatically Collected Events**: `widget_loaded`, `widget_opened`, `widget_closed`, `conversation_started`, `message_sent`, `message_received`, `voice_started`, `voice_ended`, `suggestion_clicked`, `source_clicked`, `response_latency`.
* **Metrics**: Widget open rate, message depth per session, voice adoption percentage, citation click-through rate, and response latency percentiles (p50, p95).

#### 7.3 Intent Analytics (`/analytics/intent`)
* Asynchronous ML pipeline that analyzes behavioral and conversational evidence to classify buyer intent.
* **Architecture**: Raw events (`message_sent`, `page_view`, `widget_opened`) are processed to derive `intent_detected` without modifying the raw event stream.
* **Standard Taxonomy**: Product Research, Pricing Evaluation, Competitor Comparison, Feature Discovery, Technical Documentation, Support/Troubleshooting, Enterprise Inquiries, Demo Requests.
* **Metrics**: Intent distribution, high-intent session volume, intent trends over time, and buyer funnel stage progression (Awareness $\rightarrow$ Consideration $\rightarrow$ Decision).

#### 7.4 Conversion Attribution (`/analytics/conversions`)
* Tracks whether visitor behavior and conversational interactions culminate in commercial outcomes.
* **Three-Level Tracking Architecture**:
  * **Level 1 (Automatic Detection)**: Generic conversion signals including thank-you URL visits, default form submissions, and external checkout links.
  * **Level 2 (Dashboard Configuration)**: No-code conversion triggers configured via URL matching rules or DOM element selectors (`[data-conversion="enterprise"]`).
  * **Level 3 (Developer SDK API)**: Programmatic tracking for SPAs and custom checkout flows:
    ```javascript
    AGUI.track("purchase_completed", { value: 499, tier: "enterprise" });
    ```
* **Metrics**: Total conversions, baseline conversion rate, **Agent-Assisted Conversion Rate** (conversions where an agent interaction took place), top converting pages, and top converting intent categories.

---

### Module 8: Demand Radar & Reverse AEO (`/intelligence`)

#### 8.1 Intent Radar (`/intelligence/intent-radar`)
* **Demand Clusters**: Groups conversational queries into emergent semantic themes (e.g., *EU Data Residency*, *Shopify Plus Migration*).
* **Blindspot & Objection Index**: Flags high-intent questions where the assistant returned low retrieval confidence due to missing website documentation.
* **Competitor Displacement Radar**: Tracks competitor mentions, comparing user queries to identify features causing buyer hesitation.

#### 8.2 Signals (Auto-Patch / Reverse AEO) (`/intelligence/signals`)
* **Autonomous FAQ Drafting**: Automatically generates structured FAQ components tailored to frequently asked, ungrounded visitor queries.
* **JSON-LD Schema Generation**: Creates search-engine-ready structured data markup to optimize for AI answer engines (AEO/GEO).
* **CMS Push Connectors**: Exports approved content drafts directly to Webflow, WordPress, or GitHub via pull requests with a single click.

---

### Module 9: Prospect Ledger (`/visitors`)

#### 9.1 Live Sessions (`/visitors/conversations`)
* **Full Transcript Viewer**: Timestamped message log, audio playback recordings, and visitor feedback ratings (thumbs up/down).
* **Context Metadata**: Visitor country, device type, referral URL, entry page path, and cited chunk IDs.

#### 9.2 Lead Dossiers (`/visitors/leads`)
* **Zero-Form Extraction**: Automatically pulls contact details (phone numbers, email addresses, names) provided naturally during conversation.
* **BANT Qualification Tagging**: Automatically detects buyer intent, budget cues, timeline urgency, and technical stack details.
* **Webhook & CRM Handoff**: Instantly syncs qualified lead dossiers to Slack, HubSpot, Salesforce, or custom webhooks.

---

### Module 10: Operations & Settings (`/operations`, `/settings`)
* **Activity Log (`/operations/activity`)**: Administrative audit trails of setting modifications, crawl jobs, and deployments.
* **Error Tracing (`/operations/errors`)**: Real-time log of scraping timeouts, API rate limits, and webhook failures.
* **API & Webhooks (`/settings/api`)**: Management of API keys, telemetry event webhooks (`lead.captured`, `intent.blindspot_detected`, `signals.patch_generated`), and public SDK tokens.
* **Usage & Billing (`/settings/billing`)**: Quotas for token consumption, voice minutes, and telemetry event storage.
* **Team Management (`/settings/team`)**: Role-based access control (Admin, Editor, Viewer) and seat provisioning.

---

## 6. Non-Goals for Initial Release

To maintain rapid development velocity and avoid premature complexity:
1. **Not a Full Google Analytics Replacement**: Initial scope excludes complex multi-touch attribution models, ad campaign bidding integrations, session heatmaps, or full DOM session replays.
2. **No Heavy Distributed Analytics Infrastructure**: PostgreSQL with structured JSONB indexes handles the MVP event stream; ClickHouse migration will occur when query scale justifies it.
3. **No Autonomous Direct-to-Production Publishing**: Signals content patches will generate review-ready drafts, PRs, and CMS staging entries, requiring one-click human approval before going live.
