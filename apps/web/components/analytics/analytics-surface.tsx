"use client";

/**
 * apps/web/components/analytics/analytics-surface.tsx
 *
 * The shell every analytics hub shares: breadcrumb, title, the one toolbar
 * (freshness, range, refresh), optional tabs, and the three states a report
 * can be in.
 *
 * Before this, each page carried its own header markup and its own loading,
 * error and empty branches — four copies that drifted. The rules they now
 * share:
 *
 *   - the range and refresh controls live in the same place on every surface;
 *   - a failed request says what failed and offers Retry, never a blank body;
 *   - "no company selected" is its own answer, not an error;
 *   - the body is the page's, so a surface can add a strip or a note without
 *     opting out of the shell.
 */

import { WarningCircle } from "@phosphor-icons/react";
import { StudioShell, type Crumb } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Freshness } from "@/lib/api-client";
import type { Range } from "@/lib/analytics";
import { FreshnessBadge } from "./freshness-badge";
import { RangeSelect } from "./range-select";
import { AnalyticsTabs, type AnalyticsTab } from "./analytics-tabs";
import { cn } from "@/lib/utils";

export type SurfaceStatus = "loading" | "error" | "empty" | "ready";

export function AnalyticsSurface({
  crumbs,
  title,
  subtitle,
  freshness,
  range,
  onRangeChange,
  ranges,
  onRefresh,
  status,
  error,
  onRetry,
  emptyMessage = "Select a company to see its analytics.",
  tabs,
  activeTab,
  onTabChange,
  children,
  className,
}: {
  crumbs: Crumb[];
  title: string;
  subtitle: string;
  freshness?: Freshness;
  range: Range;
  onRangeChange: (range: Range) => void;
  ranges?: Range[];
  onRefresh: () => void;
  status: SurfaceStatus;
  error?: string | null;
  onRetry?: () => void;
  emptyMessage?: string;
  tabs?: AnalyticsTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <StudioShell crumbs={crumbs}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-9 tracking-tight">
            {title}
          </h1>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessBadge freshness={freshness} />
          <RangeSelect value={range} onChange={onRangeChange} ranges={ranges} />
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onRefresh}
            disabled={status === "loading"}
          >
            Refresh
          </Button>
        </div>
      </div>

      {tabs && tabs.length > 0 && activeTab && onTabChange && (
        <AnalyticsTabs tabs={tabs} value={activeTab} onChange={onTabChange} />
      )}

      <div className={cn("mt-6 min-w-0", className)}>
        {status === "loading" ? (
          <div className="space-y-4">
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[280px] w-full" />
          </div>
        ) : status === "error" ? (
          <div
            role="alert"
            className="mx-auto mt-2 max-w-[60ch] rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center"
          >
            <p className="text-sm font-medium">Analytics unavailable</p>
            {error && (
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {error}
              </p>
            )}
            {onRetry && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onRetry}
              >
                <WarningCircle className="size-3.5" aria-hidden="true" />
                Retry
              </Button>
            )}
          </div>
        ) : status === "empty" ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          children
        )}
      </div>
    </StudioShell>
  );
}
