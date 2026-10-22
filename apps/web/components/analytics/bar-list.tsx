"use client";

/**
 * A short ranked list drawn as bars.
 *
 * Used where the shape matters more than the exact count: viewport sizes,
 * device mix, channel mix. The longest bar is the reference, every bar is
 * scaled to it, and the number stays visible so the chart is readable without
 * a hover.
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

export function BarList({
  title,
  description,
  rows,
  empty = "No data in this range.",
  className,
}: {
  title: string;
  description?: string;
  rows: { label: string; value: number | null | undefined }[];
  empty?: string;
  className?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Number(r.value ?? 0)));
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-[13px]">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          rows.map((row) => {
            const value = Number(row.value ?? 0);
            return (
              <div key={row.label} className="flex items-center gap-3 text-xs">
                <span
                  className="w-20 shrink-0 truncate font-mono tabular-nums"
                  title={row.label}
                >
                  {row.label}
                </span>
                <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--chart-1))]"
                    style={{ width: `${Math.max(2, (value / max) * 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                  {formatCount(value)}
                </span>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
