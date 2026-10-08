"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  CircleNotch,
  Copy,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { useWidgetKeys } from "./use-widget-keys";
import {
  FRAMEWORK_IDS,
  FRAMEWORK_NOTES,
  buildSnippet,
  defaultApiBase,
  type FrameworkId,
} from "./snippet-builder";

interface EmbedSnippetStudioProps {
  companyId: string;
  companyName: string;
  brandColor: string;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function EmbedSnippetStudio({ companyId, companyName, brandColor }: EmbedSnippetStudioProps) {
  const { phase, rotating, rotate, retry } = useWidgetKeys(companyId);
  const [apiBase, setApiBase] = useState<string>(() => defaultApiBase());
  const [position, setPosition] = useState<"bottom-right" | "bottom-left">("bottom-right");
  const [framework, setFramework] = useState<FrameworkId>("html");
  const [copied, setCopied] = useState(false);
  const [lastHandshake, setLastHandshake] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const webOrigin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const raw = phase.kind === "ready" ? phase.raw : null;
  const apiValid = useMemo(() => {
    try {
      const u = new URL(apiBase.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch {
      return false;
    }
  }, [apiBase]);

  const snippet = raw && apiValid ? buildSnippet({ webOrigin, raw, apiBase, companyName, position }) : null;

  const ping = useCallback(async () => {
    if (!raw) return;
    try {
      await apiClient.embed.getConfig(raw, apiValid ? apiBase.trim() : undefined);
      setLastHandshake(Date.now());
    } catch {
      // best-effort only; page never blocks on ping
    }
  }, [raw, apiBase, apiValid]);

  useEffect(() => {
    if (!raw) return;
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [raw, ping]);

  const handleCopy = useCallback(async () => {
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      // non-secure context: text remains selectable below
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [snippet]);

  const handleRotate = useCallback(async () => {
    if (!window.confirm("Rotate this key? Old embeds stop working immediately.")) return;
    await rotate();
  }, [rotate]);

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      {/* Left: form */}
      <div className="space-y-4 lg:col-span-5">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-zinc-200">Widget key</div>
            {(phase.kind === "ready" || phase.kind === "existing") && (
              <Button variant="outline" size="sm" onClick={handleRotate} disabled={rotating} title="Revoke this key and issue a fresh one (old embeds stop working immediately)">
                <ArrowCounterClockwise className={rotating ? "animate-spin" : ""} />
                <span>{rotating ? "Rotating…" : "Rotate key"}</span>
              </Button>
            )}
          </div>

          {phase.kind === "issuing" && (
            <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
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
                <Button variant="outline" size="sm" className="mt-2" onClick={retry}>Retry</Button>
              </div>
            </div>
          )}
          {phase.kind === "existing" && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200/90">
              <span className="font-mono text-[11px]">
                Key <span className="font-semibold">{phase.prefix}…</span> already issued — raws are shown once and never stored. Rotate to get a fresh snippet.
              </span>
            </div>
          )}
          {phase.kind === "ready" && (
            <div className="text-[11px] font-mono text-zinc-400">
              Key <span className="text-emerald-400">{phase.prefix}…</span> active
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="embed-api-base" className="text-[11px] font-mono text-zinc-500 block">
              API base (edit if the host site must reach a non-local backend)
            </label>
            <Input
              id="embed-api-base"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
              spellCheck={false}
              className="font-mono"
            />
            {!apiValid && (
              <p className="text-[11px] font-mono text-red-300">Enter a valid http(s) URL.</p>
            )}
          </div>

          <div className="space-y-2">
            <span className="text-[11px] font-mono text-zinc-500 block">Position</span>
            <div className="flex gap-2">
              {(["bottom-right", "bottom-left"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  aria-pressed={position === p}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-colors ${
                    position === p
                      ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {p === "bottom-right" ? "Bottom right" : "Bottom left"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
          <div className="text-xs font-semibold text-zinc-200">Framework setup</div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Framework guides">
            {FRAMEWORK_IDS.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={framework === id}
                onClick={() => setFramework(id)}
                className={`px-2.5 py-1 rounded-md border text-[11px] font-mono transition-colors ${
                  framework === id
                    ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                    : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800"
                }`}
              >
                {FRAMEWORK_NOTES[id].label}
              </button>
            ))}
          </div>
          <p className="text-[11px] font-mono text-zinc-500">{FRAMEWORK_NOTES[framework].note}</p>
        </div>
      </div>

      {/* Right: snippet + ping + preview */}
      <div className="space-y-4 lg:col-span-7 lg:sticky lg:top-20 self-start">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800">
            <span className="text-[11px] font-mono text-zinc-500">Snippet — paste on any site</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!snippet}
              aria-label="Copy snippet"
              title={!snippet ? "Snippet unavailable until a key is issued" : "Copy snippet"}
            >
              {copied ? <Check className="text-emerald-400" /> : <Copy />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </div>
          {phase.kind === "issuing" || !mounted ? (
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <pre className="p-3 text-[11px] font-mono text-zinc-300 whitespace-pre-wrap break-all select-all">
              {snippet ?? "Snippet unavailable — issue a key first."}
            </pre>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {lastHandshake ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
              <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              Last handshake {timeAgo(lastHandshake)} · {new Date(lastHandshake).toLocaleTimeString()}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
              <span className="size-1.5 rounded-full bg-zinc-600" />
              No handshake yet
            </span>
          )}
          <span className="text-[11px] font-mono text-zinc-500">
            Strict CSP sites may need <code className="text-zinc-400">frame-src {webOrigin || "…"}</code>
          </span>
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
        </div>

        {raw && (
          <details className="rounded-xl border border-zinc-800 overflow-hidden" open>
            <summary className="px-3 py-2 text-[11px] font-mono text-zinc-400 hover:text-zinc-200 cursor-pointer bg-zinc-900/40">
              Live preview (360×520)
            </summary>
            <iframe
              title={`${companyName} chatbot preview`}
              src={`${webOrigin}/embed/${encodeURIComponent(raw)}?api=${encodeURIComponent(apiBase.trim())}`}
              width={360}
              height={520}
              onLoad={() => setLastHandshake(Date.now())}
              className="w-full max-w-[360px] h-[520px] bg-zinc-950"
            />
          </details>
        )}
      </div>
    </div>
  );
}
