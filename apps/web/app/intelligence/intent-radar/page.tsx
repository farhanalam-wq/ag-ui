"use client";

/**
 * Intelligence → Intent Radar.
 *
 * The shell is the same AnalyticsSurface every report hub shares — one
 * toolbar (freshness, range, refresh), the same three states — so the radar
 * reads like the rest of the product, not like a special exhibit. The range
 * defaults to 30d: the radar's questions are about demand over time, and a
 * 7d window is too small for clusters to repeat (a cluster needs a wording
 * asked more than once to exist at all).
 *
 * Unlike Overview's intent tiles, the mix here counts every scanned user
 * message in range, not just first messages — the page says so, because the
 * two numbers meeting a reader under the same "intent" word must not
 * silently disagree.
 */

import { Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioShell } from "@/components/studio-shell";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient } from "@/lib/api-client";
import type { IntelRadarAnalytics } from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";
import {
  AnalyticsSurface,
  type SurfaceStatus,
} from "@/components/analytics/analytics-surface";
import { RadarView } from "./radar-view";

export default function IntentRadarPage() {
  return (
    <Suspense fallback={<RadarFallback />}>
      <IntentRadar />
    </Suspense>
  );
}

function IntentRadar() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");

  const { data, loadError, setRefreshKey } = useCompanyReport<IntelRadarAnalytics>(
    company,
    (companyId) => apiClient.intelligence.radar(companyId, range),
    [range]
  );

  const status: SurfaceStatus = !company
    ? "empty"
    : loadError
      ? "error"
      : !data
        ? "loading"
        : "ready";

  return (
    <AnalyticsSurface
      crumbs={[{ label: "Intelligence" }, { label: "Intent Radar" }]}
      title="Intent Radar"
      subtitle="What visitors asked for, where the site's answers ran out, and who else they mentioned."
      freshness={data?.freshness}
      range={range}
      onRangeChange={setRange}
      onRefresh={() => setRefreshKey((k) => k + 1)}
      status={status}
      error={loadError}
      onRetry={() => setRefreshKey((k) => k + 1)}
      emptyMessage="Select a company to read the questions its visitors asked."
    >
      {data && <RadarView data={data} />}
    </AnalyticsSurface>
  );
}

/** Header-only skeleton: the shell stays put while the report loads. */
function RadarFallback() {
  return (
    <StudioShell crumbs={[{ label: "Intelligence" }, { label: "Intent Radar" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="mt-4 h-28 w-full" />
      <Skeleton className="mt-4 h-[320px] w-full" />
      <Skeleton className="mt-4 h-[360px] w-full" />
    </StudioShell>
  );
}
