"use client";

/**
 * apps/web/components/analytics/anomaly-card.tsx
 *
 * The one part of the old Insights page that said something a reader could not
 * already see: a day that broke its own baseline.
 *
 * It is deliberately quiet — nothing renders when no day qualifies — and it
 * never claims a cause. The channel mix for the flagged day is shown as
 * *correlated context*, because the report cannot know whether a launch, an
 * outage or a newsletter produced the spike, and pretending otherwise is worse
 * than saying less.
 */

import { Warning } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import type { Anomaly } from "@/lib/api-client";

export function AnomalyCard({
  anomalies,
  thresholds,
}: {
  anomalies: Anomaly[];
  thresholds: { minDaily: number; z: number };
}) {
  if (anomalies.length === 0) return null;
  return (
    <Card className="border-amber-500/30">
      <CardContent className="space-y-3 pt-5">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium">
            <Warning className="size-4 text-amber-500" aria-hidden="true" />
            Unusual days
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Days at least {thresholds.z} standard deviations from their baseline.
            Correlation, not cause — check launches, outages and campaigns.
          </p>
        </div>
        <ul className="space-y-3">
          {anomalies.map((a) => (
            <li key={`${a.metric}-${a.day}`} className="text-sm">
              <p>
                <span className="font-medium capitalize">{a.direction}</span> in{" "}
                {a.metric} on{" "}
                <span className="font-mono text-xs">{a.day}</span>:{" "}
                <span className="tabular-nums">
                  {a.observed.toLocaleString()} vs {a.expected.toLocaleString()}{" "}
                  expected (z={a.z})
                </span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Baseline {a.baselineWindow}.
                {a.context.length > 0 && (
                  <>
                    {" "}
                    Context:{" "}
                    <span className="font-mono">
                      {a.context
                        .map(
                          (c) =>
                            `${c.label} (${c.pageviews.toLocaleString()} views)`
                        )
                        .join(", ")}
                    </span>
                    .
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
