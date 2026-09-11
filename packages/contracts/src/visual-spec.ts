import { z } from "zod";

export const StatsItemSchema = z.object({
  label: z.string(),
  value: z.string(),
  change: z.string().optional(),
});

export const PricingPlanSchema = z.object({
  name: z.string(),
  price: z.string(),
  period: z.string().optional(),
  features: z.array(z.string()),
  highlighted: z.boolean().optional(),
});

export const TimelineEventSchema = z.object({
  date: z.string(),
  title: z.string(),
  description: z.string(),
});

export const ProductItemSchema = z.object({
  name: z.string(),
  description: z.string(),
  tag: z.string().optional(),
  link: z.string().optional(),
});

export const ComparisonRowSchema = z.object({
  feature: z.string(),
  values: z.array(z.union([z.string(), z.boolean()])),
});

export const MapMarkerSchema = z.object({
  label: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
});

export const VisualSpecSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stats"),
    props: z.object({
      title: z.string(),
      items: z.array(StatsItemSchema),
    }),
  }),
  z.object({
    type: z.literal("pricing"),
    props: z.object({
      plans: z.array(PricingPlanSchema),
    }),
  }),
  z.object({
    type: z.literal("timeline"),
    props: z.object({
      events: z.array(TimelineEventSchema),
    }),
  }),
  z.object({
    type: z.literal("products"),
    props: z.object({
      products: z.array(ProductItemSchema),
    }),
  }),
  z.object({
    type: z.literal("comparison"),
    props: z.object({
      headers: z.array(z.string()),
      rows: z.array(ComparisonRowSchema),
    }),
  }),
  z.object({
    type: z.literal("map"),
    props: z.object({
      title: z.string().optional(),
      center: z.object({ lat: z.number(), lng: z.number() }),
      zoom: z.number().optional(),
      markers: z.array(MapMarkerSchema),
    }),
  }),
]);

export type VisualSpec = z.infer<typeof VisualSpecSchema>;
