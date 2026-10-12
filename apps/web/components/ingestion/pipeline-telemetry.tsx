"use client";

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  WarningCircle,
  ChatCircle,
  Code,
  CircleNotch,
} from "@phosphor-icons/react";
import { EmbedSnippet } from "./embed-snippet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export interface PipelineProgressData {
  stage:
    | "DISCOVERING"
    | "CRAWLING"
    | "PARSING"
    | "EMBEDDING"
    | "EXTRACTING"
    | "EXTRACTING_APPEARANCE"
    | "READY";
  crawled?: number;
  totalSelected?: number;
  docs?: number;
  failed?: number;
  skippedThin?: number;
  chunks?: number;
  facts?: number;
  message?: string;
}

export interface PipelineResultData {
  companyId: string;
  companyName: string;
  domain: string;
  snapshotId: string;
  version: number;
  insertedDocs: number;
  chunkCount: number;
  factCount: number;
  brand?: {
    logoUrl?: string | null;
    tokens?: {
      colors?: {
        primary?: string;
        secondary?: string;
        background?: string;
        foreground?: string;
      };
      radius?: string;
      style?: string;
    };
  } | null;
  timings: {
    discoveryMs: number;
    crawlMs: number;
    dbMs: number;
    totalMs: number;
  };
}

interface PipelineTelemetryProps {
  phase: string;
  progress: PipelineProgressData | null;
  logs: string[];
  result: PipelineResultData | null;
  error: string | null;
  onReset: () => void;
  appearanceActive?: boolean;
}

const STAGES = [
  { key: "DISCOVERING", label: "Discovery" },
  { key: "CRAWLING", label: "Fetch and parse" },
  { key: "EMBEDDING", label: "Chunk and embed" },
  { key: "EXTRACTING", label: "Brand facts" },
  { key: "READY", label: "Ready" },
];

export function PipelineTelemetry({
  phase,
  progress,
  logs,
  result,
  error,
  onReset,
  appearanceActive = false,
}: PipelineTelemetryProps) {
  const router = useRouter();
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const currentStage = progress?.stage || phase || "INITIALIZING";
  const isDone = !!result || currentStage === "READY";
  const isFailed = !!error;
  const showAppearance =
    appearanceActive ||
    currentStage === "EXTRACTING_APPEARANCE" ||
    logs.some((l) => l.includes("EXTRACTING_APPEARANCE"));

  const total = progress?.totalSelected || result?.insertedDocs || 1;
  const crawled = progress?.crawled || 0;
  const docs = result?.insertedDocs ?? (progress?.docs || 0);
  const skippedThin = progress?.skippedThin || 0;
  const failed = progress?.failed || 0;
  const chunks = result?.chunkCount ?? (progress?.chunks || 0);

  const crawlPct = Math.min(100, Math.round((crawled / Math.max(1, total)) * 100));

  const getStageStatus = (stageKey: string) => {
    const stageOrder = ["DISCOVERING", "CRAWLING", "PARSING", "EMBEDDING", "EXTRACTING", "EXTRACTING_APPEARANCE", "READY"];
    const currentIndex = stageOrder.indexOf(currentStage);
    const targetIndex = stageOrder.indexOf(stageKey);

    if (isDone) return "completed";
    if (isFailed && targetIndex === currentIndex) return "failed";
    if (currentIndex > targetIndex) return "completed";
    if (currentIndex === targetIndex) return "active";
    return "pending";
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Pipeline progress */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-[15px] font-semibold">
              Pipeline progress
            </CardTitle>
            {isDone ? (
              <Badge
                variant="outline"
                className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
              >
                <CheckCircle className="mr-1 size-3.5" aria-hidden="true" />
                Complete
              </Badge>
            ) : isFailed ? (
              <Badge
                variant="outline"
                className="rounded-full border-destructive/40 bg-destructive/10 font-normal text-destructive"
              >
                <WarningCircle className="mr-1 size-3.5" aria-hidden="true" />
                Failed
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="rounded-full font-normal"
              >
                <span className="mr-1.5 size-1.5 rounded-full bg-[hsl(var(--chart-1))]" />
                {currentStage.toLowerCase().replace(/_/g, " ")}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {STAGES.map((s, i) => {
              const status = getStageStatus(s.key);
              return (
                <li
                  key={s.key}
                  className={`rounded-lg border px-2.5 py-2 text-xs ${
                    status === "completed"
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                      : status === "active"
                        ? "border-primary/40 bg-primary/5 font-medium text-foreground"
                        : status === "failed"
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="font-sans text-[11px] tabular-nums">
                      {i + 1}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </span>
                </li>
              );
            })}
          </ol>
          {showAppearance && !isDone && (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs text-violet-700 dark:text-violet-300">
              <span className="size-1.5 rounded-full bg-violet-500" />
              Styling the assistant to match the site
            </p>
          )}
          {/* Telemetry strip */}
          <div className="mt-4 grid grid-cols-2 gap-y-4 border-t pt-4 md:grid-cols-4 md:divide-x md:divide-border">
            <div className="min-w-0 pr-4">
              <p className="text-[13px] text-muted-foreground">Fetched</p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {crawled}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {total}
                </span>
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-[hsl(var(--chart-1))] transition-all duration-300"
                  style={{ width: `${crawlPct}%` }}
                />
              </div>
            </div>
            <div className="min-w-0 pr-4 md:px-5">
              <p className="text-[13px] text-muted-foreground">
                Pages kept
              </p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {docs}
              </p>
            </div>
            <div className="min-w-0 pr-4 md:px-5">
              <p className="text-[13px] text-muted-foreground">
                Skipped as thin
              </p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {skippedThin}
              </p>
            </div>
            <div className="min-w-0 md:pl-5">
              <p className="text-[13px] text-muted-foreground">Failed</p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {failed}
              </p>
            </div>
          </div>
          <p className="mt-4 border-t pt-3 text-[13px] text-muted-foreground">
            {chunks > 0
              ? `${chunks.toLocaleString()} search chunks ready. `
              : ""}
            Runs on this page. Safe to leave; it resumes on return.
          </p>
        </CardContent>
      </Card>

      {/* Failure with recovery */}
      {isFailed && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <WarningCircle className="size-4 shrink-0" aria-hidden="true" />
            The crawl failed
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {error}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            The site may block automated reads, or the connection dropped.
            Retry, or pick fewer pages.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={onReset}
          >
            Back to discovery
          </Button>
        </div>
      )}

      {/* Completion payoff */}
      {isDone && result && (
        <Card className="border-emerald-500/30">
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <CheckCircle
                  className="size-8 shrink-0 text-emerald-500"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">
                    {result.companyName} is ready to chat
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {result.insertedDocs.toLocaleString()} pages ·{" "}
                    {result.chunkCount.toLocaleString()} search chunks ·{" "}
                    Snapshot v{result.version} ·{" "}
                    {(result.timings.totalMs / 1000).toFixed(1)}s
                    {skippedThin > 0 &&
                      ` · ${skippedThin.toLocaleString()} pruned as duplicates`}
                    {failed > 0 && ` · ${failed} failed`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    router.push("/integration/embed-snippet")
                  }
                >
                  <Code className="size-4" aria-hidden="true" />
                  Get embed code
                </Button>
                <Button
                  onClick={() => router.push("/playground")}
                >
                  <ChatCircle className="size-4" aria-hidden="true" />
                  Test in Playground
                </Button>
              </div>
            </div>

            {/* Brand swatches */}
            {result.brand?.tokens?.colors && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
                <span>Assistant wears these brand colors:</span>
                {Object.entries(result.brand.tokens.colors).map(
                  ([key, color]) => (
                    <span
                      key={key}
                      className="inline-flex items-center gap-1.5"
                      title={`${key}: ${color}`}
                    >
                      <span
                        className="size-3.5 rounded-full border border-border"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-mono text-[11px]">{color}</span>
                    </span>
                  )
                )}
              </div>
            )}

            {/* Embeddable chatbot snippet (opaque widget key, raw shown once) */}
            <EmbedSnippet result={result} />

            <div className="mt-3 border-t pt-3">
              <Button
                variant="link"
                className="h-auto p-0 text-[13px] font-normal"
                onClick={() =>
                  router.push(
                    `/experience/appearance?company=${encodeURIComponent(result.companyId)}`
                  )
                }
              >
                View stylesheet in Appearance
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity log, disclosed */}
      <Collapsible>
        <Card>
          <CardContent className="pt-5">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
              >
                <CircleNotch className="size-3.5" aria-hidden="true" />
                Activity log ({logs.length} events)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div
                ref={logContainerRef}
                className="mt-3 max-h-52 select-text space-y-1 overflow-y-auto rounded-lg border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed"
              >
                {logs.length === 0 ? (
                  <p className="italic text-muted-foreground">
                    Waiting for pipeline events.
                  </p>
                ) : (
                  logs.map((line, i) => (
                    <p
                      key={i}
                      className={
                        line.includes("COMPLETE") ||
                        line.includes("done:") ||
                        line.includes("READY")
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : line.includes("failed") || line.includes("error")
                            ? "text-destructive"
                            : line.includes("thin/dup") ||
                                line.includes("thin")
                              ? "text-amber-600 dark:text-amber-400"
                              : line.includes("[INGEST]") ||
                                  line.includes("[DISCOVERY]")
                                ? "text-primary"
                                : "text-muted-foreground"
                      }
                    >
                      {line}
                    </p>
                  ))
                )}
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </div>
  );
}
