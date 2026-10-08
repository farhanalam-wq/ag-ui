// Deterministic duration rules. Renderer owns time; LLM never sets durations.
export const FPS = 30;

export function words(s: string | undefined): number {
  if (!s) return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function sceneSeconds(headline: string, caption: string | undefined, revealCount: number): number {
  const raw = 2.0 + 0.5 * revealCount + words(`${headline} ${caption ?? ""}`) / 4.0;
  return Math.min(9.0, Math.max(3.0, raw)) + 0.8;
}

export interface TimelineScene {
  id: string;
  type: string;
  startFrame: number;
  durationFrames: number;
  revealFrames: number[];
}

export function resolveTimeline(
  scenes: { id: string; type: string; headline: string; caption?: string; reveals: { target: string }[] }[],
): { scenes: TimelineScene[]; totalFrames: number; totalSeconds: number } {
  let cursor = 0;
  const out: TimelineScene[] = scenes.map((s) => {
    const secs = sceneSeconds(s.headline, s.caption, s.reveals.length);
    const durationFrames = Math.round(secs * FPS);
    // Even stagger across first 60% of scene
    const revealFrames = s.reveals.map((_, i) =>
      Math.round(cursor + (durationFrames * 0.6 * (i + 1)) / (s.reveals.length + 1)),
    );
    const row = { id: s.id, type: s.type, startFrame: cursor, durationFrames, revealFrames };
    cursor += durationFrames;
    return row;
  });
  // Cap 45s: drop lowest-priority middle scenes (keep first + summary last)
  let totalFrames = cursor;
  while (totalFrames / FPS > 45 && out.length > 2) {
    const dropIdx = 1; // lowest-priority middle = earliest middle
    const dropped = out.splice(dropIdx, 1)[0];
    totalFrames -= dropped.durationFrames;
    // rebase start frames
    let c = 0;
    for (const t of out) {
      t.startFrame = c;
      c += t.durationFrames;
    }
    totalFrames = c;
  }
  return { scenes: out, totalFrames, totalSeconds: totalFrames / FPS };
}
