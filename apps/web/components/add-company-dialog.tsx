"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Globe,
  CircleNotch,
  CheckCircle,
  WarningCircle,
  ArrowRight,
  Sparkle,
  Stack,
} from "@phosphor-icons/react";
import { apiClient } from "@/lib/api-client";

export interface IndexedCompanyPayload {
  id: string;
  name: string;
  domain: string;
  description: string;
  brandColor: string;
  badge: string;
  suggestedQueries: string[];
}

interface AddCompanyDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCompanyIndexed: (company: IndexedCompanyPayload) => void;
}

const POPULAR_EXAMPLES = [
  "https://supabase.com",
  "https://linear.app",
  "https://posthog.com",
  "https://vercel.com",
];

export function AddCompanyDialog({
  isOpen,
  onClose,
  onCompanyIndexed,
}: AddCompanyDialogProps) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "crawling" | "indexing" | "ready" | "error"
  >("idle");
  const [statusStep, setStatusStep] = useState<string>("QUEUED");
  const [errorMessage, setErrorMessage] = useState("");
  const [stats, setStats] = useState<{ pages?: number; chunks?: number; facts?: number }>({});
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleReset = () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setUrl("");
    setStatus("idle");
    setStatusStep("QUEUED");
    setErrorMessage("");
    setStats({});
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = url.trim();
    if (!raw || status === "submitting" || status === "crawling") return;

    let targetUrl = raw;
    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      targetUrl = `https://${targetUrl}`;
    }

    setStatus("submitting");
    setStatusStep("QUEUED");
    setErrorMessage("");

    try {
      const res = await apiClient.companies.create(targetUrl);
      const companyId = res.companyId;

      setStatus("crawling");
      setStatusStep("QUEUED");

      // Begin polling until READY
      pollingRef.current = setInterval(async () => {
        try {
          const detail = await apiClient.companies.get(companyId);
          const currentStatus = detail.latestSnapshot?.status || "QUEUED";
          setStatusStep(currentStatus);

          if (currentStatus === "CRAWLING") {
            setStatus("crawling");
          } else if (currentStatus === "PARSING" || currentStatus === "INDEXING") {
            setStatus("indexing");
          } else if (currentStatus === "READY") {
            if (pollingRef.current) clearInterval(pollingRef.current);

            const totalChunks = detail.latestSnapshot?.totalChunks || 0;
            const totalPages = detail.latestSnapshot?.totalPages || 0;
            const totalFacts = detail.latestSnapshot?.totalFacts || 0;
            const brandColor =
              detail.brand?.tokens?.colors?.primary || "#3b82f6";

            setStats({
              chunks: totalChunks,
              pages: totalPages,
              facts: totalFacts,
            });
            setStatus("ready");

            const companyPayload: IndexedCompanyPayload = {
              id: detail.company.id,
              name: detail.company.name,
              domain: detail.company.domain,
              description: `Indexed knowledge base for ${detail.company.name} (${detail.company.domain}).`,
              brandColor,
              badge: `${totalChunks} Chunks • Indexed`,
              suggestedQueries: [
                `What are the core products and APIs provided by ${detail.company.name}?`,
                `What are the pricing tiers, limits, and plan options?`,
                `Where are ${detail.company.name} headquarters and contact options?`,
                `What enterprise security and compliance certifications exist?`,
              ],
            };

            setTimeout(() => {
              onCompanyIndexed(companyPayload);
              handleClose();
            }, 1800);
          } else if (currentStatus === "FAILED") {
            if (pollingRef.current) clearInterval(pollingRef.current);
            setStatus("error");
            setErrorMessage("Crawling and indexing pipeline failed for this URL.");
          }
        } catch (err: any) {
          // Ignore transient network errors during polling
        }
      }, 2000);
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err.message || "Failed to initiate company indexing.");
    }
  };

  const isWorking =
    status === "submitting" || status === "crawling" || status === "indexing";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-md transition-opacity"
        onClick={isWorking ? undefined : handleClose}
      />

      {/* Dialog Panel */}
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-950 border border-zinc-800/90 shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-200">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Index New Company
              </h2>
              <p className="text-xs text-zinc-500 font-mono">
                Multi-tier Crawler &bull; pgvector Embeddings &bull; GenUI
              </p>
            </div>
          </div>

          {!isWorking && (
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
              aria-label="Close dialog"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Input Form */}
          {status !== "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-zinc-400">
                  Target Company Website URL or Domain
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3.5 text-zinc-500">
                    <Globe className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={isWorking}
                    placeholder="https://example.com or domain.com"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/80 pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-600 disabled:opacity-50 font-mono transition-all"
                  />
                </div>
              </div>

              {/* Example Chips */}
              {!isWorking && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-mono text-zinc-500">
                    Quick suggestions:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_EXAMPLES.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => setUrl(ex)}
                        className="px-2.5 py-1 rounded-lg border border-zinc-800/80 bg-zinc-900/50 hover:bg-zinc-800 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        {ex.replace("https://", "")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Pipeline Status Progress */}
              {isWorking && (
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-medium">
                      Indexing Pipeline Active
                    </span>
                    <span className="font-mono text-brand-primary uppercase text-[11px] font-semibold flex items-center gap-1.5">
                      <CircleNotch className="w-3.5 h-3.5 animate-spin" />
                      {statusStep}
                    </span>
                  </div>

                  {/* Step indicators */}
                  <div className="grid grid-cols-4 gap-1 pt-1 text-center text-[10px] font-mono">
                    <div
                      className={`p-1.5 rounded border transition-colors ${
                        statusStep === "QUEUED"
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
                      }`}
                    >
                      1. Queue
                    </div>
                    <div
                      className={`p-1.5 rounded border transition-colors ${
                        statusStep === "CRAWLING"
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
                      }`}
                    >
                      2. Crawl
                    </div>
                    <div
                      className={`p-1.5 rounded border transition-colors ${
                        statusStep === "PARSING" || statusStep === "INDEXING"
                          ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
                      }`}
                    >
                      3. Embed
                    </div>
                    <div
                      className={`p-1.5 rounded border transition-colors ${
                        statusStep === "READY"
                          ? "border-emerald-500 bg-emerald-950/40 text-emerald-400 font-semibold"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-500"
                      }`}
                    >
                      4. Ready
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-500 font-mono leading-relaxed">
                    Universal crawler is indexing pages, generating 1536-dim embeddings, and extracting deterministic facts...
                  </p>
                </div>
              )}

              {/* Error Message */}
              {status === "error" && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-900/60 bg-red-950/30 text-xs text-red-300">
                  <WarningCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Ingestion Error</p>
                    <p className="text-[11px] text-red-400 leading-relaxed font-mono">
                      {errorMessage}
                    </p>
                  </div>
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isWorking}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!url.trim() || isWorking}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-100 text-zinc-950 font-medium text-xs hover:bg-white active:scale-95 disabled:pointer-events-none disabled:opacity-40 transition-all shadow-md"
                >
                  {isWorking ? (
                    <>
                      <CircleNotch className="w-3.5 h-3.5 animate-spin" />
                      <span>Ingesting Company...</span>
                    </>
                  ) : (
                    <>
                      <span>Start Crawl & Index</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Success / Ready State */}
          {status === "ready" && (
            <div className="py-6 text-center space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 mx-auto">
                <CheckCircle className="w-6 h-6" />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-semibold text-zinc-100">
                  Company Knowledge Base Ready!
                </h3>
                <p className="text-xs text-zinc-400 font-mono">
                  Indexed {stats.chunks || 0} vector chunks from {stats.pages || 0} crawled pages.
                </p>
              </div>

              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 font-mono">
                <Sparkle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Switching active context and loading live stream...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
