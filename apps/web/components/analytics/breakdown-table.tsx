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

/**
 * The maximum share any one row takes, so a 40-cell table still answers
 * "how dominant is the leader" — the question a ranked list exists for.
 */
const barColor = "bg-[hsl(var(--chart-1))]";

export function BreakdownTable<T extends { label: string }>({
  title,
  description,
  rows,
  columns,
  labelHeader,
  empty = "No data in this range.",
  footer,
  barKey,
  insight,
  onRowSelect,
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
  /**
   * When set, each label carries a small bar proportional to that row's
   * share of the column's max — a table that also shows the shape. Use for
   * ranked lists (top pages, referrers, channels); skip for lookup tables.
   */
  barKey?: string;
  /**
   * The takeaway, one sentence — same contract as TrendCard's caption: a
   * finding computed from the data by the tab, not a definition.
   */
  insight?: React.ReactNode;
  /**
   * When set, rows are interactive: click or Enter opens the row's detail
   * (a Sheet, per the interaction contract). The table itself stays a table
   * when this is absent — most breakdowns are lookup lists, not drills.
   */
  onRowSelect?: (row: T) => void;
  className?: string;
}) {
  const max = barKey
    ? Math.max(1, ...rows.map((r) => Number((r as Record<string, unknown>)[barKey] ?? 0)))
    : 0;
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-[13px]">{description}</CardDescription>
        )}
        {insight && (
          <p className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground">
            <span
              className="size-1.5 shrink-0 rounded-full bg-[hsl(var(--chart-1))]"
              aria-hidden="true"
            />
            {insight}
          </p>
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
                <TableRow
                  key={`${row.label}-${i}`}
                  onClick={onRowSelect ? () => onRowSelect(row) : undefined}
                  tabIndex={onRowSelect ? 0 : undefined}
                  onKeyDown={
                    onRowSelect
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowSelect(row);
                          }
                        }
                      : undefined
                  }
                  className={cn(
                    onRowSelect &&
                      "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  )}
                  aria-label={onRowSelect ? `Open details for ${row.label}` : undefined}
                >
                  <TableCell
                    className={cn(
                      "max-w-[280px] truncate",
                      columns.some((c) => c.mono) && "font-mono text-xs"
                    )}
                    title={row.label}
                  >
                    {row.label}
                    {barKey && (
                      <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-muted">
                        <span
                          className={cn("block h-full rounded-full", barColor)}
                          style={{
                            width: `${Math.max(
                              2,
                              (Number(
                                (row as Record<string, unknown>)[barKey] ?? 0
                              ) /
                                max) *
                                100
                            )}%`,
                          }}
                        />
                      </span>
                    )}
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
