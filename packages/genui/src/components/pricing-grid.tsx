import * as React from "react";
import { Check, Sparkle } from "@phosphor-icons/react";

export interface PricingTierData {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  recommended?: boolean;
}

export interface PricingGridProps {
  plans: PricingTierData[];
  title?: string;
  className?: string;
}

export function PricingGrid({ plans = [], title, className = "" }: PricingGridProps) {
  if (!plans || !Array.isArray(plans) || plans.length === 0) return null;

  // Filter out invalid items
  const validPlans = plans.filter((p): p is PricingTierData => Boolean(p && typeof p === "object"));
  if (validPlans.length === 0) return null;

  // Compute grid layout class based on plan count
  const gridLayoutClass =
    validPlans.length === 1
      ? "max-w-md mx-auto grid-cols-1"
      : validPlans.length === 2
      ? "grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto"
      : validPlans.length === 3
      ? "grid-cols-1 md:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className={`w-full min-w-0 space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800/80">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
            {title}
          </h4>
          <span className="text-[11px] font-mono text-zinc-400">
            {validPlans.length} Tiers Available
          </span>
        </div>
      )}

      <div className={`grid ${gridLayoutClass} gap-3.5 items-stretch w-full min-w-0`}>
        {validPlans.map((plan, idx) => {
          const planName = typeof plan.name === "string" ? plan.name : "";
          const nameLower = planName.toLowerCase();
          const isRecommended =
            Boolean(plan.recommended) ||
            nameLower.includes("popular") ||
            nameLower.includes("pro") ||
            nameLower.includes("recommended");

          const price = typeof plan.price === "string" ? plan.price : plan.price != null ? String(plan.price) : "";
          const period = typeof plan.period === "string" ? plan.period : "";
          const description = typeof plan.description === "string" ? plan.description : "";
          const features = Array.isArray(plan.features)
            ? plan.features.filter((f): f is string => typeof f === "string")
            : [];

          return (
            <div
              key={idx}
              className={`relative flex flex-col justify-between rounded-2xl p-4 sm:p-5 transition-all duration-200 backdrop-blur-md w-full min-w-0 overflow-hidden ${
                isRecommended
                  ? "border-2 border-brand-primary dark:border-brand-primary bg-brand-primary/[0.04] dark:bg-zinc-900/90 shadow-md ring-1 ring-brand-primary/20"
                  : "border border-zinc-200 dark:border-zinc-800/90 bg-white/70 dark:bg-zinc-900/50 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              <div className="space-y-3.5 flex-1 flex flex-col justify-between">
                {/* Plan Header with inline Recommended badge */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-sm sm:text-base text-zinc-900 dark:text-zinc-100 tracking-tight truncate">
                      {planName || "Tier"}
                    </h4>
                    {isRecommended && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/25 shrink-0">
                        <Sparkle className="size-2.5 shrink-0" />
                        <span>Popular</span>
                      </span>
                    )}
                  </div>
                  {description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 min-h-[28px] leading-relaxed line-clamp-2">
                      {description}
                    </p>
                  )}
                </div>

                {/* Price Display */}
                <div className="py-2 border-y border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                      {price || "Contact"}
                    </span>
                    {period && (
                      <span className="text-xs text-zinc-500 font-medium">
                        {period.startsWith("/") ? period : `/${period}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Feature Bullets */}
                {features.length > 0 && (
                  <div className="space-y-2 pt-1 flex-1">
                    <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                      Included Capabilities:
                    </span>
                    <ul className="space-y-1.5 text-xs text-zinc-700 dark:text-zinc-300">
                      {features.map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2 leading-snug">
                          <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="break-words">{feat}</span>
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
