import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { SceneFrame } from "./components/SceneFrame";
import { topology, nodeWidth, isRevealed } from "../src/layout/rules";
import type { VideoTheme } from "../src/adapters/brand";

export interface VideoProps {
  plan: any;
  theme: VideoTheme;
  timeline: { scenes: { id: string; type: string; startFrame: number; durationFrames: number; revealFrames: number[] }[]; totalFrames: number };
}

function NodeCard({ label, theme, width }: { label: string; theme: VideoTheme; width: number }) {
  return (
    <div style={{ width, borderRadius: 18, backgroundColor: "rgba(127,127,127,0.14)", border: `3px solid ${theme.primary}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 22, gap: 8 }}>
      <div style={{ fontSize: 40 }}>⬢</div>
      <div style={{ color: theme.text, fontSize: 25, fontWeight: 700, textAlign: "center", lineHeight: 1.25 }}>{label}</div>
    </div>
  );
}

function Arrow({ theme }: { theme: VideoTheme }) {
  return <div style={{ alignSelf: "center", color: theme.primary, fontSize: 52, fontWeight: 900, flexShrink: 0 }}>→</div>;
}

/** Gated by the node's own reveal entry; unlisted nodes show from scene start. */
function nodeVisible(id: string, reveals: { target: string }[], relReveals: number[], frame: number): boolean {
  const idx = reveals.findIndex((r) => r.target === id);
  if (idx === -1) return true;
  return isRevealed(relReveals, idx, frame);
}

function FlowBody({ scene, theme, relReveals }: { scene: any; theme: VideoTheme; relReveals: number[] }) {
  const frame = useCurrentFrame();
  const nodes: any[] = scene.nodes ?? [];
  const reveals: { target: string }[] = scene.reveals ?? [];
  const vis = (id: string) => nodeVisible(id, reveals, relReveals, frame);
  const w = nodeWidth(nodes.length);
  if (topology(nodes, scene.edges) === "hub") {
    const hub = nodes[0];
    const spokes = nodes.slice(1);
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40, height: "100%" }}>
        {vis(hub.id) ? <NodeCard label={hub.label} theme={theme} width={w} /> : <div style={{ width: w }} />}
        <div style={{ display: "flex", flexDirection: "column", gap: 18, justifyContent: "center" }}>
          {spokes.map((n) =>
            vis(n.id) ? (
              <div key={n.id} style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <Arrow theme={theme} />
                <NodeCard label={n.label} theme={theme} width={w} />
              </div>
            ) : null,
          )}
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, height: "100%" }}>
      {nodes.map((n, i) => (
        <React.Fragment key={n.id}>
          {vis(n.id) ? <NodeCard label={n.label} theme={theme} width={w} /> : <div style={{ width: w }} />}
          {i < nodes.length - 1 && vis(n.id) && vis(nodes[i + 1].id) ? <Arrow theme={theme} /> : <div style={{ width: 18 }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function ConceptBody({ scene, theme, relReveals }: { scene: any; theme: VideoTheme; relReveals: number[] }) {
  const frame = useCurrentFrame();
  const points: any[] = scene.points ?? [];
  const reveals: { target: string }[] = scene.reveals ?? [];
  return (
    <div style={{ display: "grid", gridTemplateColumns: points.length > 2 ? "1fr 1fr" : "1fr", gap: 20, height: "100%", alignContent: "center" }}>
      {points.map((p) => {
        if (!nodeVisible(p.id, reveals, relReveals, frame)) return <div key={p.id} />;
        return (
          <div key={p.id} style={{ borderRadius: 18, backgroundColor: "rgba(127,127,127,0.14)", borderLeft: `10px solid ${theme.primary}`, padding: "20px 24px" }}>
            <div style={{ color: theme.text, fontSize: 29, fontWeight: 800 }}>{p.label}</div>
            {p.detail ? <div style={{ color: theme.text, opacity: 0.8, fontSize: 22, marginTop: 6 }}>{p.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function SummaryBody({ scene, theme, relReveals }: { scene: any; theme: VideoTheme; relReveals: number[] }) {
  const frame = useCurrentFrame();
  const items: string[] = scene.takeaways ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, justifyContent: "center", height: "100%" }}>
      {items.map((t, i) => {
        const show = relReveals.length === 0 ? true : isRevealed(relReveals, Math.min(i, relReveals.length - 1), frame);
        if (!show) return <div key={i} style={{ height: 44 }} />;
        return (
          <div key={i} style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: theme.primary, color: "#fff", fontSize: 25, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {i + 1}
            </div>
            <div style={{ color: theme.text, fontSize: 29, fontWeight: 600 }}>{t}</div>
          </div>
        );
      })}
    </div>
  );
}

export function Video({ plan, theme, timeline }: VideoProps) {
  const byId = new Map((plan.scenes ?? []).map((s: any) => [s.id, s]));
  const total = timeline.scenes.length;
  return (
    <AbsoluteFill>
      {timeline.scenes.map((t, idx) => {
        const scene = byId.get(t.id);
        if (!scene) throw new Error(`[render] timeline references unknown scene ${t.id}`);
        const relReveals = (t.revealFrames ?? []).map((f) => f - t.startFrame);
        return (
          <Sequence key={t.id} from={t.startFrame} durationInFrames={t.durationFrames} premountFor={30} name={t.id}>
            <SceneFrame theme={theme} headline={scene.headline} caption={scene.caption} progress={(idx + 1) / total}>
              {scene.type === "flow" ? <FlowBody scene={scene} theme={theme} relReveals={relReveals} /> : null}
              {scene.type === "concept" ? <ConceptBody scene={scene} theme={theme} relReveals={relReveals} /> : null}
              {scene.type === "summary" ? <SummaryBody scene={scene} theme={theme} relReveals={relReveals} /> : null}
            </SceneFrame>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
}
