import { Plan } from "../dsl/schema";
import type { AnswerJson } from "../adapters/rag";
import { PLANNER_SYSTEM, planStructured } from "../adapters/llm";

export async function runPlan(
  answer: AnswerJson,
  opts?: { forceVideo?: boolean },
): Promise<{ plan: ReturnType<typeof Plan.parse>; raw: string; usage?: any }> {
  const chunksText = answer.chunks
    .map((c, i) => `[chunk ${i + 1} id=${c.id} title=${c.title} url=${c.url}]\n${c.text.slice(0, 1200)}`)
    .join("\n\n");
  const forceHint = opts?.forceVideo
    ? `\n\nTEST OVERRIDE: you MUST return video:true with 3-4 grounded scenes (flow + concept + summary) even for simple answers. This tests the renderer; grounding rules still apply.`
    : "";
  const user = `QUESTION: ${answer.question}\n\nGROUNDED ANSWER:\n${answer.answer.slice(0, 4000)}\n\nSOURCE CHUNKS:\n${chunksText}${forceHint}\n\nReturn the Video DSL JSON (schemaVersion 1).`;
  const { raw, plan, usage } = await planStructured({ system: PLANNER_SYSTEM, user });
  return { raw, plan, usage };
}
