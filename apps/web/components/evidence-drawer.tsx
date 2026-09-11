"use client";

import React, { useState } from "react";
import {
  X,
  ArrowSquareOut,
  FileText,
  Copy,
  Check,
  Stack,
  ShieldCheck,
} from "@phosphor-icons/react";
import type { EvidenceItem } from "@/hooks/use-company-chat";

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: EvidenceItem[];
  selectedEvidence?: EvidenceItem | null;
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  evidence,
  selectedEvidence,
}: EvidenceDrawerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative w-full max-w-lg bg-zinc-950 border-l border-zinc-800/80 shadow-2xl flex flex-col h-full z-10 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-900 bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300">
              <Stack className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Verified Evidence Sources
              </h2>
              <p className="text-xs text-zinc-500 font-mono">
                {evidence.length} retrieved pgvector chunk{evidence.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {evidence.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 text-sm">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              No citation sources retrieved for this query.
            </div>
          ) : (
            evidence.map((item, index) => {
              const isSelected = selectedEvidence?.id === item.id;
              const matchPercent = Math.min(Math.round((item.score || 0.85) * 100), 99);

              return (
                <div
                  key={item.id || index}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? "border-zinc-600 bg-zinc-900/90 shadow-md ring-1 ring-zinc-700"
                      : "border-zinc-800/80 bg-zinc-900/40 hover:border-zinc-700/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex items-center justify-center w-5 h-5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-mono font-semibold shrink-0">
                        {index + 1}
                      </span>
                      <h3 className="text-xs font-semibold text-zinc-200 truncate">
                        {item.title || "Indexed Document"}
                      </h3>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">
                        <ShieldCheck className="w-3 h-3" />
                        {matchPercent}% match
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(item.id || String(index), item.snippet)}
                        className="p-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                        title="Copy snippet"
                      >
                        {copiedId === (item.id || String(index)) ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* URL */}
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-brand-primary mb-3 transition-colors break-all"
                    >
                      <span className="truncate">{item.url}</span>
                      <ArrowSquareOut className="w-3 h-3 shrink-0 opacity-70" />
                    </a>
                  )}

                  {/* Snippet */}
                  <div className="relative rounded-lg bg-zinc-950/80 border border-zinc-800/70 p-3 text-xs text-zinc-300 font-mono leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {item.snippet}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-zinc-900 bg-zinc-950/60 text-[11px] text-zinc-500 font-mono flex items-center justify-between">
          <span>Deterministic pgvector Index</span>
          <span>OpenAI text-embedding-3-small</span>
        </div>
      </div>
    </div>
  );
}
