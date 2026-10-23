"use client";

/**
 * apps/web/components/analytics/series-trend-chart.tsx
 *
 * The agent surfaces' trend island: two counted series per day, no invented
 * rate axis. It exists because `TrafficTrendChart` is about one question
 * (pageviews vs sessions) and forcing opens, questions, calls and turns through
 * its prop names would make the shape lie about what it draws.
 *
 * Recharts is imported here and the component is loaded with `ssr: false` by
 * each tab, so the bundle never joins the first paint.
 */

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface TrendSeries {
  key: string;
  label: string;
  /** Any CSS colour, usually `hsl(var(--chart-N))`. */
  color: string;
}

export function SeriesTrendChart({
  data,
  series,
  refreshKey,
}: {
  data: Array<Record<string, string | number>>;
  series: TrendSeries[];
  refreshKey: number;
}) {
  const config = Object.fromEntries(
    series.map((s) => [s.key, { label: s.label, color: s.color }])
  ) satisfies ChartConfig;

  // The axis wants short labels; the tooltip gets the full series names.
  const rows = data.map((point) => ({ ...point, d: String(point.d).slice(5) }));

  return (
    <ChartContainer key={refreshKey} config={config} className="h-[280px] w-full">
      <AreaChart
        data={rows}
        margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient
              key={s.key}
              id={`series-fill-${s.key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.03} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="d"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          minTickGap={32}
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
          <Area
            key={s.key}
            dataKey={s.key}
            strokeWidth={2}
            dot={false}
            stroke={`var(--color-${s.key})`}
            fill={i === 0 ? `url(#series-fill-${s.key})` : "none"}
            strokeDasharray={i === 0 ? undefined : "5 4"}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
