"use client";

/**
 * Website → Audience.
 *
 * Who the visitors are, as far as a first-party tag can know: device, browser,
 * operating system, and the hour of the day they browse. All four are the same
 * visit grid read four ways, so the numbers add up to the same sessions.
 *
 * Country is deliberately absent — there is no agreed GeoIP source (D12) — and
 * so is new-vs-returning (D3). A tab that pretends otherwise would be the only
 * place in the module where a number had no source.
 */

import { Users } from "@phosphor-icons/react";
import type { AudienceAnalytics } from "@/lib/api-client";
import { BarList } from "@/components/analytics/bar-list";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";

export function AudienceTab({ data }: { data: AudienceAnalytics }) {
  // The hour breakdown is ordered 00:00 → 23:00 by the report: a distribution
  // over the day, not a ranking. Everything else is ranked by sessions.
  const hours = data.breakdowns.hour.map((row) => ({
    label: String(row.label),
    value: Number(row.sessions ?? 0),
  }));

  return (
    <div className="space-y-4">
      <MetricGrid
        columns={3}
        items={[
          { id: "sessions", value: data.totals.sessions },
          { id: "pageviews", value: data.totals.pageviews },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Devices"
          description="Desktop vs mobile, bucketed from viewport width."
          rows={data.breakdowns.device}
          columns={[
            { key: "sessions", label: "Sessions" },
            { key: "pageviews", label: "Views" },
          ]}
        />
        <BreakdownTable
          title="Browsers"
          description="Derived once at the collector, never re-parsed here."
          rows={data.breakdowns.browser}
          columns={[
            { key: "sessions", label: "Sessions" },
            { key: "pageviews", label: "Views" },
          ]}
        />
        <BreakdownTable
          title="Operating systems"
          description="The same visit, from the same user agent."
          rows={data.breakdowns.os}
          columns={[
            { key: "sessions", label: "Sessions" },
            { key: "pageviews", label: "Views" },
          ]}
        />
        <BarList
          title="Hour of day"
          description="Sessions by the visitor's local hour. The bar row is a day, read left to right."
          rows={hours}
        />
      </div>

      <MetricStory metrics={["sessions", "pageviews"]} />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Users className="size-3.5" aria-hidden="true" />
        {data.timezoneCoverage < 100
          ? `${data.timezoneCoverage}% of visits reported a timezone; the rest are bucketed in UTC.`
          : "Every visit reported a timezone."}{" "}
        No country and no new-vs-returning — neither has a first-party source
        here.
      </p>
    </div>
  );
}
