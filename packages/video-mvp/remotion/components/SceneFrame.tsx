import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import type { VideoTheme } from "../../src/adapters/brand";

/** Flex-column frame: header zone sizes from content, body takes the rest. Overlap impossible. */
export function SceneFrame({
  theme,
  headline,
  caption,
  progress,
  children,
}: {
  theme: VideoTheme;
  headline: string;
  caption?: string;
  progress: number;
  children?: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = interpolate(frame, [0, Math.round(0.4 * fps)], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const rise = interpolate(frame, [0, Math.round(0.5 * fps)], [24, 0], {
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <AbsoluteFill style={{ backgroundColor: theme.background, fontFamily: `${theme.fontBody}, Inter, system-ui, sans-serif` }}>
      <div style={{ height: 8, backgroundColor: "rgba(127,127,127,0.25)", flexShrink: 0 }}>
        <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", backgroundColor: theme.primary }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "56px 72px 48px", opacity: fade, translate: `0px ${rise}px` }}>
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 14, height: 40, borderRadius: 7, backgroundColor: theme.primary, flexShrink: 0 }} />
            <h1 style={{ color: theme.text, fontSize: 54, fontWeight: 800, margin: 0, lineHeight: 1.15, fontFamily: `${theme.fontHeading}, Inter, system-ui, sans-serif`, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {headline}
            </h1>
          </div>
          {caption ? (
            <p style={{ color: theme.text, opacity: 0.82, fontSize: 27, maxWidth: 1020, lineHeight: 1.4, margin: "14px 0 0", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {caption}
            </p>
          ) : null}
        </div>
        <div style={{ flex: 1, minHeight: 0, marginTop: 28 }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
}
