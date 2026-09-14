"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Sparkle, Code, Eye } from "@phosphor-icons/react";

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
}

export function OpenUIRenderer({ source, isStreaming }: OpenUIRendererProps) {
  const [showSource, setShowSource] = React.useState(false);

  if (!source || source.trim().length === 0) {
    return null;
  }

  return (
    <div className="my-3 rounded-2xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-md overflow-hidden shadow-2xl transition-all duration-300">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-zinc-800/80 bg-zinc-900/40 text-xs">
        <div className="flex items-center gap-2 text-zinc-300 font-mono">
          <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-medium text-[11px] uppercase tracking-wider text-zinc-400">
            OpenUI Live Component
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isStreaming && (
            <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 animate-pulse">
              Streaming
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowSource(!showSource)}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800"
            title="Toggle OpenUI Lang Source"
          >
            {showSource ? (
              <>
                <Eye className="size-3" />
                <span>Rendered</span>
              </>
            ) : (
              <>
                <Code className="size-3" />
                <span>Source</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 sm:p-5 overflow-x-auto">
        {showSource ? (
          <pre className="text-xs font-mono text-zinc-300 bg-zinc-900/60 p-3 rounded-xl border border-zinc-800 overflow-x-auto leading-relaxed">
            <code>{source}</code>
          </pre>
        ) : (
          <OpenUIClientRenderer source={source} isStreaming={isStreaming} />
        )}
      </div>
    </div>
  );
}
