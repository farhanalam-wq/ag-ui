import * as React from "react";
import { TechIcon } from "../icons/tech-icon";
import { resolveIcon } from "../icons/resolver";

export interface TechItem {
  name: string;
  category?: string;
  description?: string;
}

export interface TechGridProps {
  items: (string | TechItem)[];
  title?: string;
  columns?: number;
  variant?: "cards" | "compact";
  className?: string;
}

export function TechGrid({
  items = [],
  title,
  columns = 3,
  variant = "cards",
  className = "",
}: TechGridProps) {
  if (!items || items.length === 0) return null;

  const normalizedItems: TechItem[] = items.map((item) => {
    if (typeof item === "string") {
      const resolved = resolveIcon(item);
      return {
        name: resolved.displayName,
        category: resolved.category,
      };
    }
    const resolved = resolveIcon(item.name);
    return {
      name: item.name || resolved.displayName,
      category: item.category || resolved.category,
      description: item.description,
    };
  });

  const gridColsClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 4
      ? "grid-cols-2 sm:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3";

  return (
    <div className={`w-full space-y-3 ${className}`}>
      {title && (
        <div className="flex items-center justify-between pb-1 border-b border-zinc-200 dark:border-zinc-800/80">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
            {title}
          </h4>
          <span className="text-[11px] font-mono text-zinc-400">
            {normalizedItems.length} Technologies
          </span>
        </div>
      )}

      {variant === "compact" ? (
        /* Compact Tile Row */
        <div className="flex flex-wrap gap-2">
          {normalizedItems.map((tech, idx) => (
            <div
              key={idx}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all text-xs text-zinc-800 dark:text-zinc-200 shadow-sm"
            >
              <TechIcon name={tech.name} size={16} />
              <span className="font-medium text-xs">{tech.name}</span>
            </div>
          ))}
        </div>
      ) : (
        /* Rich Interactive Tech Cards */
        <div className={`grid ${gridColsClass} gap-2.5`}>
          {normalizedItems.map((tech, idx) => {
            const resolved = resolveIcon(tech.name);
            return (
              <div
                key={idx}
                className="group relative flex items-start gap-3 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800/80 bg-white/60 dark:bg-zinc-900/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/80 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all duration-200 hover:shadow-md backdrop-blur-sm"
              >
                <div className="flex items-center justify-center p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800/70 border border-zinc-200/80 dark:border-zinc-700/50 shrink-0 group-hover:scale-105 transition-transform">
                  <TechIcon name={tech.name} size={22} />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-semibold text-xs text-zinc-900 dark:text-zinc-100 truncate">
                      {tech.name}
                    </span>
                    {tech.category && (
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-zinc-950/60 text-zinc-500 dark:text-zinc-400 shrink-0">
                        {tech.category}
                      </span>
                    )}
                  </div>

                  {tech.description ? (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                      {tech.description}
                    </p>
                  ) : (
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono truncate">
                      {resolved.displayName} Ecosystem
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
