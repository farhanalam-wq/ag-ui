"use client";

/**
 * apps/web/components/analytics/metric-tile.tsx
 *
 * A KPI, and the row it lives in. The label and the number format come from
 * the catalogue, so a tile cannot call a metric something the API does not.
 *
 * `value` is optional on purpose: a metric the report could not compute is
 * absent, and an absent metric renders as "—" with the reason underneath.
 * Never as zero — zero is an answer, "unknown" is a different one.
 *
 * A tile is never a naked number (docs/DESIGN.md §1.3): where the report
 * carries a per-day series, the tile carries a sparkline, and where the
 * caller knows a previous period, the tile carries a signed delta. Both are
 * optional — a tile with nothing honest to show still shows just the number.
 */

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { TrendDown, TrendUp } from "@phosphor-icons/react";
import { METRICS } from "@ag-ui/shared/client";
import { cn } from "@/lib/utils";
import { formatMetric } from "./format";
import { Sparkline } from "./sparkline";

export interface MetricItem {
  /** Metric id from the catalogue. */
  id: string;
  value?: number | null;
  /** Overrides the catalogue label only when the context needs it. */
  label?: string;
  /** One short line under the number: why it is missing, or what it means. */
  hint?: string;
  /** The per-day series behind the number, in time order. */
  sparkline?: Array<number | null | undefined>;
  /**
   * A previous-period change, already computed by the caller — the tile does
   * not know whether a rising number is good, so `good` decides the colour.
   */
  delta?: { pct: number; good?: boolean } | null;
}

function DeltaPill({ delta }: { delta: NonNullable<MetricItem["delta"]> }) {
  const up = delta.pct >= 0;
  const Icon = up ? TrendUp : TrendDown;
  const colour =
    delta.good === undefined
      ? "text-muted-foreground"
      : delta.good
        ? "text-emerald-600"
        : "text-red-600";
  const text = `${up ? "+" : ""}${(Math.round(Math.abs(delta.pct) * 10) / 10 * (up ? 1 : -1)).toFixed(1)}%`;
  return (
    <p className={cn("mt-1 inline-flex items-center gap-1 text-[11px] font-medium", colour)}>
      <Icon className="size-3" aria-hidden="true" weight="bold" />
      {text}
    </p>
  );
}

export function MetricTile({
  id,
  value,
  label,
  hint,
  sparkline,
  delta,
}: {
  id: string;
  value?: number | null;
  label?: string;
  hint?: string;
  sparkline?: Array<number | null | undefined>;
  delta?: { pct: number; good?: boolean } | null;
}) {
  const def = METRICS[id];
  const text = formatMetric(id, value);
  const missing = text === "—";
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-[13px] text-muted-foreground">
          {label ?? def?.label ?? id}
        </p>
        <p
          className={cn(
            "mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight",
            missing && "text-muted-foreground"
          )}
        >
          {text}
        </p>
        {hint && (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        )}
        {delta && <DeltaPill delta={delta} />}
        {sparkline && sparkline.length >= 2 && (
          <div className="mt-2">
            <Sparkline values={sparkline} ariaLabel={`${label ?? def?.label ?? id} per day`} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const COLUMNS = {
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 xl:grid-cols-4",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
} as const;

export function MetricGrid({
  items,
  columns = 6,
  className,
}: {
  items: MetricItem[];
  columns?: keyof typeof COLUMNS;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", COLUMNS[columns], className)}>
      {items.map((item) => (
        <MetricTile key={item.id} {...item} />
      ))}
    </div>
  );
}
