import { Plan } from "../dsl/schema";
import type { AnswerJson } from "../adapters/rag";

export interface ValidationJson {
  ok: boolean;
  schemaValid: boolean;
  dropped: { sceneId: string; reason: string }[];
  keptScenes: string[];
  errors: string[];
  video: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Deterministic checks only (no model judge in v0). */
export function runValidation(answer: AnswerJson, planRaw: any): { plan: any; validation: ValidationJson } {
  const errors: string[] = [];
  const parsed = Plan.safeParse(planRaw);
  if (!parsed.success) {
    return {
      plan: planRaw,
      validation: {
        ok: false,
        schemaValid: false,
        dropped: [],
        keptScenes: [],
        errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        video: false,
      },
    };
  }
  const plan = parsed.data;
  if (!plan.video) {
    return { plan, validation: { ok: true, schemaValid: true, dropped: [], keptScenes: [], errors: [], video: false } };
  }
  const byId = new Map(answer.chunks.map((c) => [c.id, c.text]));
  const dropped: { sceneId: string; reason: string }[] = [];
  const kept: any[] = [];
  for (const s of plan.scenes) {
    const bad = s.sources.find((src) => !byId.has(src.chunkId));
    if (bad) {
      dropped.push({ sceneId: s.id, reason: `unknown chunkId ${bad.chunkId}` });
      continue;
    }
    const badQuote = s.sources.find((src) => {
      if (!src.quote) return false;
      const chunk = norm(byId.get(src.chunkId) || "");
      return src.quote.length > 8 && !chunk.includes(norm(src.quote).slice(0, 40));
    });
    if (badQuote) {
      dropped.push({ sceneId: s.id, reason: `quote not found in chunk ${badQuote.chunkId}` });
      continue;
    }
    kept.push(s);
  }
  const video = kept.length >= 2;
  if (!video && kept.length > 0) errors.push(`only ${kept.length} scenes survived grounding, need >=2`);
  const finalPlan = { ...plan, scenes: kept, video };
  return {
    plan: finalPlan,
    validation: {
      ok: video,
      schemaValid: true,
      dropped,
      keptScenes: kept.map((k) => k.id),
      errors,
      video,
    },
  };
}
