"use client";

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
  mapBrandToWidgetTheme,
  type WidgetTheme,
} from "@ag-ui/shared/client";
import { useWidgetKeys } from "@/components/integration/use-widget-keys";
import { defaultApiBase } from "@/components/integration/snippet-builder";
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
 * Live widget preview. Mounts the production embed route in an iframe (same
 * bundle, parity by definition) and pushes theme edits over a message
 * channel — the frame never reloads while dragging controls. Answer-only
 * flags ride on the URL; nothing here writes to the brand.
 */
export default function WidgetStudioPage() {
  const selectedCompany = useSelectedCompany();
  const companyId = selectedCompany?.id ?? null;
  const { phase } = useWidgetKeys(companyId);
  const [apiBase] = useState<string>(() => defaultApiBase());
  const [manualKey, setManualKey] = useState("");
  const [manualKeyApplied, setManualKeyApplied] = useState<string | null>(null);
  const [baseTheme, setBaseTheme] = useState<WidgetTheme | null>(null);
  const [baseLoading, setBaseLoading] = useState(false);
  const [edits, setEdits] = useState<Partial<WidgetTheme>>({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const issuedRaw = phase.kind === "ready" ? phase.raw : null;
  const raw = issuedRaw ?? manualKeyApplied;

  // Base theme comes from the same config the production widget reads, so
  // the preview starts pixel-identical before any edit.
  useEffect(() => {
    if (!raw) {
      setBaseTheme(null);
      return;
    }
    let cancelled = false;
    setBaseLoading(true);
    apiClient.embed
      .getConfig(raw, apiBase)
      .then((cfg) => {
        if (cancelled) return;
        const theme: WidgetTheme =
          cfg.theme && typeof cfg.theme.primary === "string"
            ? {
                primary: cfg.theme.primary,
                secondary: cfg.theme.secondary,
                radius: cfg.theme.radius,
                surface: cfg.theme.surface,
                text: cfg.theme.text,
                logoUrl: cfg.theme.logoUrl,
                fullSurface: cfg.theme.fullSurface,
                bodySurface: cfg.theme.bodySurface ?? cfg.theme.fullSurface,
                accentOnSurface:
                  cfg.theme.accentOnSurface ?? cfg.theme.fullSurface,
                surfaceSource: "tokens",
              }
            : mapBrandToWidgetTheme(cfg.brand?.tokens, cfg.brand?.logoUrl);
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
  }, [raw, apiBase]);

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

  // Initial paint params come from the loaded base only — draft edits travel
  // over the channel, so the URL stays stable and the frame never reloads.
  const frameSrc = useMemo(() => {
    if (!raw) return null;
    const q = new URLSearchParams({
      api: apiBase,
      preview: "1",
      noCitations: "1",
      title: selectedCompany?.name ?? "Assistant",
    });
    if (baseTheme) {
      q.set("color", baseTheme.primary);
      q.set("surface", baseTheme.surface);
      q.set("text", baseTheme.text);
    }
    return `/embed/${encodeURIComponent(raw)}?${q.toString()}`;
  }, [raw, apiBase, selectedCompany?.name, baseTheme]);

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

        {!selectedCompany ? (
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
        ) : !raw ? (
          <Card className="mt-6 min-w-0">
            <CardContent className="space-y-3 pt-5">
              <p className="text-[13px] text-muted-foreground max-w-[65ch]">
                {phase.kind === "issuing"
                  ? "Issuing a preview key…"
                  : "No fresh preview key — raws are shown once and never stored. Paste one from Integration → Embed Snippet, or rotate there for a fresh snippet."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder="agw_…"
                  spellCheck={false}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 font-mono text-xs"
                  aria-label="Widget key for preview"
                />
                <Button
                  size="sm"
                  disabled={!manualKey.trim()}
                  onClick={() => setManualKeyApplied(manualKey.trim())}
                >
                  Load preview
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link href="/integration/embed-snippet">Open Embed Snippet</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
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
                  key={raw}
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
