"use client";

/**
 * apps/web/components/analytics/metric-story.tsx
 *
 * "What am I looking at?"
 *
 * Every metric in the catalogue carries the business question it answers.
 * This disclosure renders those stories next to the KPI group, which is how
 * "no metric without a reason" becomes a product behaviour instead of a
 * sentiment (docs/analytics-rebuild.md §11.1).
 *
 * The stories come from the catalogue in `@ag-ui/shared/client` — the same
 * copy the API validates against, so a metric cannot be described one way
 * here and another way there.
 */

import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { METRICS } from "@ag-ui/shared/client";
import { cn } from "@/lib/utils";

export function MetricStory({
  metrics,
  className,
}: {
  /** The metric ids this group shows, in display order. */
  metrics: string[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const stories = metrics
    .map((id) => METRICS[id])
    .filter((m): m is NonNullable<typeof m> => Boolean(m?.story))
    .map((m) => ({ id: m.id, label: m.label, story: m.story }));
  if (stories.length === 0) return null;

  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded text-[13px] hover:text-foreground focus:outline-none"
      >
        {open ? <CaretDown className="size-3.5" aria-hidden="true" /> : <CaretRight className="size-3.5" aria-hidden="true" />}
        What am I looking at?
      </button>
      {open ? (
        <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {stories.map((s) => (
            <div key={s.id} className="min-w-0">
              <dt className="font-medium text-foreground">{s.label}</dt>
              <dd className="truncate">{s.story}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
