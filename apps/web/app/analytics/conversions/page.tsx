"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Target } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient } from "@/lib/api-client";
import { useCompanyReport, type Range } from "@/lib/analytics";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { FreshnessBadge } from "@/components/analytics/freshness-badge";
import { FunnelChart } from "@/components/analytics/funnel-chart";
import { Sparkline } from "@/components/analytics/sparkline";

const ConversionsTrendChart = dynamic(
  () => import("@/app/overview/overview-charts").then((m) => m.ConversionsChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[280px] w-full" />,
  }
);

export default function ConversionsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("30d");
  const { data, loading, loadError, refreshKey, setRefreshKey } = useCompanyReport(
    company,
    (companyId) => apiClient.analytics.conversions(companyId, range),
    [range]
  );

  const t = data?.totals;
  const assistedShare =
    t && t.conversions > 0
      ? Math.round((t.assistedConversions / t.conversions) * 100)
      : 0;

  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Conversions" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Conversions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Purchases and signups from tracked conversion events, with
            chat-assisted attribution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FreshnessBadge freshness={data?.freshness} />
          <label className="inline-flex h-8 items-center rounded-md border px-2 text-[13px] text-muted-foreground">
            Range
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              aria-label="Date range"
              className="ml-2 h-full bg-transparent pr-1 text-[13px] text-foreground focus:outline-none"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
            </select>
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            Refresh
          </Button>
        </div>
      </div>

      {!data ? (
        loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[280px] w-full" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-[60ch] rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center"
          >
            <p className="text-sm font-medium">Conversion analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {loadError}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              Retry
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Select a company to see its conversions.
          </p>
        )
      ) : (
        <div className="mt-6 min-w-0 space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              {
                label: "Conversions",
                value: t!.conversions.toLocaleString(),
                sparkline: data!.daily.map((d) => d.conversions),
              },
              {
                label: "Revenue",
                value: `$${t!.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                sparkline: data!.daily.map((d) => d.revenue),
              },
              {
                label: "Chat-assisted",
                value: `${t!.assistedConversions.toLocaleString()} (${assistedShare}%)`,
              },
              { label: "Conversion rate", value: `${t!.conversionRate}%` },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="pt-5">
                  <p className="text-[13px] text-muted-foreground">{k.label}</p>
                  <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                    {k.value}
                  </p>
                  {k.sparkline && (
                    <div className="mt-2">
                      <Sparkline values={k.sparkline} ariaLabel={`${k.label} per day`} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-[15px] font-semibold">
                    Conversions per day
                  </CardTitle>
                  <CardDescription className="text-[13px]">
                    ${t!.assistedRevenue.toLocaleString()} of ${t!.revenue.toLocaleString()} assisted by chat.
                  </CardDescription>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground">
                  ${t!.revenuePerSession}/session
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <ConversionsTrendChart daily={data.daily} refreshKey={refreshKey} />
            </CardContent>
          </Card>

          <FunnelChart
            title="Funnel"
            description="Session → open → conversation → conversion, with each step's survival of the previous one. Assisted means the session also chatted (approximate, same-session match)."
            stages={data.funnel}
          />

          <DataQualityNote notes={data.freshness.notes} />

          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="size-3.5" aria-hidden="true" />
            Fire conversion events with a value from the snippet
            (<code>data-ag-convert</code>) to fill this page. Totals refresh
            on the 15-minute rollup.
          </p>
        </div>
      )}
    </StudioShell>
  );
}
