"use client";

/**
 * apps/web/components/analytics/breakdown-table.tsx
 *
 * A ranked list with numbers: top pages, referrers, channels, devices.
 *
 * Every table on every surface uses this shape — a card with a title, an
 * optional one-line explanation, the label column, and right-aligned numeric
 * columns in tabular figures. The point is not the markup, it is that the same
 * kind of answer looks the same wherever a reader meets it.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatCount } from "./format";

export interface BreakdownColumn {
  key: string;
  label: string;
  /** Paths and referrers read as machine strings; counts do not. */
  mono?: boolean;
  align?: "left" | "right";
  /**
   * How a numeric cell is written. Counts are the default; a rate column says
   * so, because "68" where the KPI row says "68.0%" reads like a different
   * number.
   */
  format?: "count" | "percent1";
}

export function BreakdownTable<T extends { label: string }>({
  title,
  description,
  rows,
  columns,
  labelHeader,
  empty = "No data in this range.",
  footer,
  className,
}: {
  title: string;
  description?: string;
  rows: T[];
  columns: BreakdownColumn[];
  /** Header for the label column; defaults to "Label". */
  labelHeader?: string;
  empty?: string;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-[13px]">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labelHeader ?? "Label"}</TableHead>
                {columns.map((c) => (
                  <TableHead
                    key={c.key}
                    className={c.align === "left" ? undefined : "text-right"}
                  >
                    {c.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={`${row.label}-${i}`}>
                  <TableCell
                    className={cn(
                      "max-w-[280px] truncate",
                      columns.some((c) => c.mono) && "font-mono text-xs"
                    )}
                    title={row.label}
                  >
                    {row.label}
                  </TableCell>
                  {columns.map((c) => {
                    const value = (row as Record<string, unknown>)[c.key];
                    return (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "tabular-nums",
                          c.align === "left" ? undefined : "text-right"
                        )}
                      >
                        {typeof value === "number"
                          ? c.format === "percent1"
                            ? `${value.toFixed(1)}%`
                            : formatCount(value)
                          : typeof value === "string"
                            ? value
                            : "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {footer}
      </CardContent>
    </Card>
  );
}
