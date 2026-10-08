import { z } from "zod";
import { Plan } from "../dsl/schema";

export const PLANNER_SYSTEM = `You output Video DSL JSON only. No markdown, no prose.
Top-level keys EXACTLY: schemaVersion, video, reason, kind, title, scenes.
schemaVersion is always 1. kind is one of process|concept|architecture|timeline|comparison|metrics.
If video is false, scenes MUST be [].
Each scene MUST have EXACTLY these keys by type — no other keys, no flattened keys:

flow: id, headline, caption, sources, reveals, type="flow", nodes[{id,label,icon}], edges?[{from,to}]
concept: id, headline, caption, sources, reveals, type="concept", points[{id,label,detail?}]
summary: id, headline, caption, sources, reveals, type="summary", takeaways[string]

sources is ALWAYS [{chunkId, quote?}] — chunkId/photo-level, never a bare chunkId string on the scene.
reveals is ALWAYS [{target, action}] where target is a node/point id and action is show|highlight.
icon is one of user|api|database|browser|dashboard|document|gear|generic.

Rules: decide whether the answer benefits from a silent video; do NOT re-answer.
Use ONLY answer+chunks. No new steps/names/numbers. Every scene >=1 source with quote copied from that chunk.
video:false for: short factual, yes/no, pricing, security/compliance, <3 distinct steps, hedged answers.
Headlines ~8 words (<=60ch), captions <=2 sentences (<=140ch), node labels <=3 words (<=24ch). 3-6 scenes ending with summary.`;

const EXAMPLE = `{"schemaVersion":1,"video":true,"reason":"Multi-step onboarding process benefits from visual flow","kind":"process","title":"How onboarding works","scenes":[{"id":"s1","type":"flow","headline":"Create account and verify email","caption":"Sign up, confirm email, access dashboard.","sources":[{"chunkId":"CHUNK_ID_1","quote":"supporting span copied from chunk"}],"reveals":[{"target":"n1","action":"show"}],"nodes":[{"id":"n1","label":"Sign up","icon":"user"},{"id":"n2","label":"Verify email","icon":"browser"},{"id":"n3","label":"Dashboard","icon":"dashboard"}],"edges":[{"from":"n1","to":"n2"}]},{"id":"s2","type":"summary","headline":"Onboarding in three steps","sources":[{"chunkId":"CHUNK_ID_1"}],"reveals":[],"takeaways":["Sign up with email","Verify and log in","Explore the dashboard"]}]}`;

/** Structured-output wrapper (repo LLM client has no schema mode yet). */
export async function planStructured(opts: {
  apiKey?: string;
  model?: string;
  system: string;
  user: string;
}): Promise<{ raw: string; plan: z.infer<typeof Plan>; usage?: any }> {
  const apiKey = opts.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing for planner");
  const model = opts.model || process.env.VIDEO_PLANNER_MODEL || "gpt-4o-mini";
  const mkBody = (system: string, user: string) => ({
    model,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: `${user}\n\nValid example shape (use real chunkIds/quotes, not these placeholders):\n${EXAMPLE}` },
    ],
  });
  function extractJson(text: string): string {
    const t = (text || "").trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return t.slice(a, b + 1);
    return t;
  }
  async function callonce(user: string, extraHint?: string): Promise<{ text: string; usage?: any }> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(
        extraHint
          ? { ...mkBody(opts.system, user), messages: [...mkBody(opts.system, user).messages, { role: "user", content: `Previous output was invalid. Fix these errors, keep exact keys, return JSON only:\n${extraHint}` }] }
          : mkBody(opts.system, user),
      ),
    });
    if (!res.ok) throw new Error(`OpenAI planner ${res.status}: ${(await res.text()).slice(0, 500)}`);
    const j: any = await res.json();
    return { text: j.choices?.[0]?.message?.content ?? "", usage: j.usage };
  }
  function tryParse(text: string) {
    try {
      return Plan.safeParse(JSON.parse(extractJson(text)));
    } catch (e: any) {
      return { success: false as const, error: { issues: [{ path: ["json"], message: `unparseable: ${String(e?.message || e).slice(0, 200)}` }] } } as any;
    }
  }
  const first = await callonce(opts.user);
  let parsed: any = tryParse(first.text);
  if (!parsed.success) {
    const err = parsed.error.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 2000);
    const second = await callonce(opts.user, err);
    parsed = tryParse(second.text);
    if (!parsed.success) {
      throw new Error(`[plan] schema-invalid after retry: ${parsed.error.issues.map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 1000)}\nRAW:${extractJson(second.text).slice(0, 800)}`);
    }
    return { raw: second.text, plan: parsed.data, usage: second.usage };
  }
  return { raw: first.text, plan: parsed.data, usage: first.usage };
}
