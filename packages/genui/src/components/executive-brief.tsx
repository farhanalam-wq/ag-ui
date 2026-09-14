import * as React from "react";
import { Info, Sparkle, BookmarkSimple } from "@phosphor-icons/react";
import { TechIcon } from "../icons/tech-icon";

export interface BriefDetail {
  title: string;
  content: string;
  category?: string;
}

export interface BriefKeyFact {
  label: string;
  value: string;
}

export interface ExecutiveBriefProps {
  topic: string;
  takeaway: string;
  details?: BriefDetail[];
  keyFacts?: BriefKeyFact[];
  sourceContext?: string;
  className?: string;
}

export function ExecutiveBrief({
  topic,
  takeaway,
  details = [],
  keyFacts = [],
  sourceContext,
  className = "",
}: ExecutiveBriefProps) {
  if (!topic && !takeaway) return null;

  return (
    <div
      className={`w-full min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl p-5 sm:p-6 shadow-md space-y-5 transition-all ${className}`}
    >
      {/* Header bar: Topic title & category */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 text-zinc-700 dark:text-zinc-300">
            <BookmarkSimple size={18} weight="duotone" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-50 tracking-tight truncate">
              {topic}
            </h3>
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
              Executive Intelligence Brief
            </span>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700/60">
          <Info size={13} className="text-zinc-400" />
          <span>Verified Context</span>
        </div>
      </div>

      {/* Key Takeaway Highlight Banner */}
      {takeaway && (
        <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/[0.04] dark:bg-brand-primary/[0.08] p-4 space-y-1 relative overflow-hidden">
          <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-brand-primary font-semibold">
            <Sparkle size={13} />
            <span>Key Takeaway</span>
          </div>
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 leading-relaxed">
            {takeaway}
          </p>
        </div>
      )}

      {/* Optional Fact Metric Strip */}
      {Array.isArray(keyFacts) && keyFacts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {keyFacts.map((fact, idx) => (
            <div
              key={idx}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 p-3 space-y-0.5"
            >
              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider truncate">
                {fact.label}
              </div>
              <div className="text-sm font-bold font-mono text-zinc-900 dark:text-zinc-100 truncate">
                {fact.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Structured Details Grid (with automatic brand/company logo resolution) */}
      {Array.isArray(details) && details.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold block">
            Synthesized Dimensions
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {details.map((detail, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800/70 bg-zinc-50/50 dark:bg-zinc-900/40 p-3.5 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-center shrink-0 p-1">
                      <TechIcon name={detail.title} size={15} />
                    </div>
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200 tracking-tight truncate">
                      {detail.title}
                    </h4>
                  </div>
                  {detail.category && (
                    <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded shrink-0">
                      {detail.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed font-normal">
                  {detail.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Source Citation / Context */}
      {sourceContext && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/70 text-[11px] font-mono text-zinc-400">
          Context Reference: {sourceContext}
        </div>
      )}
    </div>
  );
}
