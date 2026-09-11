import { z } from "zod";
import { VisualSpecSchema } from "./visual-spec";

export const EvidenceSchema = z.object({
  sourceId: z.string(),
  url: z.string().url(),
  pageTitle: z.string(),
  snippet: z.string(),
  type: z.enum(["fact", "chunk"]),
  score: z.number(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const AnswerSchema = z.object({
  text: z.string(),
  evidence: z.array(EvidenceSchema),
  visual: VisualSpecSchema.optional(),
  speech: z
    .object({
      ssml: z.string().optional(),
      text: z.string(),
    })
    .optional(),
});
export type Answer = z.infer<typeof AnswerSchema>;
