"use client";

/**
 * Widget Studio: exact preview of the production widget with live controls.
 *
 * Loader vs renderer, stated plainly: `public/embed.js` is the loader
 * (launcher button, lazy iframe, config fetch, first-paint params) and is
 * never touched here. The preview below is the same chat bundle the public
 * widget serves, mounted in an iframe for style isolation — parity by
 * definition, minus loader chrome. The launcher strip above it is a static
 * replica sharing the loader's dimension constants. Preview identity is the
 * selected company (studio session), so no widget key ever appears here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { ArrowRight, Buildings, CircleNotch } from "@phosphor-icons/react";
import { toast } from "sonner";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useSelectedCompany } from "@/stores/use-company-store";
import { apiClient } from "@/lib/api-client";
import { copyToClipboard } from "@/lib/copy";
import {
  contrastRatio,
  isValidOverride,
  mapBrandToWidgetTheme,
  mergeThemeOverride,
  type WidgetTheme,
  type WidgetThemeOverride,
} from "@ag-ui/shared/client";
import {
  PANEL_ALLOW,
  PANEL_H,
  PANEL_SANDBOX,
  PANEL_W,
  StudioOrbPreview,
} from "@/components/experience/studio-orb-preview";
import { StudioControls } from "@/components/experience/studio-controls";

/** Shared press feedback for the studio action cluster (reduced-motion safe). */
const ACTION_BTN =
  "transition-[color,background-color,transform] active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100";

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Stable-key JSON for order-insensitive override comparison. */
function stableKey(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(stableKey).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKey(o[k])}`)
    .join(",")}}`;
}

/**
 * Live widget preview. Mounts the company-keyed preview renderer in an
 * iframe (same bundle as prod, style isolation included) and pushes theme
 * edits over a message channel — the frame never reloads while dragging
 * controls. Answer-only flags ride on the URL; nothing here writes to the
 * brand.
 */
export default function WidgetStudioPage() {
  const selectedCompany = useSelectedCompany();
  const companyId = selectedCompany?.id ?? null;
  const [baseTheme, setBaseTheme] = useState<WidgetTheme | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [edits, setEdits] = useState<WidgetThemeOverride>({});
  const [publishedOverride, setPublishedOverride] = useState<WidgetThemeOverride | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [panelW, setPanelW] = useState(PANEL_W);
  const [panelH, setPanelH] = useState(PANEL_H);
  const [previewMode, setPreviewMode] = useState<"auto" | "light" | "dark">("auto");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const draftKey = companyId ? `widget-studio-draft:${companyId}` : null;

  // Base theme comes from the same company detail the preview renderer
  // reads, so controls and preview start from one identical theme. The
  // published override (server) and any local draft seed the controls; the
  // draft is an unsaved scratch and never auto-publishes.
  // The server derivation already carries the full slot shape; the merge
  // below only future-proofs older payloads.
  useEffect(() => {
    if (!companyId) {
      setBaseTheme(null);
      setPublishedOverride(null);
      setPublishedAt(null);
      return;
    }
    let cancelled = false;
    setBaseLoading(true);
    (async () => {
      try {
        const [detail, themeOverride] = await Promise.all([
          apiClient.companies.get(companyId),
          apiClient.companies.getWidgetTheme(companyId).catch(() => ({
            override: null as WidgetThemeOverride | null,
            updatedAt: null as string | null,
          })),
        ]);
        if (cancelled) return;

        const t = detail.theme as unknown as Partial<WidgetTheme> | undefined;
        const seed: WidgetTheme =
          t && typeof t.primary === "string"
            ? {
                ...mapBrandToWidgetTheme(null),
                primary: t.primary,
                secondary: t.secondary ?? "#3b82f6",
                radius: t.radius ?? "0.5rem",
                surface: t.surface ?? "#09090b",
                text: t.text ?? "#fafafa",
                logoUrl: t.logoUrl ?? null,
                fullSurface: t.fullSurface ?? false,
                bodySurface: t.bodySurface ?? t.fullSurface ?? false,
                accentOnSurface: t.accentOnSurface ?? t.fullSurface ?? false,
                surfaceSource: "tokens",
              }
            : mapBrandToWidgetTheme(null);
        setBaseTheme(mergeThemeOverride(seed, (t ?? {}) as WidgetThemeOverride));

        const published =
          themeOverride.override && isValidOverride(themeOverride.override)
            ? themeOverride.override
            : null;
        setPublishedOverride(published);
        setPublishedAt(themeOverride.updatedAt ?? null);

        // Restore an explicit local draft (unsaved scratch) for this company
        // if present; otherwise reflect the published override.
        let restored: WidgetThemeOverride | null = null;
        let restoredAt: string | null = null;
        try {
          const raw = window.localStorage.getItem(`widget-studio-draft:${companyId}`);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (isValidOverride(parsed)) {
              restored = parsed;
              restoredAt = window.localStorage.getItem(`widget-studio-draft:${companyId}:at`);
            }
          }
        } catch {
          // unreadable draft — fall back to published
        }
        if (restored) {
          setEdits(restored);
          setSavedAt(restoredAt);
        } else {
          setEdits(published ?? {});
          setSavedAt(null);
        }
      } catch (err) {
        if (cancelled) return;
        toast.error("Could not load widget config", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setBaseTheme(null);
      } finally {
        if (!cancelled) setBaseLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const draft: WidgetTheme | null = useMemo(() => {
    if (!baseTheme) return null;
    return mergeThemeOverride(baseTheme, edits);
  }, [baseTheme, edits]);

  const draftVersion = useMemo(
    () => (draft ? `draft-${shortHash(JSON.stringify(draft))}` : null),
    [draft]
  );

  const contrast = draft ? contrastRatio(draft.text, draft.surface) : null;
  const canPublish = contrast != null && contrast >= 4.5;

  const isPublishedDirty = useMemo(
    () => stableKey(edits) !== stableKey(publishedOverride ?? {}),
    [edits, publishedOverride]
  );

  // Effective light/dark for the preview: an explicit toggle wins, else follow
  // the studio's own mode (same next-themes provider as the shell toggle).
  const { resolvedTheme } = useTheme();
  const effectiveDark =
    previewMode === "auto"
      ? resolvedTheme === "dark"
      : previewMode === "dark";

  const postTheme = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow || !draft || !draftVersion) return;
    try {
      frame.contentWindow.postMessage(
        {
          type: "ag-ui/theme",
          theme: draft,
          themeVersion: draftVersion,
          dark: effectiveDark,
          mode: previewMode,
        },
        window.location.origin
      );
    } catch {
      // frame not ready — the ready handshake below covers it
    }
  }, [draft, draftVersion, effectiveDark, previewMode]);

  // Mode-only message on change so the frame re-syncs without a full theme post.
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { type: "ag-ui/mode", dark: effectiveDark, mode: previewMode },
        window.location.origin
      );
    } catch {
      // ignore — next theme post carries the mode
    }
  }, [effectiveDark, previewMode]);

  // Push edits into the frame. Source is stable across drafts, so no reload.
  useEffect(() => {
    postTheme();
  }, [postTheme]);

  const resendToFrame = useCallback(() => {
    postTheme();
  }, [postTheme]);

  // Child handshake: when the frame reports ready, (re)send theme + mode. This
  // removes the load/post race that could drop the very first message.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin) return;
      const data = e.data as { type?: string } | null;
      if (data?.type === "ag-ui/ready") postTheme();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postTheme]);

  const handlePatch = useCallback((patch: WidgetThemeOverride) => {
    if (!isValidOverride(patch)) {
      toast.error("Invalid value", { description: "Theme edit rejected" });
      return;
    }
    setEdits((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleReset = useCallback(() => setEdits({}), []);

  const handleResetGroup = useCallback((fields: (keyof WidgetThemeOverride)[]) => {
    setEdits((prev) => {
      const next = { ...prev };
      for (const f of fields) delete next[f];
      return next;
    });
  }, []);

  const handleDims = useCallback((w: number, h: number) => {
    if (Number.isFinite(w) && w >= 200) setPanelW(Math.round(w));
    if (Number.isFinite(h) && h >= 200) setPanelH(Math.round(h));
  }, []);

  const handleCopy = useCallback(() => {
    void copyToClipboard(JSON.stringify(edits, null, 2), {
      successTitle: "Override copied",
      successDescription: `${Object.keys(edits).length} fields`,
    });
  }, [edits]);

  const handlePaste = useCallback((text: string) => {
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isValidOverride(parsed)) {
        toast.error("Invalid override", { description: "Pasted JSON failed validation" });
        return;
      }
      setEdits(parsed);
      toast.success("Override applied", {
        description: `${Object.keys(parsed).length} fields`,
      });
    } catch {
      toast.error("Invalid override", { description: "Pasted text is not JSON" });
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!draftKey) return;
    try {
      window.localStorage.setItem(draftKey, JSON.stringify(edits));
      const at = new Date().toLocaleTimeString();
      window.localStorage.setItem(`${draftKey}:at`, at);
      setSavedAt(at);
      toast.success("Draft saved", {
        description: `${Object.keys(edits).length} fields, preview-only`,
      });
    } catch {
      toast.error("Save failed", { description: "Browser storage unavailable" });
    }
  }, [draftKey, edits]);

  // Publish is the only DB write: it upserts the company's override and the
  // server busts the retrieval cache so open embeds re-theme over SSE.
  const handlePublish = useCallback(async () => {
    if (!companyId) return;
    if (contrast != null && contrast < 4.5) {
      toast.error("Cannot publish", {
        description: "Text/surface contrast is below 4.5",
      });
      return;
    }
    setPublishing(true);
    try {
      const res = await apiClient.companies.publishWidgetTheme(companyId, edits);
      const published =
        res.override && isValidOverride(res.override) ? res.override : edits;
      setPublishedOverride(published);
      setPublishedAt(res.updatedAt ?? new Date().toISOString());
      // The published override is now the source of truth; drop the local
      // scratch so a later reload shows the live theme.
      try {
        if (draftKey) {
          window.localStorage.removeItem(draftKey);
          window.localStorage.removeItem(`${draftKey}:at`);
        }
      } catch {
        // storage unavailable
      }
      setSavedAt(null);
      const count = Object.keys(edits).length;
      toast.success("Theme published", {
        description: `${count} field${count === 1 ? "" : "s"} live`,
      });
    } catch (err) {
      toast.error("Publish failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPublishing(false);
    }
  }, [companyId, contrast, edits, draftKey]);

  const handleDiscard = useCallback(async () => {
    if (!companyId) return;
    setPublishing(true);
    try {
      await apiClient.companies.discardWidgetTheme(companyId);
      setPublishedOverride(null);
      setPublishedAt(null);
      setEdits({});
      try {
        if (draftKey) {
          window.localStorage.removeItem(draftKey);
          window.localStorage.removeItem(`${draftKey}:at`);
        }
      } catch {
        // storage unavailable
      }
      setSavedAt(null);
      toast.success("Reverted to brand", {
        description: "Published override removed",
      });
    } catch (err) {
      toast.error("Discard failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setPublishing(false);
    }
  }, [companyId, draftKey]);

  const handleAvatarFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Invalid artwork", { description: "File must be an image" });
        return;
      }
      if (file.size > 500_000) {
        toast.error("Invalid artwork", { description: "File must be under 500KB" });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const url = typeof reader.result === "string" ? reader.result : null;
        if (!url) {
          toast.error("Upload failed", { description: "Could not read file" });
          return;
        }
        handlePatch({ customAvatarUrl: url, avatarMode: "custom" });
      };
      reader.onerror = () => {
        toast.error("Upload failed", { description: "Could not read file" });
      };
      reader.readAsDataURL(file);
    },
    [handlePatch]
  );

  // Stable per company: edits travel over the channel, so the URL never
  // changes while dragging and the frame never reloads.
  const frameSrc = useMemo(() => {
    if (!companyId) return null;
    const q = new URLSearchParams({ company: companyId });
    return `/experience/widget-studio/preview?${q.toString()}`;
  }, [companyId]);

  const dirtyCount = Object.keys(edits).length;
  const statusText = [
    dirtyCount > 0
      ? `${dirtyCount} override field${dirtyCount === 1 ? "" : "s"}`
      : "Matches brand extraction",
    savedAt ? `draft saved ${savedAt}` : null,
    publishedAt ? "published" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Widget Studio" }]}>
      <div className="min-w-0">
        <div className="sticky top-14 z-20 -mx-4 border-b border-border bg-background/85 px-4 py-2.5 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="text-[22px] leading-7 tracking-tight font-semibold">
                Widget Studio
              </h1>
              <p className="truncate text-[12px] leading-4 text-muted-foreground">
                Exact preview of the production widget with live theme controls.
              </p>
            </div>

            {selectedCompany && companyId && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Button
                  size="sm"
                  className={ACTION_BTN}
                  onClick={handlePublish}
                  disabled={!canPublish || !isPublishedDirty || publishing}
                  title={
                    !canPublish
                      ? "Raise text/surface contrast to 4.5 before publishing"
                      : !isPublishedDirty
                        ? "No changes to publish"
                        : undefined
                  }
                >
                  {publishing ? "Publishing…" : "Publish"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={ACTION_BTN}
                  onClick={handleSave}
                >
                  Save draft
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={ACTION_BTN}
                  onClick={handleCopy}
                >
                  Copy override
                </Button>
                <div className="relative">
                  <Button
                    variant="outline"
                    size="sm"
                    className={ACTION_BTN}
                    onClick={() => setPasteOpen((v) => !v)}
                  >
                    {pasteOpen ? "Close" : "Paste override"}
                  </Button>
                  {pasteOpen && (
                    <div className="absolute right-0 top-full z-30 mt-2 w-72 space-y-2 rounded-lg border border-border bg-popover p-2 shadow-xl">
                      <textarea
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder='{"primary":"#9b6a45"}'
                        spellCheck={false}
                        rows={3}
                        className="w-full rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px]"
                      />
                      <Button
                        size="sm"
                        className={`${ACTION_BTN} w-full`}
                        onClick={() => {
                          handlePaste(pasteText);
                          setPasteText("");
                          setPasteOpen(false);
                        }}
                      >
                        Apply pasted override
                      </Button>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className={ACTION_BTN}
                  onClick={handleDiscard}
                  disabled={publishing || !publishedAt}
                  title={!publishedAt ? "Nothing published to discard" : undefined}
                >
                  Discard
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={ACTION_BTN}
                  onClick={handleReset}
                >
                  Reset to brand
                </Button>
              </div>
            )}
          </div>
          {selectedCompany && companyId && (
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {statusText}
            </p>
          )}
        </div>

        {!selectedCompany || !companyId ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Buildings aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No company selected</EmptyTitle>
              <EmptyDescription>
                Pick a company to preview its widget.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link href="/knowledge/ingest">
                  Index a company
                  <ArrowRight className="size-4" data-icon="inline-end" />
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="mt-6 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(400px,560px)]">
            <div className="min-w-0">
              {baseLoading || !draft ? (
                <Card className="min-w-0">
                  <CardContent className="space-y-2 pt-5">
                    <Skeleton className="h-10 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                  </CardContent>
                </Card>
              ) : (
                <StudioControls
                  draft={draft}
                  override={edits}
                  contrast={contrast}
                  canPublish={canPublish}
                  onPatch={handlePatch}
                  onResetGroup={handleResetGroup}
                  onAvatarFile={handleAvatarFile}
                />
              )}
            </div>
            <div className="min-w-0 space-y-4 xl:sticky xl:top-36 xl:self-start">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="flex gap-1.5"
                  role="radiogroup"
                  aria-label="Preview mode"
                >
                  {(["auto", "light", "dark"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={previewMode === m}
                      onClick={() => setPreviewMode(m)}
                      title={
                        m === "auto"
                          ? "Follow the studio's light/dark mode"
                          : `Force the preview ${m}`
                      }
                      className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                        previewMode === m
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m === "auto" ? "Auto" : m === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    W
                    <input
                      type="number"
                      value={panelW}
                      min={200}
                      step={10}
                      onChange={(e) =>
                        handleDims(Number(e.target.value) || panelW, panelH)
                      }
                      className="w-16 rounded-md border border-border bg-muted/40 px-1.5 py-1 font-mono text-[11px] text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    H
                    <input
                      type="number"
                      value={panelH}
                      min={200}
                      step={10}
                      onChange={(e) =>
                        handleDims(panelW, Number(e.target.value) || panelH)
                      }
                      className="w-16 rounded-md border border-border bg-muted/40 px-1.5 py-1 font-mono text-[11px] text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </label>
                </div>
              </div>
              {draft && (
                <div className="flex items-center justify-center gap-3">
                  <StudioOrbPreview theme={draft} />
                  <p className="text-xs text-muted-foreground">
                    Launcher preview at 56px, same styling as the loader.
                  </p>
                </div>
              )}
              {frameSrc && (
                <div className="flex justify-center">
                  <iframe
                    ref={iframeRef}
                    key={companyId}
                    src={frameSrc}
                    title={`Widget preview for ${selectedCompany.name}`}
                    onLoad={resendToFrame}
                    sandbox={PANEL_SANDBOX}
                    allow={PANEL_ALLOW}
                    className="border border-border"
                    style={{
                      width: `min(${panelW}px, 100vw - 32px)`,
                      height: `min(${panelH}px, 100dvh - 140px)`,
                      borderRadius: draft?.panelRadius ?? 16,
                      background: draft?.surface ?? "#09090b",
                    }}
                  />
                </div>
              )}
              {!baseLoading && !draft && (
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
                  Loading widget config…
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </StudioShell>
  );
}
