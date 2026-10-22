"use client";

/**
 * Analytics → Website.
 *
 * One route, four tabs: Overview, Acquisition, Content, Audience. The tab is
 * `?tab=` (linkable, refresh-safe), the range is shared across tabs, and the
 * header/toolbar/state handling comes from `AnalyticsSurface`.
 *
 * Only the active tab is fetched. Switching tabs cancels the old request via
 * the report hook; the body renders the new report only when its tab matches,
 * so a slow request can never paint Acquisition numbers under the Content
 * heading.
 */

import { Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioShell } from "@/components/studio-shell";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient } from "@/lib/api-client";
import type {
  AcquisitionAnalytics,
  AudienceAnalytics,
  ContentAnalytics,
  WebsiteAnalytics,
} from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";
import {
  AnalyticsSurface,
  type SurfaceStatus,
} from "@/components/analytics/analytics-surface";
import {
  useAnalyticsTab,
  type AnalyticsTab,
} from "@/components/analytics/analytics-tabs";
import { OverviewTab } from "./overview-tab";
import { AcquisitionTab } from "./acquisition-tab";
import { ContentTab } from "./content-tab";
import { AudienceTab } from "./audience-tab";

const TABS: AnalyticsTab[] = [
  { id: "overview", label: "Overview" },
  { id: "acquisition", label: "Acquisition" },
  { id: "content", label: "Content" },
  { id: "audience", label: "Audience" },
];

type TabId = (typeof TABS)[number]["id"];

type TabReport =
  | { tab: "overview"; data: WebsiteAnalytics }
  | { tab: "acquisition"; data: AcquisitionAnalytics }
  | { tab: "content"; data: ContentAnalytics }
  | { tab: "audience"; data: AudienceAnalytics };

export default function WebsiteAnalyticsPage() {
  return (
    <Suspense fallback={<WebsiteFallback />}>
      <WebsiteAnalytics />
    </Suspense>
  );
}

function WebsiteAnalytics() {
  const company = useSelectedCompany();
  const [tab, setTab] = useAnalyticsTab(TABS);
  const [range, setRange] = useState<Range>("30d");
  // Acquisition filters survive a tab switch: a reader comparing channels
  // should not have to re-select them after looking at Content.
  const [compare, setCompare] = useState(false);
  const [channels, setChannels] = useState<string[]>([]);

  const { data, loading, loadError, refreshKey, setRefreshKey } =
    useCompanyReport<TabReport>(
      company,
      async (companyId) => {
        switch (tab as TabId) {
          case "acquisition":
            return {
              tab: "acquisition",
              data: await apiClient.analytics.acquisition(companyId, range, {
                compare,
                channels: channels.length > 0 ? channels : undefined,
              }),
            };
          case "content":
            return {
              tab: "content",
              data: await apiClient.analytics.content(companyId, range),
            };
          case "audience":
            return {
              tab: "audience",
              data: await apiClient.analytics.audience(companyId, range),
            };
          case "overview":
          default:
            return {
              tab: "overview",
              data: await apiClient.analytics.website(companyId, range),
            };
        }
      },
      [range, tab, compare, channels.join(",")]
    );

  // The report only describes the tab it was requested for. Anything else is a
  // stale response from the tab the reader just left.
  const active = data && data.tab === tab ? data : null;

  const status: SurfaceStatus = !company
    ? "empty"
    : loadError
      ? "error"
      : !active
        ? "loading"
        : "ready";

  const toggleChannel = (channel: string) =>
    setChannels((prev) =>
      prev.includes(channel) ? prev.filter((c) => c !== channel) : [...prev, channel]
    );

  return (
    <AnalyticsSurface
      crumbs={[{ label: "Analytics" }, { label: "Website" }]}
      title="Website"
      subtitle="Human traffic from the on-site tracker. Bots are filtered at write time, never at query time."
      freshness={active?.data.freshness}
      range={range}
      onRangeChange={setRange}
      onRefresh={() => setRefreshKey((k) => k + 1)}
      status={status}
      error={loadError}
      onRetry={() => setRefreshKey((k) => k + 1)}
      emptyMessage="Select a company to see its traffic."
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {active?.tab === "overview" && company && (
        <OverviewTab
          data={active.data}
          companyId={company.id}
          refreshKey={refreshKey}
        />
      )}
      {active?.tab === "acquisition" && (
        <AcquisitionTab
          data={active.data}
          refreshKey={refreshKey}
          compare={compare}
          onCompareChange={setCompare}
          channels={channels}
          onToggleChannel={toggleChannel}
          onClearChannels={() => setChannels([])}
        />
      )}
      {active?.tab === "content" && <ContentTab data={active.data} />}
      {active?.tab === "audience" && <AudienceTab data={active.data} />}
    </AnalyticsSurface>
  );
}

/** Header-only skeleton: the shell stays put while the tab reads the URL. */
function WebsiteFallback() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Website" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="mt-6 h-10 w-full" />
      <Skeleton className="mt-4 h-[420px] w-full" />
    </StudioShell>
  );
}
