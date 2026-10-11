"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  CircleNotch,
  WarningCircle,
  ArrowSquareOut,
  ArrowCounterClockwise,
  Code,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { useWidgetKeys } from "@/components/integration/use-widget-keys";
import { buildSnippet, defaultApiBase } from "@/components/integration/snippet-builder";
import type { PipelineResultData } from "./pipeline-telemetry";

interface EmbedSnippetProps {
  result: PipelineResultData;
}

export function EmbedSnippet({ result }: EmbedSnippetProps) {
  const { phase, rotating, rotate, retry } = useWidgetKeys(result.companyId);
  const [apiBase] = useState<string>(() => defaultApiBase());
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rotateToastArmed = useRef(false);

  useEffect(() => setMounted(true), []);

  const webOrigin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const brandColor = result.brand?.tokens?.colors?.primary || "#3b82f6";

  const raw = phase.kind === "ready" ? phase.raw : null;
  const snippet = raw
    ? buildSnippet({ webOrigin, raw, apiBase, companyName: result.companyName })
    : null;

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
    rotateToastArmed.current = true;
    await rotate();
  }, [rotate]);

  useEffect(() => {
    if (!rotateToastArmed.current) return;
    if (phase.kind === "ready") {
      rotateToastArmed.current = false;
      toast.success("Fresh key issued", {
        description: "Old embeds stop working immediately.",
        icon: <ArrowCounterClockwise className="size-4" aria-hidden="true" />,
      });
    } else if (phase.kind === "error") {
      rotateToastArmed.current = false;
      toast.error("Key rotation failed", {
        description: phase.message,
      });
    }
  }, [phase]);

  const busy = rotating || phase.kind === "issuing";

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Code className="size-4" style={{ color: brandColor }} />
          <span>Deploy chatbot: paste this snippet on any site</span>
        </p>
        {(phase.kind === "ready" || phase.kind === "existing") && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={phase.kind === "ready" ? handleCopy : handleRotate}
            disabled={busy}
          >
            {busy ? (
              <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
            ) : phase.kind === "ready" ? (
              <Copy className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
            )}
            {busy ? "Working" : phase.kind === "ready" ? "Copy embed" : "Rotate key"}
          </Button>
        )}
      </div>

      {phase.kind === "issuing" && (
        <div className="flex items-center gap-2 rounded-lg border p-3 font-mono text-xs text-muted-foreground">
          <CircleNotch className="size-3.5 animate-spin" />
          <span>Issuing secure widget key</span>
        </div>
      )}

      {phase.kind === "error" && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs"
        >
          <WarningCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="flex-1">
            <p className="font-semibold">Could not issue widget key</p>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
              {phase.message}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={retry}
            >
              Retry
            </Button>
          </div>
        </div>
      )}

      {phase.kind === "existing" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-mono text-[11px] text-muted-foreground">
            Key <span className="font-semibold text-foreground">{phase.prefix}…</span>{" "}
            already issued for this company. Raws are shown once and never
            stored. Rotate to get a fresh snippet.
          </p>
        </div>
      )}

      {snippet && raw && (
        <>
          <p className="font-mono text-[11px] text-muted-foreground">
            API base <span className="text-foreground">{apiBase}</span> (fixed — served from our backend, not editable)
          </p>

          <div className="relative overflow-hidden rounded-lg border bg-muted/40">
            <pre className="select-all whitespace-pre-wrap break-all p-3 pr-12 font-mono text-[11px]">
              {snippet}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="absolute right-2 top-2 size-7"
              onClick={handleCopy}
              title="Copy snippet"
              aria-label="Copy snippet"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Test opens first-party chat; snippet/preview above remain the embed route */}
            <Button asChild style={{ backgroundColor: brandColor }}>
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
            <span className="font-mono text-[11px] text-muted-foreground">
              Strict CSP sites may need{" "}
              <code>frame-src {webOrigin}</code>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
