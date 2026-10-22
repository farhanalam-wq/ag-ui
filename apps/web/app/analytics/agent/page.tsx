"use client";

import { useState } from "react";
import { Robot, ShieldCheck } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function AgentAnalyticsPage() {
  const company = useSelectedCompany();
  const [range, setRange] = useState<Range>("14d");
  const { data, loading, loadError } = useCompanyReport(
    company,
    (companyId) => apiClient.analytics.overview(companyId, range),
    [range]
  );

  const trust = data?.trust;

  return (
    <StudioShell crumbs={[{ label: "Analytics" }, { label: "Agent" }]}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Agent
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            How trustworthy and fast the assistant is — grounding, fallbacks,
            and answer latency measured from real chats.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data && (
            <Badge
              variant="outline"
              className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
            >
              Live
            </Badge>
          )}
          <label className="inline-flex h-8 items-center rounded-md border px-2 text-[13px] text-muted-foreground">
            Range
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as Range)}
              aria-label="Date range"
              className="ml-2 h-full bg-transparent pr-1 text-[13px] text-foreground focus:outline-none"
            >
              <option value="14d">Last 14 days</option>
              <option value="7d">Last 7 days</option>
            </select>
          </label>
        </div>
      </div>

      {!data ? (
        loading ? (
          <div className="mt-6 space-y-4">
            <Skeleton className="h-[120px] w-full" />
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="mx-auto mt-6 max-w-[60ch] rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-center"
          >
            <p className="text-sm font-medium">Agent analytics unavailable</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {loadError}
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Select a company to see how its assistant performs.
          </p>
        )
      ) : (
        trust && (
          <div className="mt-6 min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[
                {
                  label: "Grounded answers",
                  value: `${trust.groundedCoverage}%`,
                  hint: "Assistant answers citing a learned source.",
                },
                {
                  label: "Fallback rate",
                  value: `${trust.fallbackRate}%`,
                  hint: "Conversations with no grounded answer at all.",
                },
                {
                  label: "Answer latency p50",
                  value: `${trust.latencyP50.toLocaleString()}ms`,
                  hint: "Median user-question → assistant-answer gap.",
                },
                {
                  label: "Answer latency p95",
                  value: `${trust.latencyP95.toLocaleString()}ms`,
                  hint: "Slowest 5% — embedding + model + retrieval.",
                },
              ].map((k) => (
                <Card key={k.label}>
                  <CardContent className="pt-5">
                    <p className="text-[13px] text-muted-foreground">{k.label}</p>
                    <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                      {k.value}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-[15px] font-semibold">
                  Reading these numbers
                </CardTitle>
                <CardDescription className="text-[13px]">
                  Grounded means the answer carried evidence from your pages.
                  Latency is measured message-to-message, capped at two
                  minutes to exclude idle tabs.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3 text-sm">
                <ShieldCheck className="size-5 shrink-0 text-emerald-500" aria-hidden="true" />
                <p className="text-muted-foreground">
                  {trust.groundedCoverage >= 70
                    ? "Grounding is healthy — most answers cite sources."
                    : trust.groundedCoverage > 0
                      ? "Grounding needs work — check the blindspots on the Intent page."
                      : "No grounded answers yet — ingest more pages or check retrieval."}
                </p>
              </CardContent>
            </Card>

            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Robot className="size-3.5" aria-hidden="true" />
              Citation click-through arrives with click tracking — until then it
              reads 0 by construction, not by measurement.
            </p>
          </div>
        )
      )}
    </StudioShell>
  );
}
