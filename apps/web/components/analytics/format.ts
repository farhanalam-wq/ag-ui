"use client";

/**
 * apps/web/components/analytics/format.ts
 *
 * One way to print a metric.
 *
 * Every report returns raw numbers; how they read is decided by the catalogue
 * (`METRICS[id].format` and `.unit`), not by the page. That is the same
 * catalogue the API validates against, so a metric cannot render as "1,234"
 * in one place and "1234" in another, and a new format is added once.
 */

import { METRICS } from "@ag-ui/shared/client";

export function formatMetric(
  id: string,
  value: number | null | undefined
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const def = METRICS[id];

  // Durations read as durations regardless of decimal format: 1.2s under a
  // minute, then minutes and seconds. "94.0" is not an answer a reader wants.
  if (def?.unit === "seconds") {
    if (value < 60) return `${value.toFixed(1)}s`;
    const minutes = Math.floor(value / 60);
    const seconds = Math.round(value % 60);
    return `${minutes}m ${seconds}s`;
  }

  switch (def?.format) {
    case "percent1":
      return `${value.toFixed(1)}%`;
    case "float1":
      return value.toFixed(1);
    case "money1":
      return `$${value.toFixed(1)}`;
    case "int":
    default:
      return Math.round(value).toLocaleString();
  }
}

/**
 * A previous-period delta, or null when there is nothing honest to compare
 * against. A zero baseline has no percentage: "+∞%" is not a finding.
 */
export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined
): string | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  if (current === null || current === undefined) return null;
  const pct = ((current - previous) / previous) * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${Math.round(pct * 10) / 10}% vs previous period`;
}

/**
 * The same delta as a signed number, for callers that render it themselves
 * (a metric tile's pill, where the tile decides the colour from whether a
 * rise is good). Null under the same honesty rule as `formatDelta`.
 */
export function deltaPct(
  current: number | null | undefined,
  previous: number | null | undefined
): number | null {
  if (previous === null || previous === undefined || previous <= 0) return null;
  if (current === null || current === undefined) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** The number a breakdown cell shows: counts as counts, nothing invented. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString();
}
