"use client";

// Recharts island. Dynamically imported with `ssr: false` from the
// home page so the recharts bundle never joins the initial load — charts pop
// in behind a skeleton instead of blocking paint.
import {
  Area,
  AreaChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceArea,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TrendPoint } from "@/mocks/overview";

const trendConfig = {
  assisted: { label: "Assisted", color: "hsl(var(--chart-1))" },
  baseline: { label: "Baseline", color: "hsl(var(--chart-7))" },
} satisfies ChartConfig;

const radarConfig = {
  share: { label: "Demand share", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

export function MonitoringTrendChart({
  demand,
  refreshKey,
}: {
  demand: TrendPoint[];
  refreshKey: number;
}) {
  return (
    <ChartContainer
      key={refreshKey}
      config={trendConfig}
      className="h-[280px] w-full"
    >
      <AreaChart
        data={demand}
        margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
      >
        <defs>
          <linearGradient
            id="mon-assisted"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
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
          <pattern
            id="mon-hatch"
            width="6"
            height="6"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect
              width="6"
              height="6"
              fill="hsl(var(--muted) / 0.5)"
            />
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="hsl(var(--border))"
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <CartesianGrid
          stroke="hsl(var(--border))"
          vertical={false}
        />
        {demand.length > 0 && (
          <ReferenceArea
            x1={demand[0]?.d}
            x2={demand[1]?.d}
            fill="url(#mon-hatch)"
            fillOpacity={0.6}
          />
        )}
        <XAxis
          dataKey="d"
          tickLine={false}
          axisLine={false}
          tick={{
            fill: "hsl(var(--muted-foreground))",
            fontSize: 12,
          }}
          minTickGap={32}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{
            fill: "hsl(var(--muted-foreground))",
            fontSize: 12,
          }}
          width={40}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="assisted"
          strokeWidth={2}
          dot={false}
          stroke="var(--color-assisted)"
          fill="url(#mon-assisted)"
        />
        <Area
          dataKey="baseline"
          fill="none"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
          stroke="var(--color-baseline)"
        />
      </AreaChart>
    </ChartContainer>
  );
}

export function IntentRadarChart({
  radarData,
}: {
  radarData: { intent: string; full: string; share: number }[];
}) {
  return (
    <ChartContainer
      config={radarConfig}
      className="min-h-[280px] w-full flex-1"
    >
      <RadarChart
        data={radarData}
        outerRadius="68%"
        margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
      >
        <PolarGrid stroke="hsl(var(--border))" />
        <PolarAngleAxis
          dataKey="intent"
          tick={{
            fill: "hsl(var(--muted-foreground))",
            fontSize: 11,
          }}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Radar
          dataKey="share"
          stroke="var(--color-share)"
          fill="var(--color-share)"
          fillOpacity={0.3}
          strokeWidth={2}
          dot={false}
        />
      </RadarChart>
    </ChartContainer>
  );
}
