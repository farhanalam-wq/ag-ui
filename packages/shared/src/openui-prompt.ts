/**
 * OpenUI Lang System Prompt Generator.
 * Generates compact, token-efficient instructions for LLMs to emit OpenUI Lang.
 */

export interface OpenUIPromptOptions {
  companyName?: string;
  brandPrimary?: string;
}

export function buildOpenUISystemPrompt(options?: OpenUIPromptOptions): string {
  const company = options?.companyName || "the company";

  return `
## INTERACTIVE GENERATIVE UI (OpenUI Lang)
You are equipped with a progressive Generative UI engine powered by OpenUI Lang.
Whenever the user asks about products, pricing, tiers, metrics, analytics, feature comparisons, or protocol capabilities for ${company}, you MUST accompany your written answer with an interactive OpenUI visual component.

Format the OpenUI component inside a dedicated codeblock tagged with \`\`\`openui:
\`\`\`openui
root = Stack([title, component])
...
\`\`\`

### OpenUI Lang Syntax Rules:
1. Line-oriented statements: identifier = Component(args...)
2. root is the required entry point: every program MUST define root = Stack([child1, child2, ...]).
3. Valid expressions: strings ("text"), numbers (100), booleans (true), arrays (["a", "b"]).
4. Keep child component references as clean identifiers.

### Available Component Catalog:
- **Stack(children, direction, gap, align, justify, wrap)**: Flex layout container. Direction: "column" | "row". Gap: "s" | "m" | "l".
- **Card(children, variant, direction, gap)**: Elevated glassmorphic surface container. Variant: "card" (default) | "sunk".
- **CardHeader(title, subtitle)**: High-contrast section banner with title and muted subtitle.
- **TextContent(text, size)**: Typography block. Size MUST be one of: "default" (standard body text/description), "small" (caption/footnote), "large" (subheading), "small-heavy" (small bold), "large-heavy" (prominent bold title). NEVER use "medium".
- **TagBlock(tagsArray)**: Inline pills for capabilities/features (e.g. TagBlock(["SMTP", "TLS 1.3", "REST API"])). Automatically displays verified brand SVG logos when technology names are detected!
- **TechGrid(items, title, columns, variant)**: BESPOKE TECH VISUALIZER. Renders verified brand SVG logos (0ms instant resolution) for programming languages, frameworks, databases, and cloud tools. items: array of tech names or objects.
- **ProductGrid(products, title)**: BESPOKE PRODUCT SHOWCASE with high hierarchy. Features a prominent hero solution card with accent glow and secondary sibling cards. products: array of objects with title, subtitle, description, tags, featured.
- **PricingGrid(plans, title)**: BESPOKE PRICING TIERS with large price typography, feature checklists, and highlighted recommended tiers. plans: array of objects with name, price, period, description, features, recommended, ctaLabel.
- **MetricGrid(metrics, title, columns)**: BESPOKE KPI DASHBOARD with large value numbers, trend/delta badges, and category icons. metrics: array of objects with label, value, change, trend, subtitle.
- **Table(columns)**: Column-oriented structured table. Child columns: Col(headerText, valuesArray).
- **BarChart(labels, seriesArray, type)**: Analytical bar visualizer. Types: "grouped" | "stacked". Series: Series("Name", [values]).
- **LineChart(labels, seriesArray)**: Line trend visualizer.
- **AreaChart(labels, seriesArray)**: Area volume visualizer.
- **Tabs(tabItemsArray)**: Segmented tabbed switcher. Children: TabItem("id", "Label", [contentArray]).
- **Callout(type, title, description)**: Highlight notice with glowing border. Types: "info" | "success" | "alert" | "danger".
- **Buttons(buttonArray)**: Interactive action row. Children: Button("Label", action, "primary" | "secondary").

### OpenUI Lang Reference Examples:

#### 1. Bespoke Pricing Grid (PREFER THIS for SaaS pricing questions):
\`\`\`openui
root = Stack([tiers], "column", "m")
tiers = PricingGrid([tierFree, tierPro, tierEnterprise], "${company} Pricing Plans")
tierFree = {"name": "Hobby", "price": "$0", "period": "month", "description": "For side projects and prototyping", "features": ["3,000 Emails / mo", "Shared IP Pool", "Community Discord Support", "1 Verified Domain"], "ctaLabel": "Start Free"}
tierPro = {"name": "Pro Developer", "price": "$20", "period": "month", "description": "High deliverability for production apps", "features": ["50,000 Emails / mo", "Dedicated IP Option", "Priority Deliverability", "Unlimited Domains", "Webhooks & Logs"], "recommended": true, "ctaLabel": "Deploy Pro"}
tierEnterprise = {"name": "Enterprise", "price": "Custom", "description": "Custom SLAs and dedicated infrastructure", "features": ["Unlimited Volume", "Dedicated IP Pools", "99.99% Uptime SLA", "24/7 Slack & Phone Support"], "ctaLabel": "Talk to Sales"}
\`\`\`

#### 2. Products Showcase with Featured Hero Hierarchy:
\`\`\`openui
root = Stack([prods], "column", "m")
prods = ProductGrid([flagship, relay, inbound], "${company} Product Suite")
flagship = {"title": "Developer Email API", "subtitle": "Core REST Infrastructure", "description": "Next-generation transactional and broadcast email API with sub-100ms processing and real-time event webhooks.", "tags": ["REST API", "TypeScript", "Python", "Go", "Webhooks"], "featured": true}
relay = {"title": "SMTP Relay Engine", "subtitle": "Drop-in Email Transmission", "description": "Deliver transactional emails directly via port 465/587 with automatic TLS 1.3 encryption and DKIM authentication.", "tags": ["SMTP", "TLS 1.3", "Zero Config"]}
inbound = {"title": "Inbound Email Webhooks", "subtitle": "Parsing & Receiving", "description": "Receive and parse inbound emails with structured JSON payloads delivered directly to your server endpoints.", "tags": ["Inbound", "JSON", "Automation"]}
\`\`\`

#### 3. Technology Stack & SDK Matrix (with Brand SVG Logos):
\`\`\`openui
root = Stack([tech], "column", "m")
tech = TechGrid(["TypeScript", "Python", "Go", "Node.js", "React", "Next.js", "Docker", "PostgreSQL", "Redis"], "Supported Technologies & Official SDKs", 3, "cards")
\`\`\`

#### 4. Executive KPI Metrics:
\`\`\`openui
root = Stack([kpis, chart], "column", "l")
kpis = MetricGrid([deliveryRate, apiLatency, activeSenders], "Real-Time System Health", 3)
deliveryRate = {"label": "Global Deliverability", "value": "99.85%", "change": "+0.3%", "trend": "up", "subtitle": "Across Tier-1 mailbox providers"}
apiLatency = {"label": "Median API Latency", "value": "42ms", "change": "-8ms", "trend": "up", "subtitle": "Global edge network"}
activeSenders = {"label": "Emails Processed", "value": "1.2B+", "change": "+18% MoM", "trend": "up", "subtitle": "Past 30 days"}
chart = BarChart(months, [delivered, bounced], "grouped")
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
delivered = Series("Delivered (k)", [450, 680, 890, 1200, 1650, 2100])
bounced = Series("Bounced (k)", [2, 3, 4, 5, 6, 7])
\`\`\`

#### 5. Feature Comparison Tabs:
\`\`\`openui
root = Stack([title, tabs], "column", "m")
title = TextContent("Architecture & Protocols", "large-heavy")
tabs = Tabs([tabSmtp, tabHttp, tabWebhooks])
tabSmtp = TabItem("smtp", "SMTP Relay", [TextContent("Drop-in SMTP relay compatible with any client framework. Port 465/587 TLS 1.3 supported.", "default")])
tabHttp = TabItem("http", "REST API", [TextContent("Ultra-low latency HTTP API with official SDKs for TypeScript, Python, and Go.", "default")])
tabWebhooks = TabItem("webhooks", "Real-Time Webhooks", [TextContent("Cryptographically signed webhook events for delivered, opened, clicked, and bounced messages.", "default")])
\`\`\`
`;
}
