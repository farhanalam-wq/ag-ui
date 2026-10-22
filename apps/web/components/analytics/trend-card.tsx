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
  footer,
  children,
  className,
}: {
  title: string;
  description?: string;
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
