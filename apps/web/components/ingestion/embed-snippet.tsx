"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Check,
  Copy,
  CircleNotch,
  WarningCircle,
  ArrowSquareOut,
  ArrowCounterClockwise,
  Code,
} from "@phosphor-icons/react";
import { useWidgetKeys } from "@/components/integration/use-widget-keys";
import { buildSnippet, defaultApiBase } from "@/components/integration/snippet-builder";
import type { PipelineResultData } from "./pipeline-telemetry";

interface EmbedSnippetProps {
  result: PipelineResultData;
}

export function EmbedSnippet({ result }: EmbedSnippetProps) {
  const { phase, rotating, rotate, retry } = useWidgetKeys(result.companyId);
  const [apiBase, setApiBase] = useState<string>(() => defaultApiBase());
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const webOrigin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const brandColor = result.brand?.tokens?.colors?.primary || "#3b82f6";

  const raw = phase.kind === "ready" ? phase.raw : null;
  const snippet = raw
    ? buildSnippet({ webOrigin, raw, apiBase, companyName: result.companyName })
    : null;

  const handleCopy = useCallback(async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      // Clipboard API unavailable (non-secure context) — select fallback below still shows the text.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [snippet]);

  return (
    <div className="pt-4 border-t border-zinc-800/80 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
          <Code className="size-4" style={{ color: brandColor }} />
          <span>Deploy chatbot — paste this snippet on any site</span>
        </div>
        {(phase.kind === "ready" || phase.kind === "existing") && (
          <button
            type="button"
            onClick={rotate}
            disabled={rotating}
            className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-40"
            title="Revoke this key and issue a fresh one (old embeds stop working immediately)"
          >
            <ArrowCounterClockwise className={`size-3 ${rotating ? "animate-spin" : ""}`} />
            <span>{rotating ? "Rotating…" : "Rotate key"}</span>
          </button>
        )}
      </div>

      {phase.kind === "issuing" && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-zinc-800 bg-zinc-900/40 text-xs text-zinc-400 font-mono animate-pulse">
          <CircleNotch className="size-3.5 animate-spin" />
          <span>Issuing secure widget key…</span>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          <WarningCircle className="size-4 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold">Could not issue widget key</div>
            <div className="font-mono text-[11px] mt-0.5">{phase.message}</div>
            <button
              type="button"
              onClick={retry}
              className="mt-2 px-2.5 py-1 rounded-md border border-red-500/40 hover:bg-red-500/20 text-xs transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {phase.kind === "existing" && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200/90 space-y-1.5">
          <div className="font-mono text-[11px]">
            Key <span className="font-semibold">{phase.prefix}…</span> already issued for this
            company — raws are shown once and never stored. Rotate to get a fresh snippet.
          </div>
        </div>
      )}

      {snippet && raw && (
        <>
          <div className="space-y-2">
            <label className="text-[11px] font-mono text-zinc-500 block">
              API base (edit if the host site must reach a non-local backend)
            </label>
            <input
              type="text"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value.trim())}
              spellCheck={false}
              className="w-full h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 font-mono focus:outline-none focus:border-brand-primary"
            />
          </div>

          <div className="relative rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden">
            <pre className="p-3 pr-12 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all select-all">
              {snippet}
            </pre>
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 p-1.5 rounded-md border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 transition-colors"
              title="Copy snippet"
            >
              {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Test opens first-party chat; snippet/preview above remain the embed route */}
            <a
              href={`${webOrigin}/playground`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: brandColor }}
            >
              <ArrowSquareOut className="size-3.5" />
              <span>Test live chatbot</span>
            </a>
            <span className="text-[11px] font-mono text-zinc-500">
              Strict CSP sites may need <code className="text-zinc-400">frame-src {webOrigin}</code>
            </span>
          </div>

          <details className="rounded-lg border border-zinc-800/80 overflow-hidden">
            <summary className="px-3 py-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer bg-zinc-900/40">
              Live preview (360×520)
            </summary>
            <iframe
              title={`${result.companyName} chatbot preview`}
              src={`${webOrigin}/embed/${encodeURIComponent(raw)}?api=${encodeURIComponent(apiBase)}`}
              width={360}
              height={520}
              className="w-full max-w-[360px] h-[520px] bg-zinc-950"
            />
          </details>
        </>
      )}
    </div>
  );
}
