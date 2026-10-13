"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowCounterClockwise,
  ArrowSquareOut,
  Check,
  CircleNotch,
  Copy,
  WarningCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { WidgetPreview } from "@/components/experience/widget-preview";
import { mapBrandToWidgetTheme } from "@ag-ui/shared/client";
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
  const [checkError, setCheckError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [previewTab, setPreviewTab] = useState<"static" | "live">("static");
  const [mounted, setMounted] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const rotateToastArmed = useRef(false);

  const previewTheme = useMemo(
    () =>
      mapBrandToWidgetTheme(
        { colors: { primary: brandColor, secondary: brandColor } },
        null
      ),
    [brandColor]
  );

  useEffect(() => setMounted(true), []);

  const webOrigin = mounted && typeof window !== "undefined" ? window.location.origin : "";
  const raw = phase.kind === "ready" ? phase.raw : null;

  const snippet = raw ? buildSnippet({ webOrigin, raw, apiBase, companyName, position }) : null;

  const verify = useCallback(async () => {
    if (!raw || checking) return;
    setChecking(true);
    setCheckError(null);
    try {
      await apiClient.embed.getConfig(raw, apiBase.trim());
      setLastHandshake(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Widget check failed";
      setCheckError(message);
    } finally {
      setChecking(false);
    }
  }, [raw, apiBase, checking]);

  useEffect(() => {
    if (!raw) return;
    setPreviewLoaded(false);
    setCheckError(null);
    void verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

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
    setRotateOpen(false);
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

  const rotatePrefix =
    phase.kind === "ready" || phase.kind === "existing" ? phase.prefix : null;

  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12">
      {/* Left: form */}
      <div className="min-w-0 space-y-4 lg:col-span-5">
        <Card className="min-w-0">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-[15px] font-semibold">Widget key</CardTitle>
              {(phase.kind === "ready" || phase.kind === "existing") && (
                <Button variant="outline" size="sm" onClick={() => setRotateOpen(true)} disabled={rotating} title="Revoke this key and issue a fresh one (old embeds stop working immediately)">
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

        <div className="space-y-2" aria-live="polite">
          <div className="flex flex-wrap items-center gap-2">
            {checkError ? (
              <Badge variant="outline" className="rounded-full font-normal">
                <span className="mr-1.5 size-1.5 rounded-full bg-destructive" />
                Check failed - {checkError}
              </Badge>
            ) : lastHandshake ? (
              <Badge variant="outline" className="rounded-full font-normal">
                <span className="mr-1.5 size-1.5 rounded-full bg-emerald-500" />
                Responding - checked {timeAgo(lastHandshake)}
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full font-normal">
                <span className="mr-1.5 size-1.5 rounded-full bg-muted-foreground/40" />
                No handshake yet
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void verify()}
              disabled={!raw || checking}
              title={raw ? "Ask the backend for this key config" : "Issue a key first"}
            >
              {checking ? (
                <CircleNotch className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-3.5" aria-hidden="true" />
              )}
              {checking ? "Checking..." : "Verify"}
            </Button>
            <Button size="sm" asChild style={{ backgroundColor: brandColor }}>
              <a
                href={`${webOrigin}/playground?company=${encodeURIComponent(companyId)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white hover:opacity-90"
              >
                <ArrowSquareOut className="size-3.5" data-icon="inline-start" />
                <span>Test live chatbot</span>
              </a>
            </Button>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            Strict CSP sites may need <code>frame-src {webOrigin || "..."}</code>
          </p>
        </div>

        <Card className="min-w-0 overflow-hidden">
          <CardHeader className="space-y-2 border-b border-border px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                Preview
              </span>
              <div className="flex gap-1.5" aria-label="Preview mode">
                {(["static", "live"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setPreviewTab(t)}
                    aria-pressed={previewTab === t}
                    className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                      previewTab === t
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {t === "static" ? "Static" : "Live"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {previewTab === "static"
                ? "Sample thread in brand color. Position applies to the launcher on your site, not this thread."
                : previewLoaded
                  ? "Live frame loaded. This shows the real route, not a handshake."
                  : "Live frame for the real route. Loading it is not a handshake, use Verify above."}
            </p>
          </CardHeader>
          <CardContent className="bg-muted/40 p-3">
            {previewTab === "static" ? (
              <WidgetPreview
                theme={previewTheme}
                displayName={companyName || "Assistant"}
                domain="Company assistant"
              />
            ) : raw ? (
              <div className="flex justify-center">
                <iframe
                  title={`${companyName} chatbot preview`}
                  src={`${webOrigin}/embed/${encodeURIComponent(raw)}?api=${encodeURIComponent(apiBase.trim())}`}
                  width={360}
                  height={520}
                  onLoad={() => setPreviewLoaded(true)}
                  className="h-[520px] w-full max-w-[360px] rounded-lg border border-border bg-background"
                />
              </div>
            ) : (
              <p className="font-mono text-[11px] text-muted-foreground">
                Issue a key first, then the live frame appears here.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={rotateOpen}
        onOpenChange={(open) => {
          if (!open && !rotating) setRotateOpen(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rotate widget key?</AlertDialogTitle>
            <AlertDialogDescription>
              {rotatePrefix ? (
                <>Key {rotatePrefix}... stops working immediately. A fresh snippet appears here after rotation. This cannot be undone.</>
              ) : (
                <>The current key stops working immediately. A fresh snippet appears here after rotation. This cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotating}>Keep key</AlertDialogCancel>
            <AlertDialogAction
              disabled={rotating}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleRotate();
              }}
            >
              {rotating ? "Rotating..." : "Rotate key"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
