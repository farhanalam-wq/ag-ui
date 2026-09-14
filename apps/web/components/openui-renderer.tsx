"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkle } from "@phosphor-icons/react";

// Client-only dynamic loader for OpenUI Renderer to avoid SSR issues in Next.js
const OpenUIClientRenderer = dynamic(
  () =>
    import("./openui-client-inner").then((mod) => mod.OpenUIClientInner),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center gap-2 p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-400 animate-pulse font-mono">
        <Sparkle className="size-3.5 text-brand-primary" />
        <span>Mounting progressive OpenUI canvas...</span>
      </div>
    ),
  }
);

interface OpenUIRendererProps {
  source: string;
  isStreaming?: boolean;
  className?: string;
}

/**
 * Auto-sanitizes OpenUI Lang source before parsing to eliminate common LLM schema errors
 * (e.g. TextContent size "medium" -> "default").
 */
export function sanitizeOpenUISource(source: string): string {
  if (!source) return "";
  return source.replace(
    /TextContent\s*\(([\s\S]*?),\s*["'](?:medium|normal|regular|body)["']\s*\)/g,
    'TextContent($1, "default")'
  );
}

export function OpenUIRenderer({ source, isStreaming, className }: OpenUIRendererProps) {
  const sanitized = React.useMemo(() => sanitizeOpenUISource(source), [source]);

  if (!sanitized || sanitized.trim().length === 0) {
    return null;
  }

  return (
    <div className={`w-full overflow-x-auto ${className || ""}`}>
      <OpenUIClientRenderer source={sanitized} isStreaming={isStreaming} />
    </div>
  );
}
