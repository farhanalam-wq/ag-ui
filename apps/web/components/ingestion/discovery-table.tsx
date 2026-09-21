"use client";

import React, { useState, useMemo } from "react";
import {
  MagnifyingGlass,
  CheckSquare,
  Square,
  ArrowSquareOut,
  Tag,
  Clock,
  Sparkle,
  Sliders,
  CheckCircle,
} from "@phosphor-icons/react";
import type { DiscoveredPageItem, DiscoveryResponse } from "@/lib/api-client";

interface DiscoveryTableProps {
  discovery: DiscoveryResponse;
  selectedUrls: Set<string>;
  onToggleUrl: (url: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectTopN: (n: number) => void;
  onApplyRange: (rangeStr: string) => void;
  onStartIngest: () => void;
  isStarting?: boolean;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  pricing: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
  product: { bg: "bg-indigo-500/10", text: "text-indigo-400", border: "border-indigo-500/20" },
  docs: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
  blog: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
  about: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
  general: { bg: "bg-zinc-500/10", text: "text-zinc-400", border: "border-zinc-500/20" },
};

export function DiscoveryTable({
  discovery,
  selectedUrls,
  onToggleUrl,
  onSelectAll,
  onSelectNone,
  onSelectTopN,
  onApplyRange,
  onStartIngest,
  isStarting = false,
}: DiscoveryTableProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [rangeInput, setRangeInput] = useState("");

  const { pages, info } = discovery;

  // Categories list with counts
  const categoriesWithCounts = useMemo(() => {
    const list: { key: string; label: string; count: number }[] = [
      { key: "all", label: "All Pages", count: pages.length },
    ];
    if (info?.byCategory) {
      for (const [cat, count] of Object.entries(info.byCategory)) {
        list.push({ key: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1), count });
      }
    }
    return list;
  }, [pages, info]);

  // Filtered pages by category and search
  const filteredPages = useMemo(() => {
    return pages.filter((p) => {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch =
        !searchQuery.trim() ||
        p.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [pages, activeCategory, searchQuery]);

  const handleRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeInput.trim()) return;
    onApplyRange(rangeInput.trim());
  };

  // Estimated crawl duration
  const estWaves = Math.ceil(selectedUrls.size / 25);
  const estTimeSec = (estWaves * 1.5).toFixed(1);

  return (
    <div className="w-full space-y-4">
      {/* Top Telemetry Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm">
        <div>
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Discovered</div>
          <div className="text-xl font-bold text-zinc-100 mt-0.5">
            {pages.length.toLocaleString()}{" "}
            <span className="text-xs font-normal text-zinc-400">URLs</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Discovery Time</div>
          <div className="text-xl font-bold text-emerald-400 mt-0.5">
            {(info.durationMs / 1000).toFixed(2)}s
          </div>
        </div>
        <div>
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Sitemaps Probed</div>
          <div className="text-xl font-bold text-zinc-100 mt-0.5">
            {info.sitemapsFollowed?.length || (info.robotsSitemaps ? 1 : 0)}{" "}
            <span className="text-xs font-normal text-zinc-400">sources</span>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Selected to Crawl</div>
          <div className="text-xl font-bold text-brand-primary mt-0.5">
            {selectedUrls.size}{" "}
            <span className="text-xs font-normal text-zinc-400">pages (~{estTimeSec}s)</span>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-2.5">
        {categoriesWithCounts.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setActiveCategory(c.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeCategory === c.key
                ? "bg-zinc-800 text-white shadow-sm border border-zinc-700 font-semibold"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
            }`}
          >
            <span>{c.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                activeCategory === c.key
                  ? "bg-zinc-700 text-zinc-200"
                  : "bg-zinc-900 text-zinc-500 border border-zinc-800"
              }`}
            >
              {c.count}
            </span>
          </button>
        ))}
      </div>

      {/* Controls & Range Selector Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60">
        {/* Left: Quick Select Presets */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-zinc-500 font-medium mr-1 text-[11px] uppercase tracking-wider">
            Quick:
          </span>
          <button
            type="button"
            onClick={onSelectAll}
            className="px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            All ({pages.length})
          </button>
          <button
            type="button"
            onClick={() => onSelectTopN(10)}
            className="px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            Top 10
          </button>
          <button
            type="button"
            onClick={() => onSelectTopN(20)}
            className="px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            Top 20
          </button>
          <button
            type="button"
            onClick={() => onSelectTopN(50)}
            className="px-2.5 py-1 rounded-md border border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300 transition-colors"
          >
            Top 50
          </button>
          <button
            type="button"
            onClick={onSelectNone}
            className="px-2.5 py-1 rounded-md border border-zinc-800/60 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/40 transition-colors"
          >
            Clear
          </button>
        </div>

        {/* Right: Custom Range Input & Search */}
        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleRangeSubmit} className="flex items-center gap-1.5">
            <input
              type="text"
              value={rangeInput}
              onChange={(e) => setRangeInput(e.target.value)}
              placeholder="e.g. 1-20, 35"
              className="h-8 w-28 sm:w-32 px-2.5 rounded-md border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary"
              title="Enter index ranges: all | N | 1-20,35,40-50"
            />
            <button
              type="submit"
              className="h-8 px-2.5 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
            >
              Apply
            </button>
          </form>

          <div className="relative">
            <MagnifyingGlass className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search URLs..."
              className="h-8 pl-8 pr-3 rounded-md border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-brand-primary w-36 sm:w-44"
            />
          </div>
        </div>
      </div>

      {/* Discovered URLs Table */}
      <div className="rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950/40">
        <div className="max-h-[380px] overflow-y-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 text-[11px] font-mono text-zinc-400 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3 w-10 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedUrls.size === pages.length) onSelectNone();
                      else onSelectAll();
                    }}
                    className="text-zinc-400 hover:text-white"
                  >
                    {selectedUrls.size === pages.length ? (
                      <CheckSquare className="size-4 text-brand-primary" />
                    ) : (
                      <Square className="size-4" />
                    )}
                  </button>
                </th>
                <th className="py-2.5 px-2 w-12 text-center">#</th>
                <th className="py-2.5 px-3 w-20">Priority</th>
                <th className="py-2.5 px-3 w-24">Category</th>
                <th className="py-2.5 px-3 w-24">Source</th>
                <th className="py-2.5 px-3">Target URL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900 font-mono text-[11px]">
              {filteredPages.map((p, idx) => {
                const isSelected = selectedUrls.has(p.url);
                const originalIndex = pages.findIndex((orig) => orig.url === p.url) + 1;
                const catColor = CATEGORY_COLORS[p.category] || CATEGORY_COLORS.general;

                return (
                  <tr
                    key={p.url}
                    onClick={() => onToggleUrl(p.url)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-brand-primary/5 hover:bg-brand-primary/10"
                        : "hover:bg-zinc-900/50"
                    }`}
                  >
                    <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onToggleUrl(p.url)}
                        className="text-zinc-400 hover:text-white"
                      >
                        {isSelected ? (
                          <CheckSquare className="size-4 text-brand-primary" />
                        ) : (
                          <Square className="size-4 text-zinc-600" />
                        )}
                      </button>
                    </td>
                    <td className="py-2 px-2 text-center text-zinc-500">{originalIndex}</td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400">
                        {p.priority}
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${catColor.bg} ${catColor.text} ${catColor.border}`}
                      >
                        {p.category}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-400">
                      <span className="text-[10px] text-zinc-500 font-mono">{p.source}</span>
                    </td>
                    <td className="py-2 px-3 text-zinc-300 truncate max-w-md">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{p.url}</span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-zinc-600 hover:text-zinc-300 shrink-0"
                          title="Open URL in new tab"
                        >
                          <ArrowSquareOut className="size-3" />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Crawl Forecast & Start Ingestion Footer Action */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl border border-zinc-800 bg-zinc-900/60">
        <div className="text-xs text-zinc-400 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-200">
              {selectedUrls.size} of {pages.length} pages selected
            </span>
            <span className="text-zinc-600">•</span>
            <span>~{estWaves} concurrent waves (fetch: 25, parse: 5, embed: 3)</span>
          </div>
          <div className="text-[11px] text-zinc-500">
            Deduplication, SHA-256 content hashing, and Qdrant 1536-dim vector embeddings will run in-process.
          </div>
        </div>

        <button
          type="button"
          disabled={selectedUrls.size === 0 || isStarting}
          onClick={onStartIngest}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-xs font-semibold bg-brand-primary hover:opacity-90 disabled:opacity-50 text-white shadow-lg shadow-brand-primary/20 transition-all shrink-0 cursor-pointer"
        >
          {isStarting ? (
            <>
              <div className="size-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              <span>Initializing Pipeline...</span>
            </>
          ) : (
            <>
              <Sparkle className="size-3.5" />
              <span>Start Pipeline Ingestion ({selectedUrls.size})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
