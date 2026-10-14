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
import {
  contrastRatio,
  type WidgetTheme,
} from "@ag-ui/shared/client";
import {
  PANEL_ALLOW,
  PANEL_H,
  PANEL_SANDBOX,
  PANEL_W,
  StudioOrbPreview,
} from "@/components/experience/studio-orb-preview";
import { StudioControls } from "@/components/experience/studio-controls";

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

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
  const [edits, setEdits] = useState<Partial<WidgetTheme>>({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Base theme comes from the same company detail the preview renderer
  // reads, so controls and preview start from one identical theme.
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
        const t = detail.theme;
        const theme: WidgetTheme =
          t && typeof t.primary === "string"
            ? {
                primary: t.primary,
                secondary: t.secondary,
                radius: t.radius,
                surface: t.surface,
                text: t.text,
                logoUrl: t.logoUrl,
                fullSurface: t.fullSurface,
                bodySurface: t.bodySurface ?? t.fullSurface,
                accentOnSurface: t.accentOnSurface ?? t.fullSurface,
                surfaceSource: "tokens",
              }
            : {
                primary: "#2563eb",
                secondary: "#3b82f6",
                radius: "0.5rem",
                surface: "#09090b",
                text: "#fafafa",
                logoUrl: null,
                fullSurface: false,
                bodySurface: false,
                accentOnSurface: false,
                surfaceSource: "default",
              };
        setBaseTheme(theme);
        setEdits({});
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
    const merged: WidgetTheme = { ...baseTheme, ...edits };
    // Recompute the contrast gates on every edit, same thresholds as prod.
    const bodySurface = contrastRatio(merged.text, merged.surface) >= 4.5;
    const accentOnSurface = contrastRatio(merged.primary, merged.surface) >= 3;
    return {
      ...merged,
      bodySurface,
      accentOnSurface,
      fullSurface: bodySurface && accentOnSurface,
    };
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

  const handlePatch = useCallback((patch: Partial<WidgetTheme>) => {
    for (const [k, v] of Object.entries(patch)) {
      if (
        (k === "primary" || k === "secondary" || k === "surface" || k === "text") &&
        (typeof v !== "string" || !HEX_RE.test(v.trim()))
      ) {
        toast.error("Invalid color", { description: `${k} must be a hex value` });
        return;
      }
    }
    setEdits((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleReset = useCallback(() => setEdits({}), []);

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
            <div className="min-w-0 space-y-4 lg:col-span-5">
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
                  contrast={contrast}
                  canPublish={contrast != null && contrast >= 4.5}
                  onPatch={handlePatch}
                  onReset={handleReset}
                />
              )}
            </div>
            <div className="min-w-0 space-y-4 lg:col-span-7 lg:sticky lg:top-20 lg:self-start">
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
                  style={{
                    width: `min(${PANEL_W}px, 100vw - 32px)`,
                    height: `min(${PANEL_H}px, 100dvh - 140px)`,
                    border: "1px solid #27272a",
                    borderRadius: 16,
                    boxShadow: "0 24px 70px rgba(0,0,0,.5)",
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
