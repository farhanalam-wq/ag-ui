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
  theme: Pick<WidgetTheme, "primary" | "secondary" | "radius"> & {
    logoUrl?: string | null;
  };
  label?: string;
}

/**
 * Static launcher-button preview styled exactly like the loader orb: same
 * 56px circle, same hover swap to secondary, same logo-mark treatment.
 */
export function StudioOrbPreview({
  theme,
  label = "Open chat assistant",
}: StudioOrbPreviewProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="inline-flex shrink-0 items-center justify-center text-white"
      style={{
        width: ORB_SIZE,
        height: ORB_SIZE,
        borderRadius: 9999,
        border: "none",
        cursor: "default",
        background: theme.primary,
        fontSize: 24,
        lineHeight: 1,
        boxShadow: "0 8px 30px rgba(0,0,0,.35)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          theme.secondary;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          theme.primary;
      }}
    >
      {theme.logoUrl ? (
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
        <span aria-hidden="true">✦</span>
      )}
    </button>
  );
}
