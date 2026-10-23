"use client";

/**
 * Website → Content.
 *
 * What was read, and where the reading started. Paths carry views and
 * sessions; titles carry the document title the tag captured, which is the
 * only way to see two URLs that render the same article; channel and device
 * say who read it.
 *
 * The old opportunity map and content journeys are gone: they scored pages
 * from the same rows this tab already shows, and the journey edges were too
 * small a sample to act on.
 */

import { ListBullets } from "@phosphor-icons/react";
import type { ContentAnalytics } from "@/lib/api-client";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";

export function ContentTab({ data }: { data: ContentAnalytics }) {
  return (
    <div className="space-y-4">
      <MetricGrid
        columns={3}
        items={[
          { id: "pageviews", value: data.totals.pageviews },
          { id: "sessions", value: data.totals.sessions },
          { id: "scrolls", value: data.totals.scrolls },
          { id: "downloads", value: data.totals.downloads },
          { id: "clicks", value: data.totals.clicks },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Pages"
          description="Views and sessions by path."
          labelHeader="Path"
          rows={data.breakdowns.path}
          columns={[
            { key: "pageviews", label: "Views", mono: true },
            { key: "sessions", label: "Sessions" },
          ]}
        />
        <BreakdownTable
          title="Page titles"
          description="document.title captured by the tracker."
          labelHeader="Title"
          rows={data.breakdowns.title}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
        />
        <BreakdownTable
          title="Channels"
          description="Which channels read which content."
          rows={data.breakdowns.channel}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
        />
        <BreakdownTable
          title="Devices"
          description="Desktop vs mobile readership."
          rows={data.breakdowns.device}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
        />
      </div>

      <MetricStory
        metrics={["pageviews", "sessions", "scrolls", "downloads", "clicks"]}
      />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ListBullets className="size-3.5" aria-hidden="true" />
        Humans only — bot traffic is flagged at write time and excluded from
        every report. Totals refresh on the 15-minute rollup.
      </p>
    </div>
  );
}
