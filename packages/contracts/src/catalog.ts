import { z } from "zod";

/**
 * Zod schemas for structured Company Intelligence components.
 */

export const OpenUIPricingPlanSchema = z.object({
  name: z.string().describe("Name of the pricing tier, e.g. Free, Pro, Enterprise"),
  price: z.string().describe("Price string, e.g. $0/mo, $20/mo, Custom"),
  period: z.string().optional().describe("Billing period, e.g. /month, /year"),
  features: z.array(z.string()).describe("List of included feature bullets"),
  highlighted: z.boolean().optional().describe("Whether this plan is marked as Popular/Recommended"),
  limits: z.string().optional().describe("Usage limits, e.g. 50k emails/month"),
});
export type OpenUIPricingPlan = z.infer<typeof OpenUIPricingPlanSchema>;

export const OpenUIProductItemSchema = z.object({
  name: z.string().describe("Product or service title"),
  description: z.string().describe("Clear executive summary of capability"),
  tag: z.string().optional().describe("Category tag, e.g. SMTP, Webhooks, Storage"),
  link: z.string().optional().describe("External URL or documentation link"),
});
export type OpenUIProductItem = z.infer<typeof OpenUIProductItemSchema>;

export const MetricItemSchema = z.object({
  label: z.string().describe("Metric label, e.g. Delivery Rate, Global Latency"),
  value: z.string().describe("Key numeric value, e.g. 99.8%, <100ms"),
  change: z.string().optional().describe("Percentage or trend, e.g. +12% MoM"),
  trend: z.enum(["up", "down", "neutral"]).optional(),
});
export type MetricItem = z.infer<typeof MetricItemSchema>;

export const OpenUIComparisonRowSchema = z.object({
  feature: z.string().describe("Feature name or protocol capability"),
  values: z.array(z.string()).describe("Value per tier or product column"),
});
export type OpenUIComparisonRow = z.infer<typeof OpenUIComparisonRowSchema>;

/**
 * OpenUI Component Names supported across our Generative UI pipeline.
 */
export const OPENUI_COMPONENTS = {
  STACK: "Stack",
  CARD: "Card",
  CARD_HEADER: "CardHeader",
  TEXT_CONTENT: "TextContent",
  TABLE: "Table",
  COL: "Col",
  BAR_CHART: "BarChart",
  LINE_CHART: "LineChart",
  AREA_CHART: "AreaChart",
  SERIES: "Series",
  TABS: "Tabs",
  TAB_ITEM: "TabItem",
  CALLOUT: "Callout",
  TAG: "Tag",
  TAG_BLOCK: "TagBlock",
  BUTTON: "Button",
  BUTTONS: "Buttons",
} as const;

export type OpenUIComponentName = (typeof OPENUI_COMPONENTS)[keyof typeof OPENUI_COMPONENTS];
