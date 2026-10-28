"use client";

/**
 * apps/web/components/analytics/trend-card.tsx
 *
 * The card around a time series. The chart itself is a dynamic import on each
 * page (recharts is heavy); this is the chrome: what the series is, what the
 * two lines mean, and the caveat that belongs under it.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function TrendCard({
  title,
  description,
  insight,
  footer,
  children,
  className,
}: {
  title: string;
  description?: string;
  /**
   * The takeaway, one sentence — what this chart says, computed from the
   * data by the tab (DESIGN.md §1.2: charts carry insight captions). A
   * caption is a finding, not a definition, so it renders brighter than the
   * description above it.
   */
  insight?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
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
        {children}
        {footer && (
          <div className="mt-3 text-xs text-muted-foreground">{footer}</div>
        )}
      </CardContent>
    </Card>
  );
}
