import * as React from "react";
import { Buildings, Calendar, Users, Compass } from "@phosphor-icons/react";
import { TechIcon } from "../icons/tech-icon";

export interface KeyPillar {
  title: string;
  description: string;
  icon?: string;
}

export interface OverviewCardProps {
  companyName: string;
  synopsis: string;
  logoUrl?: string;
  founded?: string;
  headquarters?: string;
  teamSize?: string;
  keyPillars?: KeyPillar[];
  tags?: string[];
  className?: string;
}

export function OverviewCard({
  companyName,
  synopsis,
  logoUrl,
  founded,
  headquarters,
  teamSize,
  keyPillars = [],
  tags = [],
  className = "",
}: OverviewCardProps) {
  if (!companyName && !synopsis) return null;

  return (
    <div
      className={`w-full min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl p-5 sm:p-6 shadow-lg space-y-5 transition-all ${className}`}
    >
      {/* Header bar: Brand Logo, Title & Metadata badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800/80">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200 dark:border-zinc-700/60 flex items-center justify-center p-2 shrink-0 shadow-sm">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={companyName}
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <TechIcon name={companyName} size={24} />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 truncate">
                {companyName}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                Verified Dossier
              </span>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
              Enterprise Profile & Strategic Overview
            </p>
          </div>
        </div>

        {/* Vital stats / pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-300">
          {headquarters && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50">
              <Buildings size={14} className="text-zinc-400" />
              <span>{headquarters}</span>
            </div>
          )}
          {founded && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50">
              <Calendar size={14} className="text-zinc-400" />
              <span>Est. {founded}</span>
            </div>
          )}
          {teamSize && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/50">
              <Users size={14} className="text-zinc-400" />
              <span>{teamSize}</span>
            </div>
          )}
        </div>
      </div>

      {/* Executive Synopsis */}
      {synopsis && (
        <div className="space-y-1.5">
          <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Executive Summary
          </h4>
          <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 font-normal">
            {synopsis}
          </p>
        </div>
      )}

      {/* Key Strategic Pillars */}
      {Array.isArray(keyPillars) && keyPillars.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Core Capabilities & Pillars
            </h4>
            <span className="text-[11px] font-mono text-zinc-500">
              {keyPillars.length} Strategic Domains
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {keyPillars.map((pillar, idx) => (
              <div
                key={idx}
                className="group rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/40 p-3.5 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 flex items-start gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-200/80 dark:bg-zinc-800 border border-zinc-300/50 dark:border-zinc-700/60 flex items-center justify-center shrink-0 mt-0.5 text-zinc-700 dark:text-zinc-200">
                  {pillar.icon ? (
                    <TechIcon name={pillar.icon} size={16} />
                  ) : (
                    <Compass size={16} className="text-brand-primary" />
                  )}
                </div>
                <div className="min-w-0 space-y-1">
                  <h5 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    {pillar.title}
                  </h5>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed line-clamp-3">
                    {pillar.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capabilities Tag Row */}
      {Array.isArray(tags) && tags.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800/80 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-mono uppercase text-zinc-500 mr-1.5">Focus:</span>
          {tags.map((tag, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700/50"
            >
              <TechIcon name={tag} size={13} />
              <span>{tag}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
