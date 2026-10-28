"use client";

/**
 * apps/web/components/analytics/column-chart.tsx
 *
 * Vertical columns for data whose x-axis is *ordered*, not ranked: the hours
 * of a day, viewport widths, or two measures side by side per category.
 *
 * `BarList` answers "which is biggest"; this answers "what is the shape" —
 * where the day peaks, where the mobile/desktop boundary falls, whether one
 * device reads twice as deep. One series draws plain columns; several draw
 * grouped (composition and depth, side by side) or stacked (`stacked`) when
 * the parts of a whole over time are the question.
 *
 * Recharts island: import the default export with `ssr: false` so the bundle
 * never joins the first paint.
 */

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

export interface ColumnSeries {
  key: string;
  label: string;
  /** Any CSS colour, usually `hsl(var(--chart-N))`. */
  color: string;
}

export function ColumnChart({
  data,
  series,
  stacked,
  refreshKey,
  className,
}: {
  /** Rows with a `label` field and one numeric field per series. */
  data: Array<Record<string, string | number>>;
  series: ColumnSeries[];
  /** Stack the series into one column per row instead of grouping them. */
  stacked?: boolean;
  refreshKey?: number;
  className?: string;
}) {
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }])
  ) satisfies ChartConfig;
  const isStacked = Boolean(stacked) && series.length > 1;

  return (
    <ChartContainer
      key={refreshKey}
      config={config}
      className={cn("h-[220px] w-full", className)}
    >
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
        barGap={2}
      >
        <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          minTickGap={16}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          width={40}
          allowDecimals={false}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            fill={`var(--color-${s.key})`}
            stackId={isStacked ? "a" : undefined}
            maxBarSize={28}
            // In stacked mode only the top segment carries the radius; in
            // grouped mode every column is its own top.
            radius={!isStacked || i === series.length - 1 ? [3, 3, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
