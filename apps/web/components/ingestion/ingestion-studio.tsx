"use client";

import React, { useState } from "react";
import {
  Globe,
  MagnifyingGlass,
  ArrowLeft,
  Sparkle,
  Sliders,
  CheckCircle,
  WarningCircle,
  Lightning,
  TreeStructure,
} from "@phosphor-icons/react";
import {
  apiClient,
  type DiscoveryResponse,
  type DiscoveredPageItem,
} from "@/lib/api-client";
import { DiscoveryTable } from "./discovery-table";
import {
  PipelineTelemetry,
  type PipelineProgressData,
  type PipelineResultData,
} from "./pipeline-telemetry";
import type { CompanyItem } from "../sidebar/company-switcher";

interface IngestionStudioProps {
  onCompanyIndexed: (company: CompanyItem) => void;
  onCancel: () => void;
}

const QUICK_EXAMPLES = [
  "https://dummyjson.com",
  "https://mrftyres.com",
  "https://resend.com",
  "https://ambujacement.com",
  "https://stripe.com",
];

export function IngestionStudio({ onCompanyIndexed, onCancel }: IngestionStudioProps) {
  // Step state: 'input' | 'discovered' | 'ingesting' | 'done'
  const [step, setStep] = useState<"input" | "discovered" | "ingesting" | "done">("input");

  // Input & Discovery state
  const [targetUrl, setTargetUrl] = useState("");
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [discoveryData, setDiscoveryData] = useState<DiscoveryResponse | null>(null);

  // Selection state
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());

  // Pipeline telemetry state
  const [phase, setPhase] = useState<string>("INITIALIZING");
  const [progress, setProgress] = useState<PipelineProgressData | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<PipelineResultData | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // Advanced Tuning settings
  const [showTuning, setShowTuning] = useState(false);
  const [fetchConcurrency, setFetchConcurrency] = useState(25);
  const [parseConcurrency, setParseConcurrency] = useState(5);
  const [embedConcurrency, setEmbedConcurrency] = useState(3);
  const [hostGapMs, setHostGapMs] = useState(150);

  // 1. Run Discovery
  const handleDiscover = async (urlToDiscover?: string) => {
    const raw = (urlToDiscover || targetUrl).trim();
    if (!raw || isDiscovering) return;

    let clean = raw;
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }

    setTargetUrl(clean);
    setIsDiscovering(true);
    setDiscoveryError(null);

    try {
      const resp = await apiClient.crawler.discover(clean);
      setDiscoveryData(resp);

      // Default selection: Top 20 pages
      const defaultSelected = new Set(resp.pages.slice(0, 20).map((p) => p.url));
      setSelectedUrls(defaultSelected);

      setStep("discovered");
    } catch (err: any) {
      setDiscoveryError(err.message || "Failed to discover crawlable pages");
    } finally {
      setIsDiscovering(false);
    }
  };

  // Selection helpers
  const handleToggleUrl = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!discoveryData) return;
    setSelectedUrls(new Set(discoveryData.pages.map((p) => p.url)));
  };

  const handleSelectNone = () => {
    setSelectedUrls(new Set());
  };

  const handleSelectTopN = (n: number) => {
    if (!discoveryData) return;
    const top = discoveryData.pages.slice(0, n).map((p) => p.url);
    setSelectedUrls(new Set(top));
  };

  const handleApplyRange = (rangeStr: string) => {
    if (!discoveryData) return;
    const total = discoveryData.pages.length;
    const s = rangeStr.trim().toLowerCase();

    if (s === "all" || s === "a") {
      handleSelectAll();
      return;
    }

    if (/^\d+$/.test(s)) {
      handleSelectTopN(parseInt(s, 10));
      return;
    }

    const indices = new Set<number>();
    for (const part of s.split(",")) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
      if (m) {
        let a = Math.max(1, parseInt(m[1], 10));
        let b = Math.min(total, parseInt(m[2], 10));
        if (a > b) [a, b] = [b, a];
        for (let i = a; i <= b; i++) indices.add(i - 1);
      } else if (/^\d+$/.test(p)) {
        const n = parseInt(p, 10);
        if (n >= 1 && n <= total) indices.add(n - 1);
      }
    }

    const next = new Set<string>();
    for (const idx of indices) {
      if (discoveryData.pages[idx]) {
        next.add(discoveryData.pages[idx].url);
      }
    }
    setSelectedUrls(next);
  };

  // 2. Start Ingestion Stream
  const handleStartIngest = async () => {
    if (!discoveryData || selectedUrls.size === 0) return;

    setStep("ingesting");
    setLogs([
      `[INGEST] Target: ${discoveryData.origin} (${discoveryData.domain})`,
      `[INGEST] Selected: ${selectedUrls.size} URLs`,
      `[INGEST] Concurrency: fetch=${fetchConcurrency}, parse=${parseConcurrency}, embed=${embedConcurrency}, hostgap=${hostGapMs}ms`,
    ]);
    setProgress(null);
    setResult(null);
    setPipelineError(null);

    try {
      await apiClient.crawler.ingestStream(
        {
          url: discoveryData.origin,
          selectedUrls: Array.from(selectedUrls),
          fetchConcurrency,
          parseConcurrency,
          embedConcurrency,
          hostGapMs,
        },
        {
          onPhase: (p, msg) => {
            setPhase(p);
            if (msg) setLogs((prev) => [...prev, `[PHASE: ${p}] ${msg}`]);
          },
          onProgress: (prog) => {
            setProgress(prog as any);
            setLogs((prev) => [
              ...prev,
              `[${prog.stage}] fetched=${prog.crawled ?? 0}/${prog.totalSelected ?? selectedUrls.size} docs=${prog.docs ?? 0} thin/dup=${prog.skippedThin ?? 0} dead=${prog.failed ?? 0}`,
            ]);
          },
          onDone: (res: PipelineResultData) => {
            setResult(res);
            setStep("done");
            setLogs((prev) => [
              ...prev,
              `[COMPLETE] ${res.companyName} (${res.domain}) indexed! Docs: ${res.insertedDocs}, Chunks: ${res.chunkCount}, Facts: ${res.factCount} in ${(res.timings.totalMs / 1000).toFixed(1)}s`,
            ]);
          },
          onError: (err) => {
            setPipelineError(err.message);
            setLogs((prev) => [...prev, `[ERROR] ${err.message}`]);
          },
        }
      );
    } catch (err: any) {
      setPipelineError(err.message || "Pipeline execution failed");
      setLogs((prev) => [...prev, `[FATAL] ${err.message}`]);
    }
  };

  // 3. Hand off company to chat
  const handleLaunchChat = () => {
    if (!result) return;

    const brandColor = result.brand?.tokens?.colors?.primary || "#3b82f6";
    const companyPayload: CompanyItem = {
      id: result.companyId,
      name: result.companyName,
      domain: result.domain,
      description: `Indexed knowledge base for ${result.companyName} (${result.domain}).`,
      brandColor,
      badge: `${result.chunkCount} Chunks • Indexed`,
      suggestedQueries: [
        `What are the core products and APIs provided by ${result.companyName}?`,
        `What are the pricing tiers, limits, and plan options?`,
        `Where are ${result.companyName} headquarters and contact options?`,
        `What enterprise security and compliance certifications exist?`,
      ],
    };

    onCompanyIndexed(companyPayload);
  };

  const handleReset = () => {
    setStep("input");
    setDiscoveryData(null);
    setSelectedUrls(new Set());
    setLogs([]);
    setProgress(null);
    setResult(null);
    setPipelineError(null);
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Studio Header Bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="p-2 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="Return to Intelligence Chat"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                In-Process Ingestion Engine
              </span>
              <span className="text-zinc-500">•</span>
              <span className="text-xs font-mono text-zinc-400">Qdrant Vector Intelligence</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-zinc-100 mt-0.5">
              Ingestion Studio & Knowledge Crawler
            </h1>
          </div>
        </div>

        {step !== "input" && (
          <button
            type="button"
            onClick={handleReset}
            className="text-xs text-zinc-400 hover:text-zinc-200 underline font-mono"
          >
            New URL
          </button>
        )}
      </div>

      {/* STEP 1: Target URL Input & Discovery Trigger */}
      {step === "input" && (
        <div className="space-y-6 max-w-2xl mx-auto py-8">
          <div className="text-center space-y-2">
            <div className="size-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto text-brand-primary shadow-lg shadow-brand-primary/10">
              <Globe className="size-6" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Enter Company Website or Domain
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Autonomous discovery will probe <code className="text-zinc-300">robots.txt</code>, recursive sitemap indices, and <code className="text-zinc-300">llms.txt</code> to classify all crawlable pages.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleDiscover();
            }}
            className="space-y-3"
          >
            <div className="relative">
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                disabled={isDiscovering}
                className="w-full h-12 pl-4 pr-36 rounded-xl border border-zinc-800 bg-zinc-900/90 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary shadow-inner transition-all font-mono"
              />
              <button
                type="submit"
                disabled={!targetUrl.trim() || isDiscovering}
                className="absolute right-1.5 top-1.5 bottom-1.5 px-4 rounded-lg bg-brand-primary hover:opacity-90 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer"
              >
                {isDiscovering ? (
                  <>
                    <div className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    <span>Discovering...</span>
                  </>
                ) : (
                  <>
                    <MagnifyingGlass className="size-3.5" />
                    <span>Discover Pages</span>
                  </>
                )}
              </button>
            </div>

            {discoveryError && (
              <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-center gap-2">
                <WarningCircle className="size-4 shrink-0" />
                <span>{discoveryError}</span>
              </div>
            )}
          </form>

          {/* Quick Examples */}
          <div className="space-y-2 text-center">
            <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">
              Popular Examples
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {QUICK_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setTargetUrl(ex);
                    handleDiscover(ex);
                  }}
                  className="px-2.5 py-1 rounded-md border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-mono"
                >
                  {ex.replace("https://", "")}
                </button>
              ))}
            </div>
          </div>

          {/* Concurrency Tuning Accordion */}
          <div className="pt-4 border-t border-zinc-900">
            <button
              type="button"
              onClick={() => setShowTuning(!showTuning)}
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 font-mono transition-colors mx-auto block"
            >
              <Sliders className="size-3.5" />
              <span>{showTuning ? "Hide Pipeline Concurrency Tuning" : "Advanced Pipeline Concurrency Tuning"}</span>
            </button>

            {showTuning && (
              <div className="mt-4 p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/60 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                <div>
                  <label className="text-zinc-500 block mb-1">Fetch Width</label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={fetchConcurrency}
                    onChange={(e) => setFetchConcurrency(parseInt(e.target.value, 10) || 25)}
                    className="h-8 w-full px-2 rounded border border-zinc-800 bg-zinc-900 text-zinc-200 text-xs"
                  />
                  <span className="text-[10px] text-zinc-600 block mt-0.5">parallel fetches</span>
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Parse Width</label>
                  <input
                    type="number"
                    min={1}
                    max={16}
                    value={parseConcurrency}
                    onChange={(e) => setParseConcurrency(parseInt(e.target.value, 10) || 5)}
                    className="h-8 w-full px-2 rounded border border-zinc-800 bg-zinc-900 text-zinc-200 text-xs"
                  />
                  <span className="text-[10px] text-zinc-600 block mt-0.5">parallel parses</span>
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Embed Width</label>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={embedConcurrency}
                    onChange={(e) => setEmbedConcurrency(parseInt(e.target.value, 10) || 3)}
                    className="h-8 w-full px-2 rounded border border-zinc-800 bg-zinc-900 text-zinc-200 text-xs"
                  />
                  <span className="text-[10px] text-zinc-600 block mt-0.5">embedding workers</span>
                </div>
                <div>
                  <label className="text-zinc-500 block mb-1">Host Gap</label>
                  <input
                    type="number"
                    min={50}
                    max={1000}
                    value={hostGapMs}
                    onChange={(e) => setHostGapMs(parseInt(e.target.value, 10) || 150)}
                    className="h-8 w-full px-2 rounded border border-zinc-800 bg-zinc-900 text-zinc-200 text-xs"
                  />
                  <span className="text-[10px] text-zinc-600 block mt-0.5">ms between calls</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Discovered URLs Table & Page Selector */}
      {step === "discovered" && discoveryData && (
        <DiscoveryTable
          discovery={discoveryData}
          selectedUrls={selectedUrls}
          onToggleUrl={handleToggleUrl}
          onSelectAll={handleSelectAll}
          onSelectNone={handleSelectNone}
          onSelectTopN={handleSelectTopN}
          onApplyRange={handleApplyRange}
          onStartIngest={handleStartIngest}
        />
      )}

      {/* STEP 3 & 4: Live Telemetry Stream & Completion */}
      {(step === "ingesting" || step === "done") && (
        <PipelineTelemetry
          phase={phase}
          progress={progress}
          logs={logs}
          result={result}
          error={pipelineError}
          onLaunchChat={handleLaunchChat}
          onReset={handleReset}
        />
      )}
    </div>
  );
}
