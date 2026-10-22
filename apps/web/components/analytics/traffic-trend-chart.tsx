"use client";

/**
 * apps/web/components/analytics/traffic-trend-chart.tsx
 *
 * Pageviews and sessions per day. Two series because they answer two
 * questions: how much was read (pageviews) and how many visits did the
 * reading (sessions). The gap between them is pages per session, which is why
 * the same window can look busy and shallow at once.
 *
 * Recharts island: imported with `ssr: false` so the bundle never joins the
 * first paint.
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

const config = {
  pageviews: { label: "Pageviews", color: "hsl(var(--chart-1))" },
  sessions: { label: "Sessions", color: "hsl(var(--chart-7))" },
} satisfies ChartConfig;

export interface TrafficTrendPoint {
  d: string;
  pageviews: number;
  sessions: number;
}

export function TrafficTrendChart({
  data,
  refreshKey,
}: {
  data: TrafficTrendPoint[];
  refreshKey: number;
}) {
  // The axis wants short labels; the tooltip gets the full series names.
  const rows = data.map((point) => ({ ...point, d: point.d.slice(5) }));
  return (
    <ChartContainer key={refreshKey} config={config} className="h-[280px] w-full">
      <AreaChart
        data={rows}
        margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
      >
        <defs>
          <linearGradient id="traffic-fill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="hsl(var(--chart-1))"
              stopOpacity={0.22}
            />
            <stop
              offset="100%"
              stopColor="hsl(var(--chart-1))"
              stopOpacity={0.03}
            />
          </linearGradient>
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
        <Area
          dataKey="pageviews"
          strokeWidth={2}
          dot={false}
          stroke="var(--color-pageviews)"
          fill="url(#traffic-fill)"
        />
        <Area
          dataKey="sessions"
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          stroke="var(--color-sessions)"
        />
      </AreaChart>
    </ChartContainer>
  );
}
