"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowSquareOut,
  Check,
  Copy,
  ShieldCheck,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@/hooks/use-company-chat";

interface EvidenceCardProps {
  item: EvidenceItem;
  index: number;
  selected?: boolean;
  onSelect?: (item: EvidenceItem) => void;
}

/** Single cited source: rank + title + match + URL + snippet. Self-contained copy. */
export function EvidenceCard({ item, index, selected, onSelect }: EvidenceCardProps) {
  const [copied, setCopied] = useState(false);
  const matchPercent = Math.min(Math.round((item.score || 0.85) * 100), 99);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.snippet);
    } catch {
      // Clipboard unavailable — still confirm the intent.
    }
    setCopied(true);
    toast.success("Snippet copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const title = (
    <h3 className="truncate text-xs font-semibold">
      {item.title || "Indexed Document"}
    </h3>
  );

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4",
        selected && "border-primary/60 bg-accent"
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted font-mono text-[10px] font-semibold tabular-nums text-muted-foreground">
            {index + 1}
          </span>
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(item)}
              aria-label={`Inspect source ${index + 1}: ${item.title || "Indexed Document"}`}
              className="min-w-0 flex-1 truncate rounded text-left transition-colors hover:text-primary"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="secondary" className="gap-1 font-mono text-[10px] tabular-nums">
            <ShieldCheck className="size-3" />
            {matchPercent}% match
          </Badge>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            aria-label="Copy snippet"
            title="Copy snippet"
          >
            {copied ? <Check className="text-emerald-500" /> : <Copy />}
          </Button>
        </div>
      </div>

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="mb-3 inline-flex max-w-full items-center gap-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-primary"
        >
          <span className="truncate">{item.url}</span>
          <ArrowSquareOut className="size-3 shrink-0 opacity-70" />
        </a>
      )}

      <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/50 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
        {item.snippet}
      </div>
    </div>
  );
}
