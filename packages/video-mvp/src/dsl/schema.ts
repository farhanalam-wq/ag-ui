import { z } from "zod";

// Video DSL v1 — semantic only. No coordinates, colors, sizes, absolute times.
// Single source of truth. All parsing uses .strict().

export const SourceRef = z
  .object({
    chunkId: z.string().min(1),
    quote: z.string().max(200).optional(),
  })
  .strict();

export const Reveal = z
  .object({
    target: z.string().min(1),
    action: z.enum(["show", "highlight"]),
  })
  .strict();

const Base = z.object({
  id: z.string().min(1),
  headline: z.string().min(1).max(60),
  caption: z.string().max(140).optional(),
  sources: z.array(SourceRef).min(1),
  reveals: z.array(Reveal).default([]),
});

export const FlowScene = Base.extend({
  type: z.literal("flow"),
  nodes: z
    .array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1).max(24),
          icon: z
            .enum(["user", "api", "database", "browser", "dashboard", "document", "gear", "generic"])
            .default("generic"),
        })
        .strict(),
    )
    .min(2)
    .max(6),
  edges: z.array(z.object({ from: z.string(), to: z.string() }).strict()).optional(),
}).strict();

export const ConceptScene = Base.extend({
  type: z.literal("concept"),
  points: z
    .array(
      z
        .object({
          id: z.string().min(1),
          label: z.string().min(1).max(30),
          detail: z.string().max(80).optional(),
        })
        .strict(),
    )
    .min(1)
    .max(4),
}).strict();

export const SummaryScene = Base.extend({
  type: z.literal("summary"),
  takeaways: z.array(z.string().min(1).max(80)).min(1).max(4),
}).strict();

export const Scene = z.discriminatedUnion("type", [FlowScene, ConceptScene, SummaryScene]);

export const Plan = z
  .object({
    schemaVersion: z.literal(1),
    video: z.boolean(),
    reason: z.string().min(1),
    kind: z.enum(["process", "concept", "architecture", "timeline", "comparison", "metrics"]).optional(),
    title: z.string().max(70).optional(),
    scenes: z.array(Scene).max(7),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.video && p.scenes.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "video:false must have empty scenes" });
    }
    if (p.video && p.scenes.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "video:true needs >=2 scenes" });
    }
  });

export type VideoPlan = z.infer<typeof Plan>;
export type VideoScene = z.infer<typeof Scene>;
