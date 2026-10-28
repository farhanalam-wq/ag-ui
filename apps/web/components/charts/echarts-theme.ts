"use client";

/**
 * apps/web/components/charts/echarts-theme.ts
 *
 * ECharts design tokens, resolved. ECharts draws to canvas through zrender's
 * own colour parser, which cannot read `hsl(var(--chart-1))` — so this hook
 * resolves the design tokens to concrete values and re-resolves them when
 * the document root flips between light and dark (next-themes toggles the
 * class on <html>; it is watched, not assumed).
 *
 * Kept apart from the island wrapper (`echarts.tsx`) so a view can read the
 * palette for per-node colours without importing the ECharts bundle into the
 * page module.
 */

import { useEffect, useMemo, useState } from "react";

/** Chart tokens in the order the Recharts palette takes them (DESIGN.md §8.1). */
const CHART_VARS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  "--chart-8",
] as const;

function cssVar(name: string): string | null {
  if (typeof window === "undefined") return null;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || null;
}

/** "H S% L%" tokens resolve to `hsl(...)`; a full colour passes through. */
function resolve(name: string): string | null {
  const raw = cssVar(name);
  if (!raw) return null;
  return /^\d/.test(raw) ? `hsl(${raw})` : raw;
}

export interface EChartsTheme {
  /** The resolved token palette, chart-1 .. chart-8. */
  palette: string[];
  /** Muted text colour for axes and labels. */
  text: string;
  /** Grid/edge line colour. */
  border: string;
  /** Card surface colour (tooltip background). */
  surface: string;
  /** Changes on every light/dark flip, so consumers recompute their options. */
  mode: "light" | "dark";
}

export function useEChartsTheme(): EChartsTheme {
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    const root = document.documentElement;
    const read = () => setMode(root.classList.contains("dark") ? "dark" : "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return useMemo(() => {
    const palette = CHART_VARS.map((v) => resolve(v)).filter((c): c is string => c !== null);
    return {
      // The fallback mirrors the token palette's role order; it exists so a
      // chart never renders colourless, not as a second brand.
      palette: palette.length > 0 ? palette : ["#2563eb", "#059669", "#f59e0b", "#a855f7", "#0ea5e9", "#ef4444", "#71717a", "#a1a1aa"],
      text: resolve("--muted-foreground") ?? "#71717a",
      border: resolve("--border") ?? "#e4e4e7",
      surface: resolve("--card") ?? "#ffffff",
      mode,
    };
  }, [mode]);
}
