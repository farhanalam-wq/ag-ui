"use client";

/**
 * Analytics → Agent.
 *
 * One route, four tabs: Overview, Questions, Quality, Voice — the same shell,
 * range control and state handling as Website. Each tab has its own endpoint,
 * so the browser never receives one combined payload it then slices.
 *
 * Only the active tab is fetched. A response is rendered only when its tab
 * still matches, so a slow Quality request cannot paint under Questions.
 */

import { Suspense, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioShell } from "@/components/studio-shell";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient } from "@/lib/api-client";
import type {
  AgentOverviewAnalytics,
  AgentQualityAnalytics,
  AgentQuestionsAnalytics,
  VoiceAnalytics,
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
import { AgentOverviewTab } from "./overview-tab";
import { AgentQuestionsTab } from "./questions-tab";
import { AgentQualityTab } from "./quality-tab";
import { VoiceTab } from "./voice-tab";

const TABS: AnalyticsTab[] = [
  { id: "overview", label: "Overview" },
  { id: "questions", label: "Questions" },
  { id: "quality", label: "Quality" },
  { id: "voice", label: "Voice" },
];

type TabId = (typeof TABS)[number]["id"];

type TabReport =
  | { tab: "overview"; data: AgentOverviewAnalytics }
  | { tab: "questions"; data: AgentQuestionsAnalytics }
  | { tab: "quality"; data: AgentQualityAnalytics }
  | { tab: "voice"; data: VoiceAnalytics };

export default function AgentAnalyticsPage() {
  return (
    <Suspense fallback={<AgentFallback />}>
      <AgentAnalytics />
    </Suspense>
  );
}

function AgentAnalytics() {
  const company = useSelectedCompany();
  const [tab, setTab] = useAnalyticsTab(TABS);
  const [range, setRange] = useState<Range>("14d");

  const { data, loadError, refreshKey, setRefreshKey } =
    useCompanyReport<TabReport>(
      company,
      async (companyId) => {
        switch (tab as TabId) {
          case "questions":
            return {
              tab: "questions",
              data: await apiClient.analytics.agentQuestions(companyId, range),
            };
          case "quality":
            return {
              tab: "quality",
              data: await apiClient.analytics.agentQuality(companyId, range),
            };
          case "voice":
            return {
              tab: "voice",
              data: await apiClient.analytics.agentVoice(companyId, range),
            };
          case "overview":
          default:
            return {
              tab: "overview",
              data: await apiClient.analytics.agentOverview(companyId, range),
            };
        }
      },
      [range, tab]
    );

  // The report only describes the tab it was requested for.
  const active = data && data.tab === tab ? data : null;

  const status: SurfaceStatus = !company
    ? "empty"
    : loadError
      ? "error"
      : !active
        ? "loading"
        : "ready";

  return (
    <AnalyticsSurface
      crumbs={[{ label: "Analytics" }, { label: "Agent" }]}
      title="Agent"
      subtitle="How visitors use the assistant: opens, questions, grounding, and voice. Counts only — question text is never stored."
      freshness={active?.data.freshness}
      range={range}
      onRangeChange={setRange}
      onRefresh={() => setRefreshKey((k) => k + 1)}
      status={status}
      error={loadError}
      onRetry={() => setRefreshKey((k) => k + 1)}
      emptyMessage="Select a company to see how its assistant performs."
      tabs={TABS}
      activeTab={tab}
      onTabChange={setTab}
    >
      {active?.tab === "overview" && (
        <AgentOverviewTab data={active.data} refreshKey={refreshKey} />
      )}
      {active?.tab === "questions" && <AgentQuestionsTab data={active.data} />}
      {active?.tab === "quality" && (
        <AgentQualityTab data={active.data} refreshKey={refreshKey} />
      )}
      {active?.tab === "voice" && (
        <VoiceTab data={active.data} refreshKey={refreshKey} />
      )}
    </AnalyticsSurface>
  );
}

/** Header-only skeleton: the shell stays put while the tab reads the URL. */
function AgentFallback() {
  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Agent" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-8 w-48" />
      </div>
      <Skeleton className="mt-6 h-10 w-full" />
      <Skeleton className="mt-4 h-[420px] w-full" />
    </StudioShell>
  );
}
