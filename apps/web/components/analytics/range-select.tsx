"use client";

/**
 * The date range, in one place.
 *
 * Native select, not a custom menu: it is one control, it works with a screen
 * reader, a keyboard and a phone picker without extra code, and the range
 * changes a fetch rather than a filter over loaded rows.
 */

import type { Range } from "@/lib/analytics";

const LABELS: Record<Range, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

export function RangeSelect({
  value,
  onChange,
  ranges = ["7d", "30d", "90d"],
  className,
}: {
  value: Range;
  onChange: (range: Range) => void;
  ranges?: Range[];
  className?: string;
}) {
  return (
    <label
      className={
        "inline-flex h-8 items-center rounded-md border px-2 text-[13px] text-muted-foreground " +
        (className ?? "")
      }
    >
      Range
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Range)}
        aria-label="Date range"
        className="ml-2 h-full bg-transparent pr-1 text-[13px] text-foreground focus:outline-none"
      >
        {ranges.map((r) => (
          <option key={r} value={r}>
            {LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  );
}
