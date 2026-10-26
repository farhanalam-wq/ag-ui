"use client";

/**
 * apps/web/components/analytics/composition-bar.tsx
 *
 * A share of a whole, drawn as one stacked bar.
 *
 * Composition is a different question from ranking: "how is my traffic split"
 * reads from one glance at proportions, not from a table of counts. The bar
 * carries the shape; the legend under it carries the exact numbers, so the
 * chart is readable without a hover — the same rule BarList holds itself to.
 *
 * Pure CSS: no recharts, so this card can render server-side with the tab.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCount } from "./format";

/** The token palette, in the order segments take it. Two blues stay apart. */
const PALETTE = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-8))",
];

/** "Unknown" is not a category a reader can act on, so it never takes a hue. */
function segmentColor(label: string, index: number): string {
  if (/^(\(unknown\)|unknown)$/i.test(label.trim())) {
    return "hsl(var(--chart-7))";
  }
  return PALETTE[index % PALETTE.length];
}

export function CompositionBar({
  title,
  description,
  rows,
  empty = "No data in this range.",
  metricLabel = "Sessions",
  className,
}: {
  title: string;
  description?: string;
  rows: { label: string; value: number | null | undefined }[];
  empty?: string;
  /** The unit the shares are of — "Sessions", "Views" — for the legend. */
  metricLabel?: string;
  className?: string;
}) {
  const total = rows.reduce((a, r) => a + Number(r.value ?? 0), 0);
  const colored = rows.filter((r) => Number(r.value ?? 0) > 0);

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-[13px]">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {colored.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          <>
            <div className="flex h-3 w-full gap-0.5 overflow-hidden">
              {colored.map((row, i) => {
                const share = (Number(row.value ?? 0) / total) * 100;
                return (
                  <div
                    key={row.label}
                    className="h-full min-w-[3px] rounded-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${share}%`,
                      background: segmentColor(row.label, i),
                    }}
                    title={`${row.label}: ${share.toFixed(1)}%`}
                  />
                );
              })}
            </div>
            <ul className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              {colored.map((row, i) => {
                const value = Number(row.value ?? 0);
                const share = total > 0 ? (value / total) * 100 : 0;
                return (
                  <li key={row.label} className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: segmentColor(row.label, i) }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 truncate" title={row.label}>
                      {row.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {share.toFixed(1)}%
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums">
                      {formatCount(value)}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="sr-only">
              {title}: {colored
                .map((r) => `${r.label} ${formatCount(Number(r.value ?? 0))}`)
                .join(", ")},
              {` ${metricLabel.toLowerCase()} total ${formatCount(total)}.`}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
