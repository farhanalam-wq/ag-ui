/**
 * Widget prop contracts shared by the renderer (React) and the analytics
 * spec builder (server). Zod-only on purpose: importing this module must
 * never pull React or openuidev into server bundles.
 */
import { z } from "zod/v4";

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

export const AnalyticsTrendPointSchema = z.object({
  label: z.string().describe("Axis label, e.g. day or bucket"),
  value: z.number().describe("Numeric value for the point"),
});

export const AnalyticsTrendSchema = z.object({
  points: z.array(AnalyticsTrendPointSchema).max(90).describe("Ordered trend points (at most 90 daily buckets)"),
  variant: z.enum(["line", "bar"]).optional().describe("Render style (default line)"),
  title: z.string().optional().describe("Optional widget title"),
});

export const AnalyticsTableRowSchema = z.object({
  label: z.string().describe("Row label"),
  pageviews: z.number().describe("Views for the row"),
  sessions: z.number().describe("Sessions for the row"),
});

export const AnalyticsTableSchema = z.object({
  rows: z.array(AnalyticsTableRowSchema).max(10).describe("Ranked rows (at most 10)"),
  title: z.string().optional().describe("Optional widget title"),
});
