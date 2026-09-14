import * as React from "react";
import { CheckCircle, Sparkle } from "@phosphor-icons/react";
import { TechIcon } from "../icons/tech-icon";
import { GraphicBanner } from "./graphic-banner";

export interface ServiceItemData {
  title: string;
  synopsis: string;
  capabilities: string[];
  icon?: string;
  bannerUrl?: string;
  category?: string;
}

export interface ServiceGridProps {
  services: ServiceItemData[];
  title?: string;
  className?: string;
}

const ACCENT_PALETTES: Array<"cyan" | "indigo" | "emerald" | "violet" | "amber" | "rose" | "blue"> = [
  "cyan",
  "indigo",
  "emerald",
  "violet",
  "blue",
  "amber",
];

export function ServiceGrid({
  services = [],
  title,
  className = "",
}: ServiceGridProps) {
  if (!services || !Array.isArray(services) || services.length === 0) return null;

  const validServices = services.filter((s): s is ServiceItemData => Boolean(s && typeof s === "object"));
  if (validServices.length === 0) return null;

  return (
    <div className={`w-full min-w-0 space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1.5 border-b border-zinc-200 dark:border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Sparkle size={15} className="text-brand-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
              {title}
            </h4>
          </div>
          <span className="text-[11px] font-mono text-zinc-400">
            {validServices.length} Offerings
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        {validServices.map((service, idx) => {
          const accent = ACCENT_PALETTES[idx % ACCENT_PALETTES.length];
          const hasCustomBanner = Boolean(service.bannerUrl);

          return (
            <div
              key={idx}
              className="group relative flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800/80 bg-white/70 dark:bg-zinc-900/60 backdrop-blur-xl overflow-hidden shadow-sm transition-all hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md"
            >
              {/* Visual Banner Header: Tier 2 image or Tier 3 GraphicBanner */}
              {hasCustomBanner ? (
                <div className="relative w-full h-36 overflow-hidden bg-zinc-950">
                  <img
                    src={service.bannerUrl}
                    alt={service.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 opacity-80"
                    onError={(e) => {
                      // If remote image fails, hide image element so container falls back cleanly
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
                  {service.category && (
                    <div className="absolute top-3 left-3 z-10 px-2.5 py-0.5 rounded-full bg-zinc-900/80 backdrop-blur-md border border-white/10 text-[10px] font-mono font-medium tracking-widest text-zinc-200 uppercase">
                      {service.category}
                    </div>
                  )}
                </div>
              ) : (
                <GraphicBanner
                  title={service.title}
                  category={service.category || "SERVICE DOMAIN"}
                  accentColor={accent}
                  aspectRatio="3:1"
                />
              )}

              {/* Service Details Card Body */}
              <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    {service.icon && (
                      <div className="w-7 h-7 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center shrink-0">
                        <TechIcon name={service.icon} size={15} />
                      </div>
                    )}
                    <h3 className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                      {service.title}
                    </h3>
                  </div>

                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed font-normal">
                    {service.synopsis}
                  </p>
                </div>

                {/* Capabilities list */}
                {Array.isArray(service.capabilities) && service.capabilities.length > 0 && (
                  <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800/60 space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-semibold block">
                      Core Competencies
                    </span>
                    <ul className="space-y-1">
                      {service.capabilities.map((cap, capIdx) => (
                        <li
                          key={capIdx}
                          className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300"
                        >
                          <CheckCircle
                            size={14}
                            weight="fill"
                            className="text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5"
                          />
                          <span className="leading-tight">{cap}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
