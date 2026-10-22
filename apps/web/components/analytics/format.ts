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

/** The number a breakdown cell shows: counts as counts, nothing invented. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  return Math.round(value).toLocaleString();
}
