import { resolveTimeline } from "../dsl/durations";

export function runResolve(plan: any) {
  const scenes = (plan.scenes ?? []).map((s: any) => ({
    id: s.id,
    type: s.type,
    headline: s.headline,
    caption: s.caption,
    reveals: s.reveals ?? [],
  }));
  const timeline = resolveTimeline(scenes);
  return { timeline, plan };
}
