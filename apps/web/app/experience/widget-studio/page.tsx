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

function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
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
  const [panelW, setPanelW] = useState(PANEL_W);
  const [panelH, setPanelH] = useState(PANEL_H);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const draftKey = companyId ? `widget-studio-draft:${companyId}` : null;

  // Base theme comes from the same company detail the preview renderer
  // reads, so controls and preview start from one identical theme.
  // The server derivation already carries the full slot shape; the merge
  // below only future-proofs older payloads.
  useEffect(() => {
    if (!companyId) {
      setBaseTheme(null);
      return;
    }
    let cancelled = false;
    setBaseLoading(true);
    apiClient.companies
      .get(companyId)
      .then((detail) => {
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
        // Restore an explicit draft save for this company, if one exists.
        try {
          const raw = window.localStorage.getItem(`widget-studio-draft:${companyId}`);
          if (raw) {
            const parsed: unknown = JSON.parse(raw);
            if (isValidOverride(parsed)) {
              setEdits(parsed);
              setSavedAt(window.localStorage.getItem(`widget-studio-draft:${companyId}:at`));
            } else {
              setEdits({});
              setSavedAt(null);
            }
          } else {
            setEdits({});
            setSavedAt(null);
          }
        } catch {
          setEdits({});
          setSavedAt(null);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error("Could not load widget config", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
        setBaseTheme(null);
      })
      .finally(() => {
        if (!cancelled) setBaseLoading(false);
      });
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

  // Push edits into the frame. Source is stable across drafts, so no reload.
  useEffect(() => {
    if (!draft || !draftVersion) return;
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    try {
      const dark =
        typeof document !== "undefined"
          ? document.documentElement.classList.contains("dark")
          : true;
      frame.contentWindow.postMessage(
        { type: "ag-ui/theme", theme: draft, themeVersion: draftVersion, dark },
        window.location.origin
      );
    } catch {
      // frame not ready — the onLoad resend below covers it
    }
  }, [draft, draftVersion]);

  const resendToFrame = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow || !draft || !draftVersion) return;
    try {
      const dark =
        typeof document !== "undefined"
          ? document.documentElement.classList.contains("dark")
          : true;
      frame.contentWindow.postMessage(
        { type: "ag-ui/theme", theme: draft, themeVersion: draftVersion, dark },
        window.location.origin
      );
    } catch {
      // ignore — next edit resends
    }
  }, [draft, draftVersion]);

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

  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Widget Studio" }]}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
              Widget Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              Exact preview of the production widget with live theme controls.
              Answer-only, nothing sends anywhere except the preview.
            </p>
          </div>
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
          <div className="mt-6 grid min-w-0 items-start gap-4 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-7">
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
                  canPublish={contrast != null && contrast >= 4.5}
                  panelW={panelW}
                  panelH={panelH}
                  savedAt={savedAt}
                  isDirty={Object.keys(edits).length > 0}
                  onPatch={handlePatch}
                  onReset={handleReset}
                  onResetGroup={handleResetGroup}
                  onDims={handleDims}
                  onAvatarFile={handleAvatarFile}
                  onCopy={handleCopy}
                  onPaste={handlePaste}
                  onSave={handleSave}
                />
              )}
            </div>
            <div className="min-w-0 space-y-4 lg:col-span-5 lg:sticky lg:top-20 lg:self-start">
              {draft && (
                <div className="flex items-center gap-3">
                  <StudioOrbPreview theme={draft} />
                  <p className="text-xs text-muted-foreground">
                    Launcher preview at 56px, same styling as the loader.
                  </p>
                </div>
              )}
              {frameSrc && (
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
