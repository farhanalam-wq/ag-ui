import React from "react";
import { z } from "zod/v4";
import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { openuiLibrary, openuiComponentGroups } from "@openuidev/react-ui";
import { TechGrid as TechGridComponent } from "../components/tech-grid";
import { ProductGrid as ProductGridComponent } from "../components/product-grid";
import { PricingGrid as PricingGridComponent } from "../components/pricing-grid";
import { MetricGrid as MetricGridComponent } from "../components/metric-grid";
import { EnhancedTagBlock as EnhancedTagBlockComponent } from "../components/enhanced-tag-block";

// Schema for TechGrid
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

// Schema for ProductGrid
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

// Schema for PricingGrid
export const PricingPlanItemSchema = z.object({
  name: z.string().describe("Plan tier name, e.g. Free, Pro, Enterprise"),
  price: z.string().describe("Price string, e.g. $0 / mo, $20 / mo, Custom Quote"),
  period: z.string().optional().describe("Billing period, e.g. month, year"),
  description: z.string().optional().describe("Short target audience description"),
  features: z.array(z.string()).describe("List of included capabilities"),
  recommended: z.boolean().optional().describe("Whether this tier is marked Most Popular / Recommended"),
  ctaLabel: z.string().optional().describe("Button label, e.g. Get Started, Deploy Pro"),
});

export const PricingGridSchema = z.object({
  plans: z.array(PricingPlanItemSchema).describe("List of pricing tiers"),
  title: z.string().optional().describe("Optional section title"),
});

// Schema for MetricGrid
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

// Schema for TagBlock
export const TagBlockSchema = z.object({
  tags: z.array(z.string()).describe("List of tag labels"),
});

// Define OpenUI Components
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

export const genuiComponentGroups = [
  ...openuiComponentGroups,
  {
    name: "Company Intelligence",
    components: ["TechGrid", "ProductGrid", "PricingGrid", "MetricGrid"],
    notes: [
      "- TechGrid displays verified brand SVG logos for all listed technologies, frameworks, and tools.",
      "- ProductGrid creates a high-hierarchy showcase with a featured hero solution card and compact sibling cards.",
      "- PricingGrid formats SaaS subscription tiers with pricing numbers, checklists, and highlighted popular plans.",
      "- MetricGrid renders large KPI numbers, deltas/trends, and category icons for performance or analytics.",
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
  ],
});
