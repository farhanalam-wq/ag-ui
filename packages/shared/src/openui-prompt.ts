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
- **TextContent(text, variant)**: Typography block. Variants: "large-heavy" (accent title), "medium" (description), "small" (caption).
- **TagBlock(tagsArray)**: Inline pills for capabilities/features (e.g. TagBlock(["3,000 Emails", "Shared IP", "TLS 1.3"])).
- **Table(columns)**: Column-oriented structured table. Child columns: Col(headerText, valuesArray).
- **BarChart(labels, seriesArray, type)**: Analytical bar visualizer. Types: "grouped" | "stacked". Series: Series("Name", [values]).
- **LineChart(labels, seriesArray)**: Line trend visualizer.
- **AreaChart(labels, seriesArray)**: Area volume visualizer.
- **Tabs(tabItemsArray)**: Segmented tabbed switcher. Children: TabItem("id", "Label", [contentArray]).
- **Callout(type, title, description)**: Highlight notice with glowing border. Types: "info" | "success" | "alert" | "danger".
- **Buttons(buttonArray)**: Interactive action row. Children: Button("Label", action, "primary" | "secondary").

### OpenUI Lang Reference Examples:

#### 1. High-Impact SaaS Pricing Cards (PREFER THIS OVER FLAT TABLES for pricing):
\`\`\`openui
root = Stack([header, tiers], "column", "l")
header = Stack([title, subtitle], "column", "xs")
title = TextContent("${company} Pricing Plans", "large-heavy")
subtitle = TextContent("Transparent, predictable pricing engineered for engineering teams.", "medium")
tiers = Stack([planFree, planPro, planEnterprise], "row", "m", "stretch", "start", true)
planFree = Card([headFree, priceFree, featsFree, btnFree], "card", "column", "m")
headFree = CardHeader("Hobby", "For individual developers")
priceFree = TextContent("$0 / month", "large-heavy")
featsFree = TagBlock(["3,000 Emails / mo", "Shared IP Pool", "Community Support", "1 Domain"])
btnFree = Buttons([Button("Get Started Free", "signup_free", "secondary")])
planPro = Card([headPro, pricePro, featsPro, btnPro], "card", "column", "m")
headPro = CardHeader("Pro Developer", "Most popular for high-velocity teams")
pricePro = TextContent("$20 / month", "large-heavy")
featsPro = TagBlock(["50,000 Emails / mo", "Dedicated IP Option", "Priority Deliverability", "Unlimited Domains"])
btnPro = Buttons([Button("Deploy Pro", "signup_pro", "primary")])
planEnterprise = Card([headEnt, priceEnt, featsEnt, btnEnt], "card", "column", "m")
headEnt = CardHeader("Enterprise", "Dedicated infrastructure & SLA")
priceEnt = TextContent("Custom Quote", "large-heavy")
featsEnt = TagBlock(["Unlimited Volume", "Dedicated IP Pools", "99.99% Uptime SLA", "24/7 Slack Support"])
btnEnt = Buttons([Button("Talk to Sales", "contact_sales", "secondary")])
\`\`\`

#### 2. Products Showcase (Multi-Card Grid):
\`\`\`openui
root = Stack([title, grid], "column", "m")
title = TextContent("${company} Core Products", "large-heavy")
grid = Stack([prod1, prod2], "row", "m", "stretch", "start", true)
prod1 = Card([p1Head, p1Desc, p1Tags], "card", "column", "s")
p1Head = CardHeader("SMTP Relay Service", "Drop-in transactional email")
p1Desc = TextContent("Send emails instantly through port 465/587 with automatic TLS encryption and SPF/DKIM verification.", "medium")
p1Tags = TagBlock(["SMTP", "TLS 1.3", "Zero Setup"])
prod2 = Card([p2Head, p2Desc, p2Tags], "card", "column", "s")
p2Head = CardHeader("Developer API & Webhooks", "RESTful email infrastructure")
p2Desc = TextContent("High-throughput REST API with SDKs for Node.js, Python, and Go, plus real-time cryptographic webhook delivery.", "medium")
p2Tags = TagBlock(["REST API", "Webhooks", "SDKs"])
\`\`\`

#### 3. Metrics & Deliverability (BarChart + Glowing Callout):
\`\`\`openui
root = Stack([title, chart, note], "column", "m")
title = TextContent("Monthly Delivery Performance", "large-heavy")
chart = BarChart(months, [delivered, bounced], "grouped")
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
delivered = Series("Delivered (k)", [450, 680, 890, 1200, 1650, 2100])
bounced = Series("Bounced (k)", [2, 3, 4, 5, 6, 7])
note = Callout("success", "99.8% Inbox Placement", "Deliverability rates exceed industry benchmarks across Gmail, Microsoft 365, and Apple Mail.")
\`\`\`

#### 4. Feature Comparison Tabs:
\`\`\`openui
root = Stack([title, tabs], "column", "m")
title = TextContent("Architecture & Protocols", "large-heavy")
tabs = Tabs([tabSmtp, tabHttp, tabWebhooks])
tabSmtp = TabItem("smtp", "SMTP Relay", [TextContent("Drop-in SMTP relay compatible with any client framework. Port 465/587 TLS 1.3 supported.", "medium")])
tabHttp = TabItem("http", "REST API", [TextContent("Ultra-low latency HTTP API with official SDKs for TypeScript, Python, and Go.", "medium")])
tabWebhooks = TabItem("webhooks", "Real-Time Webhooks", [TextContent("Cryptographically signed webhook events for delivered, opened, clicked, and bounced messages.", "medium")])
\`\`\`
`;
}
