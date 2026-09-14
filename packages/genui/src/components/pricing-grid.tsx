import * as React from "react";
import { Check, Sparkle, ArrowRight } from "@phosphor-icons/react";

export interface PricingTierData {
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: string[];
  recommended?: boolean;
  ctaLabel?: string;
  ctaAction?: string;
}

export interface PricingGridProps {
  plans: PricingTierData[];
  title?: string;
  className?: string;
}

export function PricingGrid({ plans = [], title, className = "" }: PricingGridProps) {
  if (!plans || plans.length === 0) return null;

  return (
    <div className={`w-full space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800/80">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
            {title}
          </h4>
          <span className="text-[11px] font-mono text-zinc-400">
            {plans.length} Tiers Available
          </span>
        </div>
      )}

      <div
        className={`grid grid-cols-1 ${
          plans.length === 2
            ? "sm:grid-cols-2 max-w-2xl mx-auto"
            : plans.length >= 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "max-w-md mx-auto"
        } gap-4 items-stretch`}
      >
        {plans.map((plan, idx) => {
          const isRecommended =
            plan.recommended ||
            plan.name.toLowerCase().includes("popular") ||
            plan.name.toLowerCase().includes("pro") ||
            plan.name.toLowerCase().includes("recommended");

          return (
            <div
              key={idx}
              className={`relative flex flex-col justify-between rounded-2xl p-5 sm:p-6 transition-all duration-200 backdrop-blur-md ${
                isRecommended
                  ? "border-2 border-brand-primary bg-gradient-to-b from-brand-primary/5 via-white dark:via-zinc-900/60 to-white dark:to-zinc-900/40 shadow-xl scale-[1.02] z-10"
                  : "border border-zinc-200 dark:border-zinc-800/90 bg-white/70 dark:bg-zinc-900/40 shadow-sm hover:border-zinc-300 dark:hover:border-zinc-700"
              }`}
            >
              {/* Recommended Top Badge */}
              {isRecommended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-primary text-white shadow-md">
                    <Sparkle className="size-3 fill-current" />
                    <span>Most Popular</span>
                  </span>
                </div>
              )}

              <div className="space-y-4">
                {/* Plan Header */}
                <div className="space-y-1">
                  <h4 className="font-bold text-base text-zinc-900 dark:text-zinc-100">
                    {plan.name}
                  </h4>
                  {plan.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 min-h-[32px] leading-relaxed">
                      {plan.description}
                    </p>
                  )}
                </div>

                {/* Price Display */}
                <div className="py-2 border-y border-zinc-100 dark:border-zinc-800/80">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-xs text-zinc-500 font-medium">
                        {plan.period.startsWith("/") ? plan.period : `/${plan.period}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Feature Bullets */}
                {plan.features && plan.features.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <span className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider block">
                      Included Capabilities:
                    </span>
                    <ul className="space-y-2 text-xs text-zinc-700 dark:text-zinc-300">
                      {plan.features.map((feat, fIdx) => (
                        <li key={fIdx} className="flex items-start gap-2 leading-snug">
                          <Check className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Action CTA Button */}
              <div className="pt-5 mt-4">
                <button
                  type="button"
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-sm flex items-center justify-center gap-1.5 ${
                    isRecommended
                      ? "bg-brand-primary text-white hover:opacity-95 shadow-md shadow-brand-primary/20"
                      : "bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700/60"
                  }`}
                >
                  <span>{plan.ctaLabel || (isRecommended ? "Choose Plan" : "Get Started")}</span>
                  <ArrowRight className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
