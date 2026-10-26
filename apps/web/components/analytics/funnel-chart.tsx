"use client";

/**
 * apps/web/components/analytics/funnel-chart.tsx
 *
 * A funnel where the drop-off is visible.
 *
 * The insight of a funnel is never the stage counts — those are a list. The
 * insight is the shape: how much survives each step, and where the biggest
 * gap opens. Each stage bar is scaled to the top of the funnel, and the
 * transition into every stage after the first carries its step survival
 * ("89% of the previous stage"), so the leak is legible without doing the
 * subtraction in your head.
 *
 * Pure CSS: no recharts, so this card can render server-side with the page.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatCount } from "./format";

export interface FunnelStage {
  stage: string;
  count: number;
  /** Share of the first stage, 0–100. */
  pctOfTop: number;
}

export function FunnelChart({
  title,
  description,
  stages,
  className,
}: {
  title: string;
  description?: string;
  stages: FunnelStage[];
  className?: string;
}) {
  const top = stages[0]?.count ?? 0;

  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-[15px] font-semibold">{title}</CardTitle>
        {description && (
          <CardDescription className="text-[13px]">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5">
        {stages.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            No funnel data in this range.
          </p>
        ) : (
          <ol className="space-y-1">
            {stages.map((s, i) => {
              const prev = i > 0 ? stages[i - 1] : undefined;
              const stepSurvival =
                prev && prev.count > 0
                  ? Math.round((s.count / prev.count) * 100)
                  : null;
              return (
                <li key={`${s.stage}-${i}`} className="group">
                  {i > 0 && stepSurvival !== null && (
                    <p
                      className={cn(
                        "mb-1 flex items-center gap-1 pl-1 text-[11px]",
                        stepSurvival < 50 ? "text-red-600" : "text-muted-foreground"
                      )}
                    >
                      <CaretRight className="size-3" aria-hidden="true" />
                      {stepSurvival}% of the previous stage
                    </p>
                  )}
                  <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 text-sm">
                    <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.stage}
                    </span>
                    <span className="hidden h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted sm:block">
                      <span
                        className="block h-full rounded-full bg-[hsl(var(--chart-1))]"
                        style={{
                          width: `${Math.max(2, Math.min(100, s.pctOfTop))}%`,
                        }}
                      />
                    </span>
                    <span className="tabular-nums">{formatCount(s.count)}</span>
                    <span className="w-16 text-right tabular-nums text-muted-foreground">
                      {top > 0 ? `${Math.min(100, s.pctOfTop)}%` : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
