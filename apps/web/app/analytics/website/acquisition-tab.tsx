"use client";

/**
 * Website → Acquisition.
 *
 * Where the traffic came from, decided on-site: referrer host plus UTM tags.
 * No third-party audience data, and no Organic Search bucket — the tag cannot
 * tell dark organic from direct, so search-engine referrers stay under
 * Referral with the host preserved (D6). Saying that on the tab is cheaper than
 * explaining a missing row later.
 *
 * No traffic-trend chart here: the Overview tab is that chart's home, and
 * drawing the same daily pair twice on one surface would just repeat a number.
 * What this tab adds that Overview cannot say is the *mix* — how the sessions
 * divide by channel — and the tables underneath.
 */

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import type { AcquisitionAnalytics } from "@/lib/api-client";
import { BreakdownTable } from "@/components/analytics/breakdown-table";
import { CompositionBar } from "@/components/analytics/composition-bar";
import { DataQualityNote } from "@/components/analytics/data-quality-note";
import { deltaPct } from "@/components/analytics/format";
import { MetricGrid } from "@/components/analytics/metric-tile";
import { MetricStory } from "@/components/analytics/metric-story";
import { ChartLine } from "@phosphor-icons/react";

const ALL_CHANNELS = [
  "Direct",
  "Organic Social",
  "Campaign",
  "Email",
  "Referral",
];

export function AcquisitionTab({
  data,
  compare,
  onCompareChange,
  channels,
  onToggleChannel,
  onClearChannels,
}: {
  data: AcquisitionAnalytics;
  /** Still accepted for symmetry with the other tabs; unused since the tab stopped duplicating the Overview trend. */
  refreshKey?: number;
  compare: boolean;
  onCompareChange: (value: boolean) => void;
  channels: string[];
  onToggleChannel: (channel: string) => void;
  onClearChannels: () => void;
}) {
  const mix = data.breakdowns.channel.map((row) => ({
    label: row.label,
    value: Number(row.sessions ?? 0),
  }));
  const delta = (key: "sessions" | "uniques" | "pageviews") => {
    const pct = deltaPct(data.totals[key], data.previousTotals?.[key]);
    // More traffic is the goal this tab watches; the pill says so by colour.
    return pct === null ? null : { pct, good: true };
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-5 text-sm">
          <span className="inline-flex items-center gap-2 font-medium">
            <ChartLine
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Channels
          </span>
          {ALL_CHANNELS.map((channel) => (
            <label
              key={channel}
              className="inline-flex cursor-pointer items-center gap-1.5 text-[13px]"
            >
              <input
                type="checkbox"
                checked={channels.includes(channel)}
                onChange={() => onToggleChannel(channel)}
                className="size-3.5 accent-current"
              />
              {channel}
            </label>
          ))}
          {channels.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={onClearChannels}
            >
              Clear
            </Button>
          )}
          <Button
            variant={compare ? "default" : "outline"}
            size="sm"
            className="ml-auto h-8 text-xs"
            onClick={() => onCompareChange(!compare)}
            title="Compare against the previous equal-length period"
          >
            Compare
          </Button>
        </CardContent>
      </Card>

      <MetricGrid
        columns={3}
        items={[
          {
            id: "sessions",
            value: data.totals.sessions,
            delta: delta("sessions"),
          },
          {
            id: "uniques",
            value: data.totals.uniques,
            delta: delta("uniques"),
          },
          {
            id: "pageviews",
            value: data.totals.pageviews,
            delta: delta("pageviews"),
          },
        ]}
      />

      <CompositionBar
        title="Channel mix"
        description="How the range's sessions divide by channel. Untagged visits are Direct."
        rows={mix}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable
          title="Channels"
          description="Direct, Organic Social, Campaign, Email, Referral — derived on-site."
          rows={data.breakdowns.channel}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
        <BreakdownTable
          title="Source / medium"
          description="UTM source/medium, else the referrer host."
          rows={data.breakdowns.sourceMedium}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
        <BreakdownTable
          title="Campaigns"
          description="utm_campaign values; (not set) means untagged."
          rows={data.breakdowns.campaign}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
        <BreakdownTable
          title="Landing pages"
          description="The entry path of each session."
          labelHeader="Path"
          rows={data.breakdowns.landingPage}
          columns={[
            { key: "pageviews", label: "Views" },
            { key: "sessions", label: "Sessions" },
          ]}
          barKey="sessions"
        />
      </div>

      <MetricStory metrics={["sessions", "uniques", "pageviews"]} />
      <DataQualityNote notes={data.freshness.notes} />
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <ChartLine className="size-3.5" aria-hidden="true" />
        Totals refresh on the 15-minute rollup. Search-engine referrers report
        under Referral — there is no Organic Search bucket first-party, by
        design.
      </p>
    </div>
  );
}
