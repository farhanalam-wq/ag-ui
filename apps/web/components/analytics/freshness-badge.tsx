"use client";

/**
 * apps/web/components/analytics/freshness-badge.tsx
 *
 * The freshness badge.
 *
 * It used to mean two different things at once — "there is data" and "the
 * data is fresh" — and it was shown on pages with tracking switched off
 * (P-05). It now says exactly one of three things:
 *
 *   - **No data** — nothing was tracked in this range;
 *   - **Live** — the numbers come from the raw event stream;
 *   - **Updated N min ago** — the numbers move on the rollup tick, and this
 *     is how old the rollup is.
 */

import { Badge } from "@/components/ui/badge";
import type { Freshness } from "@/lib/api-client";

export function FreshnessBadge({
  freshness,
  className,
}: {
  freshness: Freshness | undefined;
  className?: string;
}) {
  if (!freshness) return null;

  const trackingOff = freshness.dataQuality.includes("tracking-off");
  if (trackingOff) {
    return (
      <Badge variant="outline" className={className}>
        No data
      </Badge>
    );
  }

  if (freshness.live) {
    return (
      <Badge
        variant="outline"
        className={`rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300 ${className ?? ""}`}
      >
        Live
      </Badge>
    );
  }

  const mins = Math.max(0, Math.round(freshness.rollupLagMinutes));
  return (
    <Badge
      variant="outline"
      className={`rounded-full font-normal ${className ?? ""}`}
      title={`Computed at ${new Date(freshness.computedAt).toLocaleString()}`}
    >
      Updated {mins === 0 ? "just now" : `${mins} min ago`}
    </Badge>
  );
}
