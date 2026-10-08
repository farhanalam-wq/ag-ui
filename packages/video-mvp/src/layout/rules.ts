// Shared layout rules — single source for DOM story UI and Remotion video.
// Pure functions only (no React, no Remotion hooks) so both renderers stay identical.
// Canvas: 1280x720. Frame chrome: progress bar 8px top, padding 72px sides.

export const CANVAS = { w: 1280, h: 720, padX: 72, padTop: 64, padBottom: 40, bar: 8 };
export const BODY_W = CANVAS.w - CANVAS.padX * 2; // 1136

/** Rough line estimator for wrapping text at a given font size (avg 0.52em per char). */
export function estimateLines(text: string | undefined, fontSize: number, maxWidth: number): number {
  if (!text) return 0;
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const need = (cur === 0 ? 0 : 1) + w.length;
    if (cur + need <= perLine) cur += need;
    else {
      lines++;
      cur = w.length;
    }
  }
  return lines;
}

export interface HeaderZone {
  headlineLines: number;
  captionLines: number;
  /** Total header block height including gaps. Body must start below this. */
  height: number;
}

/** Header block: headline 54px/1.15 + caption 27px/1.4. Clamped to budgets. */
export function headerZone(headline: string, caption?: string): HeaderZone {
  const headlineLines = Math.min(2, estimateLines(headline, 54, BODY_W - 30));
  const captionLines = Math.min(2, estimateLines(caption, 27, 1020));
  const height =
    CANVAS.padTop +
    headlineLines * 62 +
    (captionLines > 0 ? 14 + captionLines * 38 : 0) +
    CANVAS.padBottom;
  return { headlineLines, captionLines, height };
}

export type Topology = "chain" | "hub";

/** Branching edges (one node fanning to 2+) render hub-and-spoke, else chain. */
export function topology(nodes: { id: string }[], edges?: { from: string; to: string }[]): Topology {
  if (!edges || edges.length === 0) return nodes.length <= 3 ? "chain" : "chain";
  const outCount = new Map<string, number>();
  for (const e of edges) outCount.set(e.from, (outCount.get(e.from) ?? 0) + 1);
  return [...outCount.values()].some((n) => n >= 2) ? "hub" : "chain";
}

/** Node card width so N nodes + arrows fit BODY_W. Arrows ~54px each. */
export function nodeWidth(count: number): number {
  const arrows = Math.max(0, count - 1) * 54;
  return Math.min(260, Math.floor((BODY_W - arrows) / Math.max(1, count)));
}

/** Item visible once the playhead passes its reveal frame (or frame 0 when no reveals). */
export function isRevealed(revealFrames: number[], index: number, frame: number): boolean {
  if (revealFrames.length === 0) return true;
  const at = revealFrames[Math.min(index, revealFrames.length - 1)];
  return frame >= at;
}

/** Vertical layout for a scene: header height + body rect. Guarantees no overlap. */
export function sceneLayout(headline: string, caption?: string): { headerHeight: number; bodyY: number; bodyH: number } {
  const headerHeight = Math.min(330, headerZone(headline, caption).height);
  const bodyY = headerHeight;
  const bodyH = CANVAS.h - headerHeight - 56;
  return { headerHeight, bodyY, bodyH };
}
