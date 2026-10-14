"use client";

import type { WidgetTheme } from "@ag-ui/shared/client";

// Launcher + panel dimensions. Mirrors apps/web/public/embed.js
// (ORB_SIZE / PANEL_W / PANEL_H, orb cssText, frame cssText, sandbox + allow
// attributes). Keep the two in sync when either changes.
export const ORB_SIZE = 56;
export const PANEL_W = 400;
export const PANEL_H = 600;
export const PANEL_SANDBOX =
  "allow-scripts allow-same-origin allow-forms allow-popups";
export const PANEL_ALLOW = "microphone; autoplay";

interface StudioOrbPreviewProps {
  theme: Pick<
    WidgetTheme,
    | "primary"
    | "secondary"
    | "launcherRadius"
    | "launcherMode"
    | "launcherGlyph"
    | "launcherBg"
    | "launcherHover"
    | "launcherBorder"
  > & {
    logoUrl?: string | null;
  };
  label?: string;
}

/**
 * Static launcher-button preview styled like the loader orb: 56px circle,
 * hover swap to secondary, logo-mark treatment. Modes: auto (logo when
 * available, else brand glyph), glyph, brand (glyph on primary), logo.
 */
export function StudioOrbPreview({
  theme,
  label = "Open chat assistant",
}: StudioOrbPreviewProps) {
  const showLogo =
    theme.launcherMode === "logo" ||
    (theme.launcherMode === "auto" && !!theme.logoUrl);
  const bg = theme.launcherBg ?? theme.primary;
  const hover = theme.launcherHover ?? theme.secondary;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center text-white"
      style={{
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: theme.launcherRadius,
        border: theme.launcherBorder ? `1px solid ${theme.launcherBorder}` : "none",
        cursor: "default",
        background: bg,
        fontSize: 24,
        lineHeight: 1,
        boxShadow: "0 8px 30px rgba(0,0,0,.35)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = hover;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = bg;
      }}
    >
      {showLogo && theme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={theme.logoUrl}
          alt=""
          aria-hidden="true"
          style={{ width: "60%", height: "60%", objectFit: "contain" }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span aria-hidden="true">{theme.launcherGlyph}</span>
      )}
    </button>
  );
}
