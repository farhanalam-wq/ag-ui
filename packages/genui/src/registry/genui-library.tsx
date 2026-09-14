import React from "react";
import { z } from "zod/v4";
import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { openuiLibrary, openuiComponentGroups } from "@openuidev/react-ui";
import { TechGrid as TechGridComponent } from "../components/tech-grid";
import { ProductGrid as ProductGridComponent } from "../components/product-grid";
import { PricingGrid as PricingGridComponent } from "../components/pricing-grid";
import { MetricGrid as MetricGridComponent } from "../components/metric-grid";
import { EnhancedTagBlock as EnhancedTagBlockComponent } from "../components/enhanced-tag-block";
import { GraphicBanner as GraphicBannerComponent } from "../components/graphic-banner";
import { OverviewCard as OverviewCardComponent } from "../components/overview-card";
import { ServiceGrid as ServiceGridComponent } from "../components/service-grid";
import { CompetitorGrid as CompetitorGridComponent } from "../components/competitor-grid";
import { GeoCard as GeoCardComponent } from "../components/geo-card";
import { ExecutiveBrief as ExecutiveBriefComponent } from "../components/executive-brief";

// 1. Schema for TechGrid
export const TechGridSchema = z.object({
  items: z.array(
    z.union([
      z.string(),
      z.object({
        name: z.string(),
        category: z.string().optional(),
        description: z.string().optional(),
      }),
    ])
  ).describe("Array of technology names or structured items"),
  title: z.string().optional().describe("Optional section title"),
  columns: z.number().optional().describe("Number of columns (default 3)"),
  variant: z.enum(["cards", "compact"]).optional().describe("Display variant: cards or compact"),
});

// 2. Schema for ProductGrid
export const ProductItemSchema = z.object({
  title: z.string().describe("Product or solution name"),
  subtitle: z.string().optional().describe("Subtitle or short category"),
  description: z.string().describe("Clear executive description"),
  tags: z.array(z.string()).optional().describe("List of capabilities or feature tags"),
  icon: z.string().optional().describe("Semantic icon name or technology slug"),
  featured: z.boolean().optional().describe("Whether this is the highlighted hero product"),
});

export const ProductGridSchema = z.object({
  products: z.array(ProductItemSchema).describe("List of products to display"),
  title: z.string().optional().describe("Optional section title"),
});

// 3. Schema for PricingGrid
export const PricingPlanItemSchema = z.object({
  name: z.string().describe("Plan tier name, e.g. Free, Pro, Enterprise"),
  price: z.string().describe("Price string, e.g. $0 / mo, $20 / mo, Custom Quote"),
  period: z.string().optional().describe("Billing period, e.g. month, year"),
  description: z.string().optional().describe("Short target audience description"),
  features: z.array(z.string()).describe("List of included capabilities"),
  recommended: z.boolean().optional().describe("Whether this tier is marked Most Popular / Recommended"),
});

export const PricingGridSchema = z.object({
  plans: z.array(PricingPlanItemSchema).describe("List of pricing tiers"),
  title: z.string().optional().describe("Optional section title"),
});

// 4. Schema for MetricGrid
export const MetricItemSchema = z.object({
  label: z.string().describe("Metric label, e.g. Global Delivery Rate, API Latency"),
  value: z.string().describe("Primary value, e.g. 99.8%, <100ms, 50k+"),
  change: z.string().optional().describe("Change indicator, e.g. +12% MoM"),
  trend: z.enum(["up", "down", "neutral"]).optional().describe("Trend direction"),
  subtitle: z.string().optional().describe("Context or footnote note"),
  icon: z.string().optional().describe("Semantic icon hint"),
});

export const MetricGridSchema = z.object({
  metrics: z.array(MetricItemSchema).describe("List of KPI indicators"),
  title: z.string().optional().describe("Optional section title"),
  columns: z.number().optional().describe("Number of columns"),
});

// 5. Schema for TagBlock
export const TagBlockSchema = z.object({
  tags: z.array(z.string()).describe("List of tag labels"),
});

// 6. Schema for GraphicBanner
export const GraphicBannerSchema = z.object({
  title: z.string().describe("Banner headline or domain topic"),
  category: z.string().optional().describe("Category pill label"),
  accentColor: z.enum(["cyan", "indigo", "emerald", "violet", "amber", "rose", "blue"]).optional().describe("Accent aesthetic palette"),
  aspectRatio: z.enum(["16:9", "21:9", "3:1", "auto"]).optional().describe("Aspect ratio for the graphic banner"),
});

// 7. Schema for OverviewCard
export const KeyPillarSchema = z.object({
  title: z.string().describe("Pillar title or strategic focus area"),
  description: z.string().describe("Core description of this pillar"),
  icon: z.string().optional().describe("Icon name or technology slug"),
});

export const OverviewCardSchema = z.object({
  companyName: z.string().describe("Company or entity name"),
  synopsis: z.string().describe("Comprehensive 2-3 sentence executive synopsis"),
  logoUrl: z.string().optional().describe("Optional brand logo URL"),
  founded: z.string().optional().describe("Year or date founded"),
  headquarters: z.string().optional().describe("Headquarters city and country"),
  teamSize: z.string().optional().describe("Team or headcount scale"),
  keyPillars: z.array(KeyPillarSchema).optional().describe("Core pillars or strategic offerings"),
  tags: z.array(z.string()).optional().describe("Specialization keywords or technology tags"),
});

// 8. Schema for ServiceGrid
export const ServiceItemSchema = z.object({
  title: z.string().describe("Service offering title"),
  synopsis: z.string().describe("Executive description of the service"),
  capabilities: z.array(z.string()).describe("Key capabilities or deliverable items"),
  icon: z.string().optional().describe("Icon or technology slug"),
  bannerUrl: z.string().optional().describe("Image banner URL (Tier 2 image)"),
  category: z.string().optional().describe("Service category or division"),
});

export const ServiceGridSchema = z.object({
  services: z.array(ServiceItemSchema).describe("List of enterprise service offerings"),
  title: z.string().optional().describe("Section title"),
});

// 9. Schema for CompetitorGrid
export const CompetitorItemSchema = z.object({
  name: z.string().describe("Competitor or peer company name"),
  differentiation: z.string().describe("How the subject company differentiates from this peer"),
  strengths: z.array(z.string()).optional().describe("Peer focus areas or noted strengths"),
  positioning: z.string().optional().describe("Market positioning, e.g. Enterprise Legacy, Cloud Challenger"),
});

export const CompetitorGridSchema = z.object({
  competitors: z.array(CompetitorItemSchema).describe("List of competitor comparisons"),
  title: z.string().optional().describe("Section title"),
});

// 10. Schema for GeoCard
export const TransitOptionSchema = z.object({
  mode: z.enum(["air", "train", "transit", "road", "walk"]).describe("Transit mode"),
  description: z.string().describe("Route or direction description"),
  duration: z.string().optional().describe("Estimated travel time or distance"),
});

export const GeoCardSchema = z.object({
  locationName: z.string().describe("Office, campus, or facility name"),
  address: z.string().describe("Physical postal address"),
  coordinates: z.string().optional().describe("GPS coordinates"),
  transitOptions: z.array(TransitOptionSchema).optional().describe("Commute or transit directions"),
  workingHours: z.string().optional().describe("Operating hours"),
  timezone: z.string().optional().describe("Local timezone"),
  notes: z.string().optional().describe("Helpful arrival or check-in notes"),
});

// 11. Schema for ExecutiveBrief
export const BriefDetailSchema = z.object({
  title: z.string().describe("Aspect or subtopic title"),
  content: z.string().describe("Detailed factual explanation"),
  category: z.string().optional().describe("Domain category tag"),
});

export const BriefKeyFactSchema = z.object({
  label: z.string().describe("Fact label"),
  value: z.string().describe("Fact value"),
});

export const ExecutiveBriefSchema = z.object({
  topic: z.string().describe("Brief topic or synthesized subject"),
  takeaway: z.string().describe("Core high-priority takeaway statement"),
  details: z.array(BriefDetailSchema).optional().describe("Structured subtopic breakdowns"),
  keyFacts: z.array(BriefKeyFactSchema).optional().describe("Key facts or metric indicators"),
  sourceContext: z.string().optional().describe("Context reference or document origin"),
});

// OpenUI Component Definitions
export const OpenUITechGrid = defineComponent({
  name: "TechGrid",
  props: TechGridSchema,
  description: "Interactive technology and SDK showcase with local verified brand SVG logos. items is an array of technology strings or objects.",
  component: ({ props }) => <TechGridComponent {...(props as any)} />,
});

export const OpenUIProductGrid = defineComponent({
  name: "ProductGrid",
  props: ProductGridSchema,
  description: "Bespoke product catalog with featured solution hero card and compact sibling cards. products is an array of product objects.",
  component: ({ props }) => <ProductGridComponent {...(props as any)} />,
});

export const OpenUIPricingGrid = defineComponent({
  name: "PricingGrid",
  props: PricingGridSchema,
  description: "Tiered SaaS pricing plans with automatic recommendation emphasis and price typography. plans is an array of plan objects.",
  component: ({ props }) => <PricingGridComponent {...(props as any)} />,
});

export const OpenUIMetricGrid = defineComponent({
  name: "MetricGrid",
  props: MetricGridSchema,
  description: "High-impact KPI statistics and indicators with change badges and category icons. metrics is an array of metric objects.",
  component: ({ props }) => <MetricGridComponent {...(props as any)} />,
});

export const OpenUIEnhancedTagBlock = defineComponent({
  name: "TagBlock",
  props: TagBlockSchema,
  description: "tags is an array of strings. Enhanced with automatic brand SVG icons.",
  component: ({ props }) => <EnhancedTagBlockComponent tags={(props as any).tags} />,
});

export const OpenUIGraphicBanner = defineComponent({
  name: "GraphicBanner",
  props: GraphicBannerSchema,
  description: "Dynamic procedural graphic banner with perspective wireframe grid and luminous radial glows. title is required.",
  component: ({ props }) => <GraphicBannerComponent {...(props as any)} />,
});

export const OpenUIOverviewCard = defineComponent({
  name: "OverviewCard",
  props: OverviewCardSchema,
  description: "Comprehensive enterprise overview card with brand logo, synopsis, founded/HQ stats, and 4-pillar capability breakdown.",
  component: ({ props }) => <OverviewCardComponent {...(props as any)} />,
});

export const OpenUIServiceGrid = defineComponent({
  name: "ServiceGrid",
  props: ServiceGridSchema,
  description: "Rich visual service catalog with banner image integration, category tags, executive descriptions, and competency bullet points.",
  component: ({ props }) => <ServiceGridComponent {...(props as any)} />,
});

export const OpenUICompetitorGrid = defineComponent({
  name: "CompetitorGrid",
  props: CompetitorGridSchema,
  description: "Competitive landscape comparison with peer SVG brand logos, market positioning badges, and strategic differentiators.",
  component: ({ props }) => <CompetitorGridComponent {...(props as any)} />,
});

export const OpenUIGeoCard = defineComponent({
  name: "GeoCard",
  props: GeoCardSchema,
  description: "Location, campus, and transit guidance card with multimodal commute options (air, train, transit, road) and operating hours.",
  component: ({ props }) => <GeoCardComponent {...(props as any)} />,
});

export const OpenUIExecutiveBrief = defineComponent({
  name: "ExecutiveBrief",
  props: ExecutiveBriefSchema,
  description: "Universal executive brief for general, arbitrary, or synthesized queries with a key takeaway callout, structured details, and fact metrics.",
  component: ({ props }) => <ExecutiveBriefComponent {...(props as any)} />,
});

export const genuiComponentGroups = [
  ...openuiComponentGroups,
  {
    name: "Company Intelligence",
    components: [
      "OverviewCard",
      "ServiceGrid",
      "ProductGrid",
      "PricingGrid",
      "TechGrid",
      "CompetitorGrid",
      "GeoCard",
      "MetricGrid",
      "ExecutiveBrief",
      "GraphicBanner",
    ],
    notes: [
      "- OverviewCard: Comprehensive enterprise overview with logo, executive synopsis, metadata, and core pillars.",
      "- ServiceGrid: Rich visual service offerings with banner image slots, category tags, and capability bullets.",
      "- ProductGrid: Solution catalog with featured hero card and compact sibling cards.",
      "- PricingGrid: Tiered pricing plans in a horizontal layout with prices, features, and highlighted tiers.",
      "- TechGrid: Displays verified brand SVG logos for all listed technologies and tools.",
      "- CompetitorGrid: Side-by-side peer landscape with brand SVGs and strategic differentiators.",
      "- GeoCard: Office locations, addresses, and multimodal transit/commute routes (air, train, car, transit).",
      "- MetricGrid: High-impact KPI statistics, deltas, and trends.",
      "- ExecutiveBrief: Universal intelligent card for any query with bold takeaway, facts, and breakdown.",
      "- GraphicBanner: Luminous procedural grid banner for visual topic header accents.",
    ],
  },
];

/**
 * Custom Company-Intelligence OpenUI Library.
 * Combines the baseline openuiLibrary with specialized, high-hierarchy GenUI components.
 */
export const genuiLibrary = createLibrary({
  root: "Stack",
  componentGroups: genuiComponentGroups,
  components: [
    ...Object.values(openuiLibrary.components).filter((c) => c.name !== "TagBlock"),
    OpenUIEnhancedTagBlock,
    OpenUITechGrid,
    OpenUIProductGrid,
    OpenUIPricingGrid,
    OpenUIMetricGrid,
    OpenUIGraphicBanner,
    OpenUIOverviewCard,
    OpenUIServiceGrid,
    OpenUICompetitorGrid,
    OpenUIGeoCard,
    OpenUIExecutiveBrief,
  ],
});
