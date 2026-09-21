"use client";

import React, { useEffect, useRef } from "react";
import {
  CheckCircle,
  WarningCircle,
  Clock,
  Sparkle,
  ArrowRight,
  Database,
  Globe,
  Tag,
  ShareNetwork,
  Cpu,
} from "@phosphor-icons/react";

export interface PipelineProgressData {
  stage: "DISCOVERING" | "CRAWLING" | "PARSING" | "EMBEDDING" | "EXTRACTING" | "READY";
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
  onLaunchChat: () => void;
  onReset: () => void;
}

const STAGES = [
  { key: "DISCOVERING", label: "Discovery" },
  { key: "CRAWLING", label: "Fetch & Parse" },
  { key: "EMBEDDING", label: "Chunk & Embed (Qdrant)" },
  { key: "EXTRACTING", label: "Brand Facts" },
  { key: "READY", label: "Ready" },
];

export function PipelineTelemetry({
  phase,
  progress,
  logs,
  result,
  error,
  onLaunchChat,
  onReset,
}: PipelineTelemetryProps) {
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

  const total = progress?.totalSelected || result?.insertedDocs || 1;
  const crawled = progress?.crawled || 0;
  const docs = result?.insertedDocs ?? (progress?.docs || 0);
  const skippedThin = progress?.skippedThin || 0;
  const failed = progress?.failed || 0;
  const chunks = result?.chunkCount ?? (progress?.chunks || 0);

  const crawlPct = Math.min(100, Math.round((crawled / Math.max(1, total)) * 100));

  const getStageStatus = (stageKey: string) => {
    const stageOrder = ["DISCOVERING", "CRAWLING", "PARSING", "EMBEDDING", "EXTRACTING", "READY"];
    const currentIndex = stageOrder.indexOf(currentStage);
    const targetIndex = stageOrder.indexOf(stageKey);

    if (isDone) return "completed";
    if (isFailed && targetIndex === currentIndex) return "failed";
    if (currentIndex > targetIndex) return "completed";
    if (currentIndex === targetIndex) return "active";
    return "pending";
  };

  return (
    <div className="w-full space-y-6">
      {/* Pipeline Stage Bar */}
      <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/60 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-3">
          <div className="text-xs font-mono font-medium text-zinc-400 uppercase tracking-wider flex items-center gap-2">
            <span>Pipeline Execution</span>
            <span className="text-zinc-600">•</span>
            <span className="text-brand-primary lowercase font-sans">
              {currentStage.toLowerCase()}
            </span>
          </div>
          <div className="text-xs font-mono text-zinc-500">
            {isDone ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle className="size-3.5" /> Complete
              </span>
            ) : isFailed ? (
              <span className="text-red-400 font-semibold flex items-center gap-1">
                <WarningCircle className="size-3.5" /> Failed
              </span>
            ) : (
              <span className="text-zinc-400 animate-pulse">Running In-Process...</span>
            )}
          </div>
        </div>

        {/* Progress Stages Stepper */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STAGES.map((s, i) => {
            const status = getStageStatus(s.key);
            return (
              <div
                key={s.key}
                className={`p-2 rounded-lg border text-xs transition-all ${
                  status === "completed"
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                    : status === "active"
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold animate-pulse"
                    : status === "failed"
                    ? "border-red-500/30 bg-red-500/5 text-red-400"
                    : "border-zinc-800/60 bg-zinc-900/30 text-zinc-500"
                }`}
              >
                <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase">
                  <span>[{i + 1}]</span>
                  <span className="truncate">{s.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Real-time Telemetry Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Fetched</div>
          <div className="text-lg font-bold text-zinc-100 mt-0.5">
            {crawled}{" "}
            <span className="text-xs font-normal text-zinc-400">/ {total}</span>
          </div>
          <div className="w-full bg-zinc-800 h-1 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-brand-primary h-full transition-all duration-300"
              style={{ width: `${crawlPct}%` }}
            />
          </div>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Docs Retained</div>
          <div className="text-lg font-bold text-emerald-400 mt-0.5">{docs}</div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">clean markdown</div>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40" title="Pruned via SHA-256 content hashing & <50 word threshold">
          <div className="text-[10px] font-mono text-amber-500/80 uppercase">Thin/Duplicate</div>
          <div className="text-lg font-bold text-amber-400 mt-0.5">{skippedThin}</div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">filtered & pruned</div>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Dead Letters</div>
          <div className={`text-lg font-bold mt-0.5 ${failed > 0 ? "text-red-400" : "text-zinc-400"}`}>
            {failed}
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">404s/timeouts</div>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Qdrant Vectors</div>
          <div className="text-lg font-bold text-cyan-400 mt-0.5">{chunks}</div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">1536-dim points</div>
        </div>

        <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/40">
          <div className="text-[10px] font-mono text-zinc-500 uppercase">Vector Engine</div>
          <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            Qdrant :6333
          </div>
          <div className="text-[10px] text-zinc-500 font-mono mt-1">HNSW Indexing</div>
        </div>
      </div>

      {/* Failure Box */}
      {isFailed && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300 flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="font-semibold text-red-200">Ingestion Pipeline Encountered an Error:</div>
            <div className="font-mono text-[11px] text-red-400">{error}</div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 rounded-md border border-red-500/40 hover:bg-red-500/20 text-red-200 text-xs transition-colors shrink-0"
          >
            Retry Discovery
          </button>
        </div>
      )}

      {/* Completion Summary Card */}
      {isDone && result && (
        <div className="p-5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-md space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle className="size-5 text-emerald-400" />
                <h3 className="text-base font-bold text-zinc-100">
                  {result.companyName}{" "}
                  <span className="text-xs font-mono font-normal text-zinc-400">
                    ({result.domain})
                  </span>
                </h3>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Snapshot v{result.version}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Knowledge base fully indexed into PostgreSQL & Qdrant with brand tokens extracted.
              </p>
            </div>

            <button
              type="button"
              onClick={onLaunchChat}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-lg shadow-emerald-500/20 transition-all shrink-0 cursor-pointer"
            >
              <span>Launch Intelligence Chat</span>
              <ArrowRight className="size-3.5" />
            </button>
          </div>

          {/* Timing Breakdown Table */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-zinc-800/80 text-xs">
            <div>
              <span className="text-zinc-500 block text-[11px] font-mono">Discovery Time:</span>
              <span className="font-semibold text-zinc-200 font-mono">
                {result.timings.discoveryMs.toLocaleString()}ms
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px] font-mono">Crawl & Parse:</span>
              <span className="font-semibold text-zinc-200 font-mono">
                {(result.timings.crawlMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px] font-mono">Embed & Database:</span>
              <span className="font-semibold text-zinc-200 font-mono">
                {(result.timings.dbMs / 1000).toFixed(1)}s
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block text-[11px] font-mono">Total Pipeline:</span>
              <span className="font-semibold text-emerald-400 font-mono">
                {(result.timings.totalMs / 1000).toFixed(1)}s
              </span>
            </div>
          </div>

          {/* Brand Palette Swatch */}
          {result.brand?.tokens?.colors && (
            <div className="flex items-center gap-3 pt-2 border-t border-zinc-800/60 text-xs text-zinc-400">
              <span className="text-[11px] font-mono text-zinc-500">Brand Palette:</span>
              <div className="flex items-center gap-1.5">
                {Object.entries(result.brand.tokens.colors).map(([key, color]) => (
                  <div key={key} className="flex items-center gap-1">
                    <span
                      className="size-3.5 rounded-full border border-zinc-700 shadow-sm"
                      style={{ backgroundColor: color }}
                      title={`${key}: ${color}`}
                    />
                    <span className="text-[10px] font-mono text-zinc-400 hidden sm:inline">
                      {color}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Terminal Monospace Activity Log Stream */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden shadow-inner">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800/80 bg-zinc-900/70 text-[11px] font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <div className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Telemetry Activity Stream</span>
          </div>
          <span className="text-zinc-500">{logs.length} events logged</span>
        </div>

        <div
          ref={logContainerRef}
          className="p-3 max-h-52 overflow-y-auto font-mono text-[11px] space-y-1 text-zinc-400 select-text leading-relaxed"
        >
          {logs.length === 0 ? (
            <div className="text-zinc-600 italic">Waiting for pipeline events...</div>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                className={
                  line.includes("COMPLETE") || line.includes("done:") || line.includes("READY")
                    ? "text-emerald-400 font-semibold"
                    : line.includes("failed") || line.includes("error")
                    ? "text-red-400"
                    : line.includes("thin/dup") || line.includes("thin")
                    ? "text-amber-400/90"
                    : line.includes("[INGEST]") || line.includes("[DISCOVERY]")
                    ? "text-brand-primary"
                    : "text-zinc-300"
                }
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
