import * as React from "react";
import { Sparkle } from "@phosphor-icons/react";
import { TechIcon } from "../icons/tech-icon";

export interface ProductItemData {
  title: string;
  subtitle?: string;
  description: string;
  tags?: string[];
  icon?: string;
  featured?: boolean;
  link?: string;
}

export interface ProductGridProps {
  products: ProductItemData[];
  title?: string;
  className?: string;
}

export function ProductGrid({ products = [], title, className = "" }: ProductGridProps) {
  if (!products || !Array.isArray(products) || products.length === 0) return null;

  const validProducts = products.filter((p): p is ProductItemData => Boolean(p && typeof p === "object"));
  if (validProducts.length === 0) return null;

  // Determine featured product: explicitly marked, or the first item if multiple
  const featuredIndex = validProducts.findIndex((p) => Boolean(p?.featured));
  const featuredProduct = featuredIndex !== -1 ? validProducts[featuredIndex] : validProducts[0];
  const siblingProducts = validProducts.filter((_, idx) => (featuredIndex !== -1 ? idx !== featuredIndex : idx !== 0));

  return (
    <div className={`w-full min-w-0 space-y-4 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800/80">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
            {title}
          </h4>
          <span className="text-[11px] font-mono text-zinc-400">
            {validProducts.length} Products & Capabilities
          </span>
        </div>
      )}

      {/* Featured Primary Product Hero Card */}
      {featuredProduct && (
        <div className="relative overflow-hidden rounded-2xl border border-zinc-300 dark:border-zinc-700/80 bg-gradient-to-br from-white via-zinc-50/50 to-zinc-100/30 dark:from-zinc-900/90 dark:via-zinc-900/40 dark:to-zinc-950/80 p-4 sm:p-6 shadow-xl backdrop-blur-md transition-all hover:border-brand-primary/50 w-full min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-2.5 flex-1 min-w-0">
              {/* Visual Anchor & Featured Pill Header */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase tracking-wider bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                  <Sparkle className="size-3" />
                  <span>Featured Solution</span>
                </span>
                {featuredProduct.subtitle && (
                  <span className="text-xs text-zinc-500 font-medium truncate">
                    {featuredProduct.subtitle}
                  </span>
                )}
              </div>

              {/* Title & Description */}
              <div className="space-y-1">
                <h3 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                  {featuredProduct.title || "Product"}
                </h3>
                {featuredProduct.description && (
                  <p className="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed max-w-2xl">
                    {featuredProduct.description}
                  </p>
                )}
              </div>

              {/* Capabilities Tags Block */}
              {Array.isArray(featuredProduct.tags) && featuredProduct.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  {featuredProduct.tags.filter((t): t is string => typeof t === "string").map((tag, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 text-zinc-700 dark:text-zinc-300 shadow-sm"
                    >
                      <TechIcon name={tag} size={13} />
                      <span>{tag}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Visual Anchor Logo Badge on Desktop */}
            <div className="hidden sm:flex items-center justify-center size-14 rounded-2xl bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 shadow-inner shrink-0 mt-1">
              <TechIcon name={featuredProduct.icon || featuredProduct.title || "Solution"} size={30} />
            </div>
          </div>
        </div>
      )}

      {/* Sibling Products Sub-Grid */}
      {siblingProducts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 w-full min-w-0">
          {siblingProducts.map((prod, idx) => {
            const tags = Array.isArray(prod?.tags) ? prod.tags.filter((t): t is string => typeof t === "string") : [];

            return (
              <div
                key={idx}
                className="flex flex-col justify-between p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/70 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 shadow-sm space-y-3 min-w-0"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <h4 className="font-semibold text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {prod?.title || "Solution"}
                      </h4>
                      {prod?.subtitle && (
                        <p className="text-[11px] text-zinc-500 font-mono truncate">
                          {prod.subtitle}
                        </p>
                      )}
                    </div>
                    <div className="size-8 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-700/50 flex items-center justify-center shrink-0">
                      <TechIcon name={prod?.icon || prod?.title || "Solution"} size={18} />
                    </div>
                  </div>

                  {prod?.description && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {prod.description}
                    </p>
                  )}
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
                    {tags.slice(0, 3).map((tag, tIdx) => (
                      <span
                        key={tIdx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 text-zinc-600 dark:text-zinc-400"
                      >
                        <TechIcon name={tag} size={11} />
                        <span>{tag}</span>
                      </span>
                    ))}
                    {tags.length > 3 && (
                      <span className="text-[10px] text-zinc-400 font-mono self-center">
                        +{tags.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
