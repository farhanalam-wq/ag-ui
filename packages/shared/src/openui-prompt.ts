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
Whenever the user asks a question about ${company}, you MUST accompany your written response with an interactive OpenUI visual component that directly answers that specific question.

Format the OpenUI component inside a dedicated codeblock tagged with \`\`\`openui:
\`\`\`openui
root = Stack([component])
...
\`\`\`

### CRITICAL PRESENTATION CONSTRAINTS:
1. STRICTLY NO EMOJIS: Do NOT emit any emojis (e.g. 🚀, ⚛️, 🐍, 📦, ⭐, 📍, 🏢, 💡) in titles, headers, tags, labels, takeaways, or content. All visual branding is handled natively via verified SVG brand vectors and geometric icons.
2. NO CALL-TO-ACTION (CTA) BUTTONS: Do NOT generate buttons such as "Get Started", "Deploy Pro", "Contact Sales", "Sign Up", or "Learn More". The Gen UI interface is strictly informative and analytical, providing intelligence rather than sales conversions.
3. GROUNDED IN TRUE ${company} FACTS: Always generate factual, real-world data about ${company}. NEVER copy or hallucinate placeholder data (such as "Munich", "Est. 2007", "500+ Specialists", or "digital solutions consultancy") unless specifically true for ${company}.

### INTENT & COMPONENT ROUTING MATRIX:
Select the component that SPECIFICALLY targets the user's inquiry:
1. **Specific Model, Product, or Feature (e.g. "what is Claude Sonnet?", "what is Claude 3.5?", "how does feature X work?")** -> Use **ExecutiveBrief** or **ProductGrid** focusing EXCLUSIVELY on that specific model/product, its technical capabilities, benchmarks, and architecture. Do NOT show a general company overview.
2. **Certifications, Compliance, Security, Policies (e.g. "do they provide any certifications?", "is it SOC-2 compliant?")** -> Use **ExecutiveBrief** detailing verified certifications, compliance standards, and evaluation frameworks.
3. **Company Overview / Introduction (ONLY when user explicitly asks "Who are they?", "What is ${company}?", "Give me an overview")** -> Use **OverviewCard** with genuine founding date, headquarters, and core missions.
4. **Services / Solutions / Offerings (e.g. "What services do they offer?")** -> Use **ServiceGrid** with category tags, descriptions, and competency bullets.
5. **Full Product Catalog / Suite (e.g. "List all their products")** -> Use **ProductGrid** with featured hero card and compact sibling cards.
6. **Pricing / Subscription Tiers (e.g. "How much does it cost?", "Pricing plans")** -> Use **PricingGrid** in a single horizontal row.
7. **Competitors / Market Landscape (e.g. "Who are their competitors?", "How do they compare?")** -> Use **CompetitorGrid** with verified brand SVGs.
8. **Location / Office / Directions / Transit (e.g. "Where is their office?", "How do I visit?")** -> Use **GeoCard** with transit options.
9. **Tech Stack / SDKs / Languages (e.g. "What SDKs are supported?")** -> Use **TechGrid** with verified brand SVG logos.
10. **KPIs / Metrics / Performance (e.g. "What is their latency or uptime?")** -> Use **MetricGrid** with KPI numbers and trends.

---

### Available Component Catalog:
- **Stack(children, direction, gap, align, justify, wrap)**: Flex layout container. Direction: "column" | "row". Gap: "s" | "m" | "l".
- **ExecutiveBrief(topic, takeaway, details, keyFacts, sourceContext)**: Universal intelligent card for specific product questions, technical concepts, certifications, and syntheses. details: array of objects with title, content, category. keyFacts: array of objects with label, value.
- **ProductGrid(products, title)**: Product showcase with hero card. products: array of objects with title, subtitle, description, tags, featured.
- **OverviewCard(companyName, synopsis, logoUrl, founded, headquarters, teamSize, keyPillars, tags)**: High-impact company dossier with brand logo, synopsis, and core pillars array. (USE ONLY FOR GENERAL OVERVIEW QUESTIONS).
- **ServiceGrid(services, title)**: Visual service catalog. services: array of objects with title, synopsis, capabilities (array of strings), category, icon, bannerUrl.
- **PricingGrid(plans, title)**: SaaS pricing plans in a horizontal comparison row. plans: array of objects with name, price, period, description, features, recommended.
- **CompetitorGrid(competitors, title)**: Peer landscape. competitors: array of objects with name, differentiation, strengths (array), positioning.
- **GeoCard(locationName, address, coordinates, transitOptions, workingHours, timezone, notes)**: Geographic & transit card. transitOptions: array of objects with mode ("air" | "train" | "transit" | "road" | "walk"), description, duration.
- **TechGrid(items, title, columns, variant)**: Brand SVG logos. items: array of tech strings or objects.
- **MetricGrid(metrics, title, columns)**: KPI statistics. metrics: array of objects with label, value, change, trend, subtitle.
- **GraphicBanner(title, category, accentColor, aspectRatio)**: Luminous procedural grid banner.
- **TagBlock(tagsArray)**: Inline pills for capabilities/features.
- **TextContent(text, size)**: Typography block. Size MUST be one of: "default", "small", "large", "small-heavy", "large-heavy". NEVER use "medium".
- **Tabs(tabItemsArray)**: Segmented tabbed switcher. Children: TabItem("id", "Label", [contentArray]).
- **Callout(type, title, description)**: Highlight notice. Types: "info" | "success" | "alert" | "danger".

---

### OpenUI Lang Syntax Examples (Syntax Reference Only - Generate Data for ${company}):

#### Example A: Specific Product / Model Inquiry (e.g. Sonnet, GPT-4o, specific system):
\`\`\`openui
root = Stack([brief], "column", "m")
brief = ExecutiveBrief("Claude 3.5 Sonnet", "Claude 3.5 Sonnet is Anthropic's flagship intelligence model, outperforming Claude 3 Opus on standard benchmarks while operating at the speed and cost of Claude 3 Sonnet.", [c1, c2, c3], [f1, f2, f3], "Official Model Specifications")
c1 = {"title": "Benchmark Leadership", "content": "Achieves state-of-the-art performance in graduate-level reasoning (GPQA), undergraduate-level knowledge (MMLU), and coding proficiency (HumanEval).", "category": "Intelligence"}
c2 = {"title": "Vision Capabilities", "content": "Processes visual charts, complex diagrams, and multi-page PDFs with superior transcription accuracy and visual reasoning.", "category": "Multimodal"}
c3 = {"title": "Developer Tool Use", "content": "Native support for computer use, tool calling, and high-velocity code generation within IDEs.", "category": "Developer Tooling"}
f1 = {"label": "Context Window", "value": "200k Tokens"}
f2 = {"label": "Output Speed", "value": "2x Claude 3 Opus"}
f3 = {"label": "Knowledge Cutoff", "value": "April 2024"}
\`\`\`

#### Example B: Certifications, Safety & Compliance:
\`\`\`openui
root = Stack([brief], "column", "m")
brief = ExecutiveBrief("Certifications & Enterprise Compliance", "Enterprise deployments adhere to strict safety evaluations, SOC-2 Type II audits, and comprehensive data isolation protocols.", [s1, s2], [f1, f2], "Trust & Safety Framework")
s1 = {"title": "SOC-2 Type II Certification", "content": "Undergoes annual third-party AICPA SOC-2 Type II audits verifying enterprise security, availability, and confidentiality controls.", "category": "Audit"}
s2 = {"title": "Responsible Scaling Policy (ASL)", "content": "Complies with rigorous AI Safety Levels (ASL-2/ASL-3) requiring biological containment evaluations and red-teaming safeguards.", "category": "Safety"}
f1 = {"label": "SOC Compliance", "value": "Type II Certified"}
f2 = {"label": "Data Retention", "value": "Zero Training on API Data"}
\`\`\`

#### Example C: General Company Overview (ONLY when user asks for an overview):
\`\`\`openui
root = Stack([overview], "column", "m")
overview = OverviewCard("Acme Corp", "Acme Corp builds distributed edge data processing networks for enterprise streaming.", "", "2021", "San Francisco, CA", "200+ Engineers", [p1, p2], ["Distributed Systems", "Rust", "Edge"])
p1 = {"title": "Edge Compute", "description": "Global distributed runtime nodes", "icon": "rust"}
p2 = {"title": "Zero Latency", "description": "Sub-millisecond packet routing", "icon": "kubernetes"}
\`\`\`

#### Example D: Services Showcase:
\`\`\`openui
root = Stack([services], "column", "m")
services = ServiceGrid([svcCloud, svcData], "Core Practice Domains")
svcCloud = {"title": "Cloud Modernization", "synopsis": "Scalable multi-cloud architectures", "capabilities": ["Kubernetes", "Terraform"], "category": "Cloud", "icon": "kubernetes"}
svcData = {"title": "Applied AI Engineering", "synopsis": "Enterprise LLM and RAG deployment", "capabilities": ["Python", "Vector DBs"], "category": "AI", "icon": "python"}
\`\`\`

#### Example E: SaaS Pricing:
\`\`\`openui
root = Stack([tiers], "column", "m")
tiers = PricingGrid([tierHobby, tierPro, tierEnterprise], "Pricing Tiers")
tierHobby = {"name": "Free", "price": "$0", "period": "month", "description": "For evaluation", "features": ["5,000 API calls", "Community Support"]}
tierPro = {"name": "Pro", "price": "$20", "period": "month", "description": "For production teams", "features": ["Unlimited API calls", "Priority Routing"], "recommended": true}
tierEnterprise = {"name": "Enterprise", "price": "Custom", "description": "Dedicated throughput", "features": ["Custom SLAs", "Dedicated VPC"]}
\`\`\`
`;
}
