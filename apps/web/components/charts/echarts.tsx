"use client";

/**
 * apps/web/components/charts/echarts.tsx
 *
 * The ECharts island: the one wrapper every ECharts surface loads with
 * `dynamic(..., { ssr: false })`, so the bundle never joins the first paint
 * and no surface re-implements init/dispose/theme (DESIGN.md §8.1 — ECharts
 * only for the bubble/cluster layouts Recharts cannot express).
 *
 * The theme merges *under* the caller's option, so a chart option names its
 * shape and never hardcodes a colour; option identity changes on every
 * light/dark flip, which is what drives the rebuild.
 */

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { useEChartsTheme, type EChartsTheme } from "./echarts-theme";

export type { EChartsTheme } from "./echarts-theme";
export { useEChartsTheme } from "./echarts-theme";

/** Merge the theme under the caller's option. Caller values win. */
export function withTheme(option: EChartsOption, theme: EChartsTheme): EChartsOption {
  return {
    color: theme.palette,
    textStyle: { color: theme.text },
    ...option,
  };
}

export function EChart({
  option,
  height = 280,
  onEvents,
  className,
  ariaLabel,
}: {
  option: EChartsOption;
  height?: number;
  onEvents?: Record<string, (params: unknown) => void>;
  className?: string;
  /** The one sentence a screen reader meets instead of the canvas. */
  ariaLabel?: string;
}) {
  const theme = useEChartsTheme();
  const merged = useMemo(() => withTheme(option, theme), [option, theme]);
  return (
    <div className={className} role="img" aria-label={ariaLabel}>
      <ReactECharts
        option={merged}
        notMerge
        lazyUpdate
        style={{ height, width: "100%" }}
        opts={{ renderer: "canvas" }}
        onEvents={onEvents}
      />
    </div>
  );
}
