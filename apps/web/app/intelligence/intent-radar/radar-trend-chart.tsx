"use client";

/**
 * apps/web/app/intelligence/intent-radar/radar-trend-chart.tsx
 *
 * The radar's trend island: one day, one bar, stacked by how the agent's
 * answers stood up — sourced (evidence behind the reply), blindspot
 * (answered without evidence), no reply (nothing answered at all). Three
 * segments rather than one "failed" bucket because the page's whole grammar
 * is that unanswered is not a blindspot; merging them in a chart would say
 * the opposite of what the copy says.
 *
 * Recharts is imported here and loaded with `ssr: false` by the view, the
 * same discipline as every other chart island.
 */

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export interface RadarTrendRow {
  d: string;
  /** Answered with retrieved evidence behind the reply. */
  sourced: number;
  /** Answered, but the reply carried no evidence — the blindspots. */
  blindspot: number;
  /** No assistant reply followed the question. */
  noReply: number;
}

const config = {
  sourced: { label: "Sourced answer", color: "hsl(var(--chart-2))" },
  blindspot: { label: "Blindspot", color: "hsl(var(--chart-6))" },
  noReply: { label: "No reply", color: "hsl(var(--chart-7))" },
} satisfies ChartConfig;

export function RadarTrendChart({ data }: { data: RadarTrendRow[] }) {
  // The axis wants short labels; the tooltip names the segments in full.
  const rows = data.map((r) => ({ ...r, d: r.d.slice(5) }));

  return (
    <ChartContainer config={config} className="h-[220px] w-full">
      <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
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
        {/* Stacking order = reading order: what held up on the bottom,
            what didn't in the middle, what never got an answer on top. */}
        <Bar dataKey="sourced" stackId="questions" fill="var(--color-sourced)" />
        <Bar dataKey="blindspot" stackId="questions" fill="var(--color-blindspot)" />
        <Bar
          dataKey="noReply"
          stackId="questions"
          fill="var(--color-noReply)"
          radius={[3, 3, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
