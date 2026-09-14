import * as React from "react";
import { Scales, Lightning, ShieldCheck } from "@phosphor-icons/react";
import { TechIcon } from "../icons/tech-icon";

export interface CompetitorItemData {
  name: string;
  differentiation: string;
  strengths?: string[];
  positioning?: string;
}

export interface CompetitorGridProps {
  competitors: CompetitorItemData[];
  title?: string;
  className?: string;
}

export function CompetitorGrid({
  competitors = [],
  title,
  className = "",
}: CompetitorGridProps) {
  if (!competitors || !Array.isArray(competitors) || competitors.length === 0) return null;

  const validCompetitors = competitors.filter(
    (c): c is CompetitorItemData => Boolean(c && typeof c === "object" && c.name)
  );
  if (validCompetitors.length === 0) return null;

  return (
    <div className={`w-full min-w-0 space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Scales size={15} className="text-brand-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
              {title}
            </h4>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            {validCompetitors.length} Market Peers
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 items-stretch">
        {validCompetitors.map((comp, idx) => (
          <div
            key={idx}
            className="flex flex-col justify-between rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl p-4 sm:p-5 shadow-sm space-y-3.5 transition-all hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            <div className="space-y-3">
              {/* Header: Competitor Brand & Positioning */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0 p-1.5">
                    <TechIcon name={comp.name} size={18} />
                  </div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 truncate">
                    {comp.name}
                  </h3>
                </div>

                {comp.positioning && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-medium uppercase tracking-wider bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 text-zinc-500 dark:text-zinc-400 shrink-0">
                    {comp.positioning}
                  </span>
                )}
              </div>

              {/* Strategic Differentiation */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                  <Lightning size={13} weight="fill" />
                  <span>Key Differentiator</span>
                </div>
                <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed font-normal">
                  {comp.differentiation}
                </p>
              </div>
            </div>

            {/* Relative Strengths pills */}
            {Array.isArray(comp.strengths) && comp.strengths.length > 0 && (
              <div className="pt-2.5 border-t border-zinc-200/80 dark:border-zinc-800/60 space-y-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-medium block">
                  Peer Focus Areas
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {comp.strengths.map((str, sIdx) => (
                    <span
                      key={sIdx}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-zinc-100 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border border-zinc-200/70 dark:border-zinc-700/40"
                    >
                      <ShieldCheck size={12} className="text-zinc-400" />
                      <span>{str}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
