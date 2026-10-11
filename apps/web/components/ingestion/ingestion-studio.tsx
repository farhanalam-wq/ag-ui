"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MagnifyingGlass,
  Sliders,
  CheckCircle,
  WarningCircle,
  Database,
  CircleNotch,
} from "@phosphor-icons/react";
import {
  apiClient,
  type DiscoveryResponse,
  type CompanySummary,
} from "@/lib/api-client";
import { DiscoveryTable } from "./discovery-table";
import {
  PipelineTelemetry,
  type PipelineProgressData,
  type PipelineResultData,
} from "./pipeline-telemetry";
import type { CompanyItem } from "../sidebar/company-switcher";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

interface IngestionStudioProps {
  onCompanyIndexed: (company: CompanyItem) => void;
  onCancel: () => void;
}

const STEPS = ["Discover", "Select", "Ingest", "Done"] as const;

export function IngestionStudio({ onCompanyIndexed, onCancel }: IngestionStudioProps) {
  const router = useRouter();
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

  // Appearance track state (Phase 1 track C — parallel to knowledge progress)
  const [appearanceActive, setAppearanceActive] = useState(false);

  // Advanced Tuning settings
  const [fetchConcurrency, setFetchConcurrency] = useState(25);
  const [parseConcurrency, setParseConcurrency] = useState(5);
  const [embedConcurrency, setEmbedConcurrency] = useState(3);
  const [hostGapMs, setHostGapMs] = useState(150);

  // Indexed companies in knowledge base
  const [indexedCompanies, setIndexedCompanies] = useState<CompanySummary[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);

  const loadIndexedCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const list = await apiClient.companies.list();
      setIndexedCompanies(list);
    } catch {
      // non-blocking
    } finally {
      setLoadingCompanies(false);
    }
  };

  useEffect(() => {
    loadIndexedCompanies();
  }, []);

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
    setAppearanceActive(false);

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
          onJob: (job) => {
            setLogs((prev) => [...prev, `[JOB] Initialized crawl job ${job.jobId}`]);
          },
          onProgress: (prog) => {
            setProgress(prog as any);
            if (prog.stage === "EXTRACTING_APPEARANCE") setAppearanceActive(true);
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
      // Stream interrupted (e.g. dev server reload or network hiccup).
      // Inspect the server job status rather than failing immediately!
      setLogs((prev) => [
        ...prev,
        `[RECONNECT] Live stream interrupted (${err.message}). Checking server crawl status...`,
      ]);

      try {
        let isComplete = false;
        for (let attempt = 0; attempt < 40; attempt++) {
          await new Promise((r) => setTimeout(r, 1500));
          const statusRes = await apiClient.crawler.getLatestStatus(discoveryData.domain);
          const job = statusRes.job;
          const snap = statusRes.snapshot;

          if (job) {
            setProgress({
              stage: job.status,
              crawled: job.crawled,
              totalSelected: job.selected || selectedUrls.size,
              docs: job.docs,
              failed: job.failed,
            } as any);

            setLogs((prev) => [
              ...prev,
              `[SERVER STATUS: ${job.status}] fetched=${job.crawled}/${job.selected} docs=${job.docs} dead=${job.failed}`,
            ]);

            if (job.status === "READY" && snap) {
              setResult({
                companyId: statusRes.company.id,
                companyName: statusRes.company.name,
                domain: statusRes.company.domain,
                snapshotId: snap.id,
                version: snap.version,
                insertedDocs: job.docs,
                chunkCount: snap.pageCount || job.docs,
                factCount: 0,
                timings: { discoveryMs: 0, crawlMs: 0, dbMs: 0, totalMs: 0 },
                brand: statusRes.brand,
              });
              setStep("done");
              setLogs((prev) => [
                ...prev,
                `[COMPLETE] ${statusRes.company.name} successfully indexed on server! Docs: ${job.docs}`,
              ]);
              isComplete = true;
              break;
            } else if (job.status === "FAILED") {
              throw new Error("Crawl job failed on server");
            }
          }
        }

        if (!isComplete) {
          setPipelineError("Crawl status polling timed out.");
          setLogs((prev) => [...prev, "[FATAL] Crawl status polling timed out"]);
        }
      } catch (pollErr: any) {
        setPipelineError(pollErr.message || err.message || "Pipeline execution failed");
        setLogs((prev) => [...prev, `[FATAL] ${pollErr.message || err.message}`]);
      }
    }
  };

  const handleReset = () => {
    setStep("input");
    setDiscoveryData(null);
    setSelectedUrls(new Set());
    setLogs([]);
    setProgress(null);
    setResult(null);
    setPipelineError(null);
    setAppearanceActive(false);
    setPhase("INITIALIZING");
  };

  const stepIndex =
    step === "input" ? 0 : step === "discovered" ? 1 : step === "ingesting" ? 2 : 3;

  return (
    <div className="min-w-0">
      {/* PageHeader */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Ingest a site
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
            Discover the pages, pick what matters, and turn the site into an
            assistant you can question.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {step !== "input" && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              Start over
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onCancel}>
            Open Playground
          </Button>
        </div>
      </div>

      {/* Stepper */}
      <ol className="mt-6 flex min-w-0 items-center gap-1">
        {STEPS.map((label, i) => {
          const done = i < stepIndex;
          const active = i === stepIndex;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1">
              <span
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${
                  done
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                    : active
                      ? "border-primary/40 bg-primary/5 font-medium text-foreground"
                      : "border-border text-muted-foreground"
                }`}
              >
                <span
                  className={`flex size-5 shrink-0 items-center justify-center rounded-full font-sans text-[11px] tabular-nums ${
                    done
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                      : active
                        ? "bg-primary/15 text-primary"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <CheckCircle className="size-3.5" aria-hidden="true" />
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="truncate">{label}</span>
              </span>
            </li>
          );
        })}
      </ol>

      {/* STEP 1: Target URL Input & Discovery Trigger */}
      {step === "input" && (
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-[15px] font-semibold">
                Which site should the assistant learn?
              </CardTitle>
              <CardDescription className="text-[13px]">
                Discovery checks the sitemap and site structure, then shows
                every page ranked so you pick what matters.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleDiscover();
                }}
                className="flex min-w-0 flex-col gap-2"
              >
                <label
                  htmlFor="ingest-url"
                  className="text-[13px] font-medium"
                >
                  Company website or domain
                </label>
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                  <Input
                    id="ingest-url"
                    type="url"
                    inputMode="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://example.com"
                    disabled={isDiscovering}
                    aria-invalid={!!discoveryError}
                    aria-describedby={
                      discoveryError ? "ingest-url-error" : "ingest-url-help"
                    }
                    className="h-10 flex-1 font-mono"
                  />
                  <Button
                    type="submit"
                    disabled={!targetUrl.trim() || isDiscovering}
                    className="h-10 shrink-0"
                  >
                    {isDiscovering ? (
                      <>
                        <CircleNotch
                          className="size-4 animate-spin"
                          aria-hidden="true"
                        />
                        Discovering
                      </>
                    ) : (
                      <>
                        <MagnifyingGlass
                          className="size-4"
                          aria-hidden="true"
                        />
                        Discover pages
                      </>
                    )}
                  </Button>
                </div>
                <p
                  id="ingest-url-help"
                  className="text-xs text-muted-foreground"
                >
                  Paste any public company site. No login needed.
                </p>
              </form>

              {discoveryError && (
                <div
                  id="ingest-url-error"
                  role="alert"
                  className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]"
                >
                  <p className="flex items-center gap-2 font-medium">
                    <WarningCircle
                      className="size-4 shrink-0"
                      aria-hidden="true"
                    />
                    Discovery failed
                  </p>
                  <p className="mt-1 text-muted-foreground">{discoveryError}</p>
                  <p className="mt-1 text-muted-foreground">
                    Check the URL is public and reachable, then try again.
                  </p>
                </div>
              )}

              <Collapsible className="mt-5 border-t pt-3">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                  >
                    <Sliders className="size-3.5" aria-hidden="true" />
                    Advanced crawl settings
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      {
                        label: "Fetch width",
                        hint: "parallel fetches",
                        value: fetchConcurrency,
                        set: setFetchConcurrency,
                        min: 1,
                        max: 50,
                        fallback: 25,
                      },
                      {
                        label: "Parse width",
                        hint: "parallel parses",
                        value: parseConcurrency,
                        set: setParseConcurrency,
                        min: 1,
                        max: 16,
                        fallback: 5,
                      },
                      {
                        label: "Embed width",
                        hint: "embedding workers",
                        value: embedConcurrency,
                        set: setEmbedConcurrency,
                        min: 1,
                        max: 6,
                        fallback: 3,
                      },
                      {
                        label: "Host gap (ms)",
                        hint: "ms between calls",
                        value: hostGapMs,
                        set: setHostGapMs,
                        min: 50,
                        max: 1000,
                        fallback: 150,
                      },
                    ].map((f) => (
                      <div key={f.label}>
                        <label className="text-xs text-muted-foreground">
                          {f.label}
                        </label>
                        <Input
                          type="number"
                          min={f.min}
                          max={f.max}
                          value={f.value}
                          onChange={(e) =>
                            f.set(parseInt(e.target.value, 10) || f.fallback)
                          }
                          className="mt-1 h-8 font-mono"
                        />
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {f.hint}
                        </p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          {/* Rail: library of learned sites */}
          <Card className="min-w-0">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Database
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <CardTitle className="text-[15px] font-semibold">
                  Learned sites ({indexedCompanies.length})
                </CardTitle>
              </div>
              <CardDescription className="text-[13px]">
                Jump back into any assistant or re-learn it.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingCompanies ? (
                <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed p-4 text-[13px] text-muted-foreground">
                  <CircleNotch
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  Loading learned sites
                </div>
              ) : indexedCompanies.length === 0 ? (
                <div className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">
                  Nothing learned yet. Your first site lands here.
                </div>
              ) : (
                <ul className="max-h-80 min-w-0 space-y-1 overflow-y-auto">
                  {indexedCompanies.map((c) => {
                    const brandColor =
                      c.brand?.tokens?.colors?.primary || "#3b82f6";
                    const docCount =
                      c.docCount ?? c.latestSnapshot?.pageCount ?? 0;
                    const chunkCount = c.chunkCount ?? 0;
                    const isReady =
                      (c.status || c.latestSnapshot?.status) === "READY";
                    return (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 hover:bg-muted/40"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-bold"
                            style={{
                              backgroundColor: `${brandColor}20`,
                              color: brandColor,
                            }}
                          >
                            {c.name.slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                              {c.name}
                              <span
                                className={`size-1.5 shrink-0 rounded-full ${
                                  isReady
                                    ? "bg-emerald-500"
                                    : "bg-[hsl(var(--chart-1))]"
                                }`}
                              />
                            </p>
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {c.domain} · {docCount} docs
                              {chunkCount > 0
                                ? ` · ${chunkCount} chunks`
                                : ""}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            title="Re-run discovery on this domain"
                            onClick={() => {
                              const url = c.url || `https://${c.domain}`;
                              setTargetUrl(url);
                              handleDiscover(url);
                            }}
                          >
                            Re-learn
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => {
                              onCompanyIndexed({
                                id: c.id,
                                name: c.name,
                                domain: c.domain,
                                description: `Indexed knowledge base for ${c.name} (${c.domain}).`,
                                brandColor,
                                badge: `${docCount} Docs • Indexed`,
                                docCount,
                                chunkCount,
                                factCount: c.factCount || 0,
                                status: c.status || "READY",
                                suggestedQueries: [
                                  `What are the core products and APIs provided by ${c.name}?`,
                                  `What are the pricing tiers, limits, and plan options?`,
                                  `Where are ${c.name} headquarters and contact options?`,
                                ],
                              });
                            }}
                          >
                            Chat
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Button
                variant="link"
                className="mt-2 h-auto p-0 text-[13px] font-normal"
                onClick={() => router.push("/knowledge/sources")}
              >
                Manage all sources
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* STEP 2: Discovered URLs Table & Page Selector */}
      {step === "discovered" && discoveryData && (
        <div className="mt-4 min-w-0">
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
        </div>
      )}

      {/* STEP 3 & 4: Live Telemetry Stream & Completion */}
      {(step === "ingesting" || step === "done") && (
        <div className="mt-4 min-w-0">
          <PipelineTelemetry
            phase={phase}
            progress={progress}
            logs={logs}
            result={result}
            error={pipelineError}
            onReset={handleReset}
            appearanceActive={appearanceActive}
          />
        </div>
      )}
    </div>
  );
}
