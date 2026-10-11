"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  CircleNotch,
  Copy,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import { copyToClipboard } from "@/lib/copy";
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
  // API base is fixed from env (NEXT_PUBLIC_API_URL), not user-editable.
  const [apiBase] = useState<string>(() => defaultApiBase());
  const [position, setPosition] = useState<"bottom-right" | "bottom-left">("bottom-right");
  const [framework, setFramework] = useState<FrameworkId>("html");
  const [copied, setCopied] = useState(false);
  const [lastHandshake, setLastHandshake] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const webOrigin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const raw = phase.kind === "ready" ? phase.raw : null;

  const snippet = raw ? buildSnippet({ webOrigin, raw, apiBase, companyName, position }) : null;

  const ping = useCallback(async () => {
    if (!raw) return;
    try {
      await apiClient.embed.getConfig(raw, apiBase.trim());
      setLastHandshake(Date.now());
    } catch {
      // best-effort only; page never blocks on ping
    }
  }, [raw, apiBase]);

  useEffect(() => {
    if (!raw) return;
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, [raw, ping]);

  const handleCopy = useCallback(async () => {
    if (!snippet) return;
    const ok = await copyToClipboard(snippet, {
      successTitle: "Snippet copied to clipboard",
      successDescription: "Paste it before </body> on any site.",
    });
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }, [snippet]);

  const handleRotate = useCallback(async () => {
    if (!window.confirm("Rotate this key? Old embeds stop working immediately.")) return;
    await rotate();
  }, [rotate]);

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12">
      {/* Left: form */}
      <div className="min-w-0 space-y-4 lg:col-span-5">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-[15px] font-semibold">Widget key</CardTitle>
              {(phase.kind === "ready" || phase.kind === "existing") && (
                <Button variant="outline" size="sm" onClick={handleRotate} disabled={rotating} title="Revoke this key and issue a fresh one (old embeds stop working immediately)">
                  <ArrowCounterClockwise className={rotating ? "animate-spin" : ""} />
                  <span>{rotating ? "Rotating..." : "Rotate key"}</span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {phase.kind === "issuing" && (
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <CircleNotch className="size-3.5 animate-spin" />
                <span>Issuing secure widget key...</span>
              </div>
            )}
            {phase.kind === "error" && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
              >
                <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="flex-1">
                  <div className="font-semibold">Could not issue widget key</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">{phase.message}</div>
                  <Button variant="outline" size="sm" className="mt-2" onClick={retry}>Retry</Button>
                </div>
              </div>
            )}
            {phase.kind === "existing" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <span className="font-mono text-[11px] text-muted-foreground">
                  Key <span className="font-semibold text-foreground">{phase.prefix}...</span> already issued - raws are shown once and never stored. Rotate to get a fresh snippet.
                </span>
              </div>
            )}
            {phase.kind === "ready" && (
              <div className="font-mono text-[11px] text-muted-foreground">
                Key <span className="text-emerald-500">{phase.prefix}...</span> active
              </div>
            )}

            <div className="space-y-2">
              <span className="block font-mono text-[11px] text-muted-foreground">Position</span>
              <div className="flex gap-2" aria-label="Widget position">
                {(["bottom-left", "bottom-right"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPosition(p)}
                    aria-pressed={position === p}
                    className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${
                      position === p
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p === "bottom-left" ? "Bottom left" : "Bottom right"}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-[15px] font-semibold">Framework setup</CardTitle>
            <CardDescription className="text-[13px]">
              Same snippet everywhere. Pick a guide for install notes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 pt-0">
            <div className="flex flex-wrap gap-1.5" aria-label="Framework guides">
              {FRAMEWORK_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={framework === id}
                  onClick={() => setFramework(id)}
                  className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                    framework === id
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {FRAMEWORK_NOTES[id].label}
                </button>
              ))}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">{FRAMEWORK_NOTES[framework].note}</p>
          </CardContent>
        </Card>
      </div>

      {/* Right: snippet + ping + preview */}
      <div className="min-w-0 space-y-4 lg:col-span-7 lg:sticky lg:top-20 lg:self-start">
        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border px-3 py-2">
            <span className="font-mono text-[11px] text-muted-foreground">Snippet - paste on any site</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!snippet}
              aria-label="Copy snippet"
              title={!snippet ? "Snippet unavailable until a key is issued" : "Copy snippet"}
            >
              {copied ? <Check className="text-emerald-500" /> : <Copy />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {phase.kind === "issuing" || !mounted ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <pre className="select-all overflow-x-auto whitespace-pre p-3 font-mono text-[11px] text-foreground">
                {snippet ?? "Snippet unavailable - issue a key first."}
              </pre>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
          {lastHandshake ? (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-500">
              <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" />
              Last handshake {timeAgo(lastHandshake)} - {new Date(lastHandshake).toLocaleTimeString()}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/40" />
              No handshake yet
            </span>
          )}
          <span className="font-mono text-[11px] text-muted-foreground">
            Strict CSP sites may need <code>frame-src {webOrigin || "..."}</code>
          </span>
          <Button size="sm" asChild style={{ backgroundColor: brandColor }}>
            <a
              href={`${webOrigin}/playground`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white hover:opacity-90"
            >
              <ArrowSquareOut className="size-3.5" data-icon="inline-start" />
              <span>Test live chatbot</span>
            </a>
          </Button>
        </div>

        {raw && (
          <Card className="min-w-0 overflow-hidden">
            <CardHeader className="border-b border-border bg-muted/40 px-3 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                Live preview (360x520)
              </span>
            </CardHeader>
            <CardContent className="flex justify-center bg-muted/40 p-3">
              <iframe
                title={`${companyName} chatbot preview`}
                src={`${webOrigin}/embed/${encodeURIComponent(raw)}?api=${encodeURIComponent(apiBase.trim())}`}
                width={360}
                height={520}
                onLoad={() => setLastHandshake(Date.now())}
                className="h-[520px] w-full max-w-[360px] rounded-lg border border-border bg-background"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
