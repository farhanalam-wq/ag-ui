"use client";

/**
 * apps/web/components/analytics/analytics-tabs.tsx
 *
 * One surface, several questions. The tab lives in the URL (`?tab=`), so a
 * view can be linked, bookmarked and refreshed without losing its place, and
 * the back button works the way a reader expects.
 *
 * The tabs are buttons, not links: changing a tab replaces the history entry
 * rather than stacking one per click, and the range filter in the query string
 * survives the switch. Keyboard uses the standard roving-tabindex pattern.
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export interface AnalyticsTab {
  id: string;
  label: string;
}

const PARAM = "tab";

/**
 * The active tab for a page, read from `?tab=` and written back on change.
 * Unknown values fall back to the first tab instead of rendering nothing.
 *
 * Call inside a component under a Suspense boundary (Next requires it for
 * `useSearchParams` in a prerendered route).
 */
export function useAnalyticsTab(tabs: AnalyticsTab[]): [string, (id: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get(PARAM);
  const active = tabs.some((t) => t.id === requested) ? requested! : tabs[0]!.id;

  const select = useCallback(
    (id: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (id === tabs[0]!.id) next.delete(PARAM);
      else next.set(PARAM, id);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, tabs]
  );

  return [active, select];
}

export function AnalyticsTabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: AnalyticsTab[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === value);
    if (index < 0) return;
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const next = tabs[(index + delta + tabs.length) % tabs.length]!;
    onChange(next.id);
    const el = event.currentTarget.querySelector<HTMLButtonElement>(
      `[data-tab="${next.id}"]`
    );
    el?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Analytics sections"
      onKeyDown={onKeyDown}
      className={cn(
        "mt-5 flex min-w-0 gap-1 overflow-x-auto border-b",
        className
      )}
    >
      {tabs.map((tab) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px shrink-0 border-b-2 px-3 py-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
