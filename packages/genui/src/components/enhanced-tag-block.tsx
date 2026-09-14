import * as React from "react";
import { TechIcon } from "../icons/tech-icon";
import { resolveIcon } from "../icons/resolver";

export interface EnhancedTagBlockProps {
  tags: string[];
  className?: string;
}

export function EnhancedTagBlock({ tags = [], className = "" }: EnhancedTagBlockProps) {
  if (!tags || tags.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {tags.map((tag, idx) => {
        const resolved = resolveIcon(tag);
        const hasVerifiedLogo = !resolved.isFallback && Boolean(resolved.svg);

        return (
          <span
            key={idx}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border border-zinc-200 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/80 text-zinc-800 dark:text-zinc-200 shadow-sm transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
          >
            {hasVerifiedLogo && <TechIcon name={tag} size={13} />}
            <span>{tag}</span>
          </span>
        );
      })}
    </div>
  );
}
