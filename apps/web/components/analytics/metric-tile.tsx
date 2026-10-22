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
 */

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { METRICS } from "@ag-ui/shared/client";
import { cn } from "@/lib/utils";
import { formatMetric } from "./format";

export interface MetricItem {
  /** Metric id from the catalogue. */
  id: string;
  value?: number | null;
  /** Overrides the catalogue label only when the context needs it. */
  label?: string;
  /** One short line under the number: why it is missing, or what it means. */
  hint?: string;
}

export function MetricTile({
  id,
  value,
  label,
  hint,
}: {
  id: string;
  value?: number | null;
  label?: string;
  hint?: string;
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
