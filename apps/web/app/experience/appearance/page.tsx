"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowCounterClockwise,
  ArrowRight,
  Buildings,
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  Copy,
  XCircle,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import {
  apiClient,
  type BrandLatestResponse,
  type BrandStylesheet,
} from "@/lib/api-client";
import { useSelectedCompany } from "@/stores/use-company-store";
import { copyToClipboard } from "@/lib/copy";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";

type StatusKind = "empty" | "queued" | "extracting" | "ready" | "failed";

function normalizeStatus(s?: string | null): StatusKind {
  const v = (s || "").toUpperCase();
  if (v === "READY" || v === "DONE") return "ready";
  if (v === "FAILED" || v === "ERROR") return "failed";
  if (v === "QUEUED" || v === "PENDING") return "queued";
  if (
    v === "EXTRACTING" ||
    v === "EXTRACTING_APPEARANCE" ||
    v === "CRAWLING" ||
    v === "PARSING" ||
    v === "RUNNING" ||
    v === "IN_PROGRESS"
  )
    return "extracting";
  return "empty";
}

function statusLabel(kind: StatusKind, raw?: string | null): string {
  if (kind === "ready") return "Ready";
  if (kind === "failed") return "Failed";
  if (kind === "queued") return "Queued";
  if (kind === "extracting")
    return raw === "EXTRACTING_APPEARANCE"
      ? "Extracting stylesheet..."
      : "Extracting...";
  return "No stylesheet yet";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "READY")
    return (
      <Badge
        variant="outline"
        className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle className="mr-1 size-3" aria-hidden="true" />
        Ready
      </Badge>
    );
  if (status === "FAILED")
    return (
      <Badge
        variant="outline"
        className="rounded-full border-destructive/40 bg-destructive/10 font-normal text-destructive"
      >
        <XCircle className="mr-1 size-3" aria-hidden="true" />
        Failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="rounded-full font-normal">
      <CircleNotch className="mr-1 size-3 animate-spin" aria-hidden="true" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function timeAgo(iso?: string | null): string {
  if (!iso) return "unknown";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "unknown";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, fallback = "-"): string {
  return typeof v === "string" ? v : fallback;
}

function countOf(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function stringifyForCopy(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function ExportBlock({
  title,
  text,
  copyLabel,
}: {
  title: string;
  text: string;
  copyLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex flex-wrap items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            {open ? (
              <CaretDown className="size-3.5" aria-hidden="true" />
            ) : (
              <CaretRight className="size-3.5" aria-hidden="true" />
            )}
            {title}
          </Button>
        </CollapsibleTrigger>
        {text && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ms-auto h-7 px-2 text-xs font-normal"
            onClick={() =>
              void copyToClipboard(text, {
                successTitle: `${copyLabel} copied to clipboard`,
              })
            }
          >
            <Copy className="size-3.5" aria-hidden="true" />
            {copyLabel}
          </Button>
        )}
      </div>
      <CollapsibleContent>
        <pre className="mt-2 whitespace-pre-wrap break-all rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
          {text || "Not available for this stylesheet."}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function AppearancePage() {
  const router = useRouter();
  const selectedCompany = useSelectedCompany();

  const [latest, setLatest] = useState<BrandLatestResponse | null>(null);
  const [history, setHistory] = useState<BrandStylesheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const fetchLatest = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.brand.getLatest(id);
      setLatest(res);
      setSelectedSheetId((prev) => prev ?? res.stylesheet?.id ?? null);
      // History loads without blocking the main view
      apiClient.brand
        .getHistory(id)
        .then((h) => setHistory(h.items || []))
        .catch(() => setHistory([]));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load appearance"
      );
      setLatest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedCompany) {
      setLatest(null);
      setHistory([]);
      return;
    }
    setSelectedSheetId(null);
    void fetchLatest(selectedCompany.id);
  }, [selectedCompany, fetchLatest]);

  const activeSheet: BrandStylesheet | null = useMemo(() => {
    if (!latest?.stylesheet) return null;
    if (selectedSheetId && selectedSheetId !== latest.stylesheet.id) {
      const found = history.find((h) => h.id === selectedSheetId);
      if (found) return found;
    }
    return latest.stylesheet;
  }, [latest, history, selectedSheetId]);

  const statusKind = normalizeStatus(activeSheet?.status);

  const handleRetry = useCallback(async () => {
    if (!selectedCompany) return;
    setRetrying(true);
    try {
      await apiClient.brand.retry(selectedCompany.id);
      toast.success("Re-extraction queued", {
        description: "Refresh in a few seconds to see the new stylesheet.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Retry failed";
      toast.error("Retry failed", { description: message });
    } finally {
      setRetrying(false);
    }
  }, [selectedCompany]);

  // Token derivations, defensive because backend shapes may vary
  const tokens = asRecord(latest?.brand?.tokens);
  const raw = asRecord(activeSheet?.raw);
  const rawColors = asRecord(
    raw.colors ?? raw.palette ?? tokens.colors
  );
  const tokenColors = asRecord(tokens.colors);

  const swatches: { key: string; value: string }[] = useMemo(() => {
    const out: { key: string; value: string }[] = [];
    const push = (key: string, value: unknown) => {
      if (
        typeof value === "string" &&
        /^#([0-9a-f]{3,8})$/i.test(value.trim())
      ) {
        out.push({ key, value: value.trim() });
      }
    };
    for (const [k, v] of Object.entries(tokenColors)) push(k, v);
    const palette = (
      rawColors as Record<string, unknown>
    ).palette;
    if (Array.isArray(palette)) {
      palette.slice(0, 12).forEach((entry: unknown, i: number) => {
        if (typeof entry === "string") push(`palette-${i}`, entry);
        else if (entry && typeof entry === "object") {
          const r = asRecord(entry);
          const hex = r.hex ?? r.value ?? r.color;
          const conf = r.confidence;
          if (conf != null && typeof conf === "number" && conf < 0.5)
            return;
          const name = r.name;
          push(
            typeof name === "string" ? name : `palette-${i}`,
            hex
          );
        }
      });
    } else {
      for (const [k, v] of Object.entries(rawColors)) {
        if (k === "palette") continue;
        push(k, v);
      }
    }
    // De-dupe by hex, cap at 12
    const seen = new Set<string>();
    return out
      .filter((s) => {
        const k = s.value.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 12);
  }, [tokenColors, rawColors]);

  const typographyRows: {
    label: string;
    family: string;
    size: string;
    weight: string;
    uses?: string;
  }[] = useMemo(() => {
    const typo = asRecord(
      raw.typography ?? tokens.typography ?? asRecord(raw).fonts
    );
    // Native extractor shape: styles array with family, size, weight, context, count
    const stylesRaw = (typo as Record<string, unknown>).styles;
    const styles = Array.isArray(stylesRaw) ? stylesRaw : null;
    if (styles) {
      return styles.slice(0, 12).map((s: unknown, i: number) => {
        const r = asRecord(s);
        if (typeof s === "string")
          return { label: `style-${i + 1}`, family: s, size: "-", weight: "-" };
        return {
          label: str(
            r.context ?? r.role ?? r.usage ?? `style-${i + 1}`
          ),
          family: str(r.family ?? r.fontFamily ?? r.font),
          size: str(r.size ?? r.fontSize),
          weight: str(r.weight ?? r.fontWeight),
          uses:
            r.count != null && typeof r.count === "number"
              ? `${r.count}x`
              : undefined,
        };
      });
    }
    const entries = Object.entries(typo);
    if (entries.length === 0) return [];
    return entries.slice(0, 12).map(([label, v]) => {
      if (typeof v === "string")
        return { label, family: v, size: "-", weight: "-" };
      const r = asRecord(v);
      return {
        label,
        family: str(r.family ?? r.fontFamily ?? r.font),
        size: str(r.size ?? r.fontSize),
        weight: str(r.weight ?? r.fontWeight),
      };
    });
  }, [raw, tokens]);

  const radiusRows: {
    value: string;
    count: number;
    elements: string;
  }[] = useMemo(() => {
    const source = raw.borderRadius ?? raw.radius;
    const br = asRecord(source);
    const brVals = (br as Record<string, unknown>).values;
    const list: unknown[] = Array.isArray(brVals)
      ? (brVals as unknown[])
      : Array.isArray(source)
        ? (source as unknown[])
        : [];
    return list
      .map((e: unknown) => {
        if (typeof e === "string" || typeof e === "number")
          return { value: String(e), count: 0, elements: "-" };
        const r = asRecord(e);
        const els = r.elements;
        return {
          value: str(r.value ?? r.radius),
          count: countOf(r.count),
          elements: Array.isArray(els) ? els.join(", ") : "-",
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [raw]);

  const shadowRows: { shadow: string; count: number }[] = useMemo(() => {
    const listRaw = raw.shadows ?? raw.shadow;
    const list = Array.isArray(listRaw) ? listRaw : [];
    return (list as unknown[])
      .map((e: unknown) => {
        if (typeof e === "string") return { shadow: e, count: 0 };
        const r = asRecord(e);
        return {
          shadow: str(r.shadow ?? r.value),
          count: countOf(r.count),
        };
      })
      .filter((r) => r.shadow !== "-")
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [raw]);

  const spacingInfo: {
    scaleType: string;
    rows: { px: string; rem: string; count: number }[];
  } = useMemo(() => {
    const sp = asRecord(raw.spacing);
    const valsRaw = (sp as Record<string, unknown>).commonValues;
    const vals = Array.isArray(valsRaw) ? valsRaw : [];
    return {
      scaleType: str(sp.scaleType),
      rows: (vals as unknown[])
        .map((e: unknown) => {
          const r = asRecord(e);
          return {
            px: str(r.px ?? r.display ?? r.value),
            rem: str(r.rem),
            count: countOf(r.count),
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
    };
  }, [raw]);

  const linkVariants: {
    color: string;
    hover: string;
    weight: string;
    decoration: string;
  }[] = useMemo(() => {
    const comps = asRecord(raw.components);
    const list = comps.links;
    if (!Array.isArray(list)) return [];
    return (list as unknown[]).slice(0, 6).map((e: unknown) => {
      const r = asRecord(e);
      const states = asRecord(r.states);
      const def = asRecord(states.default);
      const hov = asRecord(states.hover);
      return {
        color: str(r.color ?? def.color),
        hover: str(hov.color),
        weight: str(r.fontWeight ?? r.weight),
        decoration: str(r.textDecoration ?? def.textDecoration),
      };
    });
  }, [raw]);

  const buttonVariants: {
    label: string;
    background: string;
    color: string;
    radius: string;
    border: string;
  }[] = useMemo(() => {
    const comps = asRecord(raw.components);
    const list = comps.buttons;
    if (!Array.isArray(list)) return [];
    return (list as unknown[]).slice(0, 6).map((e: unknown, i: number) => {
      if (typeof e === "string")
        return {
          label: `variant-${i + 1}`,
          background: e,
          color: "#ffffff",
          radius: "-",
          border: "-",
        };
      const r = asRecord(e);
      const states = asRecord(r.states);
      const def = asRecord(
        states.default ?? states.rest ?? states.base
      );
      return {
        label: str(r.variant ?? r.name ?? r.kind ?? `variant-${i + 1}`),
        background: str(
          r.backgroundColor ??
            r.background ??
            def.backgroundColor ??
            def.background ??
            "#3b82f6",
          "#3b82f6"
        ),
        color: str(r.color ?? def.color ?? "#ffffff", "#ffffff"),
        radius: str(r.borderRadius ?? r.radius ?? def.borderRadius),
        border: str(r.border ?? def.border),
      };
    });
  }, [raw]);

  const inputGroups: {
    type: string;
    rows: { border: string; radius: string; padding: string; focus: string }[];
  }[] = useMemo(() => {
    const comps = asRecord(raw.components);
    const inputs = asRecord(comps.inputs);
    return Object.entries(inputs)
      .slice(0, 4)
      .map(([type, v]) => {
        const list = Array.isArray(v) ? v.slice(0, 3) : [v];
        return {
          type,
          rows: (list as unknown[]).map((e: unknown) => {
            const r = asRecord(e);
            const states = asRecord(r.states);
            const def = asRecord(states.default);
            const foc = asRecord(states.focus);
            return {
              border: str(def.border ?? def.borderColor),
              radius: str(def.borderRadius),
              padding: str(def.padding),
              focus: str(foc.borderColor ?? foc.outline),
            };
          }),
        };
      })
      .filter((g) => g.rows.length > 0);
  }, [raw]);

  const badgeInfo: {
    total: number;
    variants: { name: string; count: number }[];
  } = useMemo(() => {
    const comps = asRecord(raw.components);
    const badges = asRecord(comps.badges);
    const all = badges.all;
    const byVariant = asRecord(badges.byVariant);
    const variants = Object.entries(byVariant).map(([name, v]) => ({
      name,
      count: Array.isArray(v) ? v.length : 0,
    }));
    return { total: Array.isArray(all) ? all.length : 0, variants };
  }, [raw]);

  const hasComponents =
    linkVariants.length > 0 ||
    buttonVariants.length > 0 ||
    inputGroups.length > 0 ||
    badgeInfo.total > 0 ||
    badgeInfo.variants.some((v) => v.count > 0);

  const wcagPairs: {
    fg: string;
    bg: string;
    ratio?: string;
    pass?: string;
    count?: string;
  }[] = useMemo(() => {
    const wcag = activeSheet?.wcag;
    const pairsRaw =
      Array.isArray(wcag) && wcag.length > 0
        ? wcag
        : asRecord(wcag).pairs;
    const arr = Array.isArray(pairsRaw) ? pairsRaw : [];
    return (arr as unknown[]).slice(0, 20).map((p: unknown) => {
      if (typeof p === "string") return { fg: p, bg: "-" };
      const r = asRecord(p);
      const passRaw = r.passAA ?? r.pass ?? r.aa ?? r.AA;
      return {
        fg: str(r.fg ?? r.foreground ?? r.text),
        bg: str(r.bg ?? r.background),
        ratio: r.ratio != null ? String(r.ratio) : undefined,
        pass: passRaw != null ? String(passRaw) : undefined,
        count: r.count != null ? String(r.count) : undefined,
      };
    });
  }, [activeSheet]);

  const tailwindText = stringifyForCopy(activeSheet?.tailwind);
  const dtcgText = stringifyForCopy(activeSheet?.dtcg);
  const designMdText = stringifyForCopy(activeSheet?.designMd);

  const showEmpty = !activeSheet && !latest?.brand;

  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Appearance" }]}>
      <div className="min-w-0">
        {/* PageHeader */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
              Appearance
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              Extracted stylesheet tokens for the selected assistant. Colors,
              type, shape, and component variants in one inspector.
            </p>
          </div>
          {selectedCompany && activeSheet && (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={activeSheet.status} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void fetchLatest(selectedCompany.id)}
                disabled={loading}
              >
                <ArrowCounterClockwise
                  className="size-3.5"
                  aria-hidden="true"
                />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => void handleRetry()}
                disabled={retrying}
              >
                {retrying ? (
                  <CircleNotch
                    className="size-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowCounterClockwise
                    className="size-3.5"
                    aria-hidden="true"
                  />
                )}
                {retrying ? "Queueing" : "Retry extraction"}
              </Button>
            </div>
          )}
        </div>

        {!selectedCompany ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Buildings aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No company selected</EmptyTitle>
              <EmptyDescription>
                Pick a company to inspect its extracted appearance.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => router.push("/knowledge/ingest")}>
                Index a company
                <ArrowRight className="size-4" data-icon="inline-end" />
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="mt-6 min-w-0 space-y-4">
            {loadError && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]"
              >
                <p className="font-medium">Could not load appearance</p>
                <p className="mt-1 text-muted-foreground">{loadError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs"
                  onClick={() => void fetchLatest(selectedCompany.id)}
                >
                  Retry
                </Button>
              </div>
            )}

            {loading ? (
              <Card className="min-w-0">
                <CardContent className="space-y-2 pt-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            ) : showEmpty ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Buildings aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No stylesheet yet</EmptyTitle>
                  <EmptyDescription>
                    Run an ingestion for this company, then extract its
                    appearance.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    onClick={() => void handleRetry()}
                    disabled={retrying}
                  >
                    {retrying ? (
                      <CircleNotch
                        className="size-4 animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    {retrying ? "Queueing" : "Extract appearance"}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <>
                <p className="text-[13px] text-muted-foreground">
                  {statusLabel(statusKind, activeSheet?.status)} - cut{" "}
                  {timeAgo(activeSheet?.createdAt)}
                  {history.length > 0 &&
                    ` - ${history.length} earlier ${history.length === 1 ? "version" : "versions"}`}
                </p>

                {/* History selector */}
                {history.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <label
                      htmlFor="appearance-history"
                      className="text-muted-foreground"
                    >
                      Version
                    </label>
                    <select
                      id="appearance-history"
                      value={selectedSheetId ?? activeSheet?.id ?? ""}
                      onChange={(e) =>
                        setSelectedSheetId(e.target.value || null)
                      }
                      className="h-8 rounded-md border border-border bg-background px-2 text-xs"
                    >
                      {latest?.stylesheet && (
                        <option value={latest.stylesheet.id}>
                          Latest - {latest.stylesheet.status} -{" "}
                          {timeAgo(latest.stylesheet.createdAt)}
                        </option>
                      )}
                      {history.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.status} - {timeAgo(h.createdAt)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid min-w-0 items-start gap-4 lg:grid-cols-12">
                  <div className="min-w-0 space-y-4 lg:col-span-12">
                {/* Brand mark */}
                {(latest?.brand?.logoUrl || activeSheet?.screenshotUrl) && (
                  <Card className="min-w-0">
                    <CardContent className="flex flex-wrap items-center gap-4 pt-5">
                      {latest?.brand?.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={latest.brand.logoUrl}
                          alt="Brand logo"
                          className="h-10 w-auto rounded border border-border bg-background"
                        />
                      )}
                      {activeSheet?.screenshotUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={activeSheet.screenshotUrl}
                          alt="Source site screenshot"
                          className="max-h-24 w-auto rounded-lg border border-border"
                        />
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Colors */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] font-semibold">
                      Colors ({swatches.length})
                    </CardTitle>
                    <CardDescription className="text-[13px]">
                      Extracted palette. Select a swatch to copy its hex.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {swatches.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">
                        No color tokens extracted yet.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {swatches.map((s) => (
                          <button
                            key={`${s.key}-${s.value}`}
                            type="button"
                            title={`${s.key}: ${s.value} (select to copy)`}
                            onClick={() =>
                              void copyToClipboard(s.value, {
                                successTitle: `${s.value} copied to clipboard`,
                                successDescription: s.key,
                              })
                            }
                            className="flex min-w-0 items-center gap-2 rounded-lg border border-border p-2 text-left hover:bg-muted/40"
                          >
                            <span
                              aria-hidden="true"
                              className="size-6 shrink-0 rounded-md border border-border"
                              style={{ backgroundColor: s.value }}
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[12px] font-medium">
                                {s.key}
                              </span>
                              <span className="block font-mono text-[11px] text-muted-foreground">
                                {s.value}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Typography */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] font-semibold">
                      Typography ({typographyRows.length})
                    </CardTitle>
                    <CardDescription className="text-[13px]">
                      Detected type styles with usage counts.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {typographyRows.length === 0 ? (
                      <p className="text-[13px] text-muted-foreground">
                        No typography tokens extracted yet.
                      </p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-xs">
                              Context
                            </TableHead>
                            <TableHead className="h-8 text-xs">
                              Family
                            </TableHead>
                            <TableHead className="h-8 text-xs">
                              Size
                            </TableHead>
                            <TableHead className="h-8 text-xs">
                              Weight
                            </TableHead>
                            <TableHead className="h-8 text-right text-xs">
                              Uses
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {typographyRows.map((r, i) => (
                            <TableRow key={`${r.label}-${i}`}>
                              <TableCell className="py-2 text-[13px] text-muted-foreground">
                                {r.label}
                              </TableCell>
                              <TableCell className="py-2 text-[13px]">
                                {r.family}
                              </TableCell>
                              <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                {r.size}
                              </TableCell>
                              <TableCell className="py-2 font-mono text-xs text-muted-foreground">
                                {r.weight}
                              </TableCell>
                              <TableCell className="py-2 text-right font-sans text-[13px] tabular-nums text-muted-foreground">
                                {r.uses ?? "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                {/* Shape */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] font-semibold">
                      Shape and elevation
                    </CardTitle>
                    <CardDescription className="text-[13px]">
                      Corner radius, shadows, and spacing scale.
                      {typeof tokens.radius === "string" &&
                        ` Mapped radius ${tokens.radius}.`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0 text-[13px]">
                    {radiusRows.length > 0 && (
                      <div className="min-w-0">
                        <p className="mb-1 text-xs text-muted-foreground">
                          Border radius
                        </p>
                        <div className="space-y-1">
                          {radiusRows.map((r) => (
                            <div
                              key={r.value}
                              className="flex min-w-0 items-center gap-2"
                            >
                              <span
                                aria-hidden="true"
                                className="inline-block size-4 shrink-0 border border-border bg-muted"
                                style={{ borderRadius: r.value }}
                              />
                              <span className="font-mono text-xs">
                                {r.value}
                              </span>
                              <span className="font-sans tabular-nums text-muted-foreground">
                                x{r.count}
                              </span>
                              <span className="truncate text-muted-foreground">
                                {r.elements}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {shadowRows.length > 0 && (
                      <div className="min-w-0">
                        <p className="mb-1 text-xs text-muted-foreground">
                          Shadows
                        </p>
                        <div className="space-y-1.5">
                          {shadowRows.map((s, i) => (
                            <div
                              key={i}
                              className="flex min-w-0 items-center gap-2"
                            >
                              <span
                                aria-hidden="true"
                                className="inline-block size-4 shrink-0 rounded-sm bg-muted"
                                style={{ boxShadow: s.shadow }}
                              />
                              <span className="truncate font-mono text-xs text-muted-foreground">
                                {s.shadow}
                              </span>
                              {s.count > 0 && (
                                <span className="ml-auto shrink-0 font-sans tabular-nums text-muted-foreground">
                                  x{s.count}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(spacingInfo.rows.length > 0 ||
                      spacingInfo.scaleType !== "-") && (
                      <div className="min-w-0">
                        <p className="mb-1 text-xs text-muted-foreground">
                          Spacing
                          <span className="font-sans tabular-nums">
                            {" "}
                            ({spacingInfo.scaleType} grid)
                          </span>
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                          {spacingInfo.rows.map((s) => (
                            <span
                              key={s.px}
                              title={`${s.px} (${s.rem}) used ${s.count}x`}
                              className="inline-flex items-center gap-1.5"
                            >
                              <Badge
                                variant="secondary"
                                className="rounded-md font-mono text-[11px] font-normal tabular-nums"
                              >
                                {s.px}
                              </Badge>
                              <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
                                x{s.count}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {radiusRows.length === 0 &&
                      shadowRows.length === 0 &&
                      spacingInfo.rows.length === 0 && (
                        <p className="text-muted-foreground">
                          No shape tokens extracted yet.
                        </p>
                      )}
                  </CardContent>
                </Card>

                {/* Components */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] font-semibold">
                      Components
                    </CardTitle>
                    <CardDescription className="text-[13px]">
                      Link, button, input, and badge variants found on the
                      source site.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0 text-[13px]">
                    {!hasComponents && (
                      <p className="text-muted-foreground">
                        No component variants detected.
                      </p>
                    )}
                    {linkVariants.length > 0 && (
                          <div className="min-w-0">
                            <p className="mb-1 text-xs text-muted-foreground">
                              Links ({linkVariants.length})
                            </p>
                            <div className="space-y-1">
                              {linkVariants.map((l, i) => (
                                <div
                                  key={`link-${i}`}
                                  title={`${l.color} - hover ${l.hover} - w${l.weight} - ${l.decoration}`}
                                  className="flex min-w-0 items-center gap-2"
                                >
                                  <span
                                    aria-hidden="true"
                                    className="inline-block size-3.5 shrink-0 rounded-sm border border-border"
                                    style={{
                                      backgroundColor:
                                        l.color !== "-"
                                          ? l.color
                                          : undefined,
                                    }}
                                  />
                                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                                    {l.color}{" "}
                                    <span className="text-muted-foreground">
                                      hover {l.hover} - w{l.weight} -{" "}
                                      {l.decoration}
                                    </span>
                                  </span>
                                </div>
                              ))}
                        </div>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="mb-1 text-xs text-muted-foreground">
                        Buttons ({buttonVariants.length})
                            {buttonVariants.length === 0 &&
                              " - none detected"}
                          </p>
                          {buttonVariants.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {buttonVariants.map((b, i) => (
                                <span
                                  key={`btn-${i}`}
                                  title={`${b.label} - ${b.background} - radius ${b.radius}`}
                                  className="px-3 py-1.5 text-[12px] font-medium"
                                  style={{
                                    backgroundColor: b.background,
                                    color: b.color,
                                    borderRadius:
                                      b.radius !== "-"
                                        ? b.radius
                                        : undefined,
                                    border:
                                      b.border !== "-" ? b.border : undefined,
                                  }}
                                >
                                  {b.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                    {(inputGroups.length > 0 ||
                      badgeInfo.total > 0 ||
                      badgeInfo.variants.some((v) => v.count > 0)) && (
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="min-w-0 space-y-3">
                          {inputGroups.length > 0 && (
                          <div className="min-w-0">
                            <p className="mb-1 text-xs text-muted-foreground">
                              Inputs
                            </p>
                            <div className="space-y-2">
                              {inputGroups.map((g) => (
                                <div
                                  key={`input-${g.type}`}
                                  className="min-w-0"
                                >
                                  <p className="text-muted-foreground">
                                    {g.type}
                                  </p>
                                  {g.rows.map((r, i) => (
                                    <p
                                      key={`input-${g.type}-${i}`}
                                      title={`border ${r.border} - radius ${r.radius} - pad ${r.padding} - focus ${r.focus}`}
                                      className="truncate font-mono text-xs text-muted-foreground"
                                    >
                                      border{" "}
                                      <span className="text-foreground">
                                        {r.border}
                                      </span>{" "}
                                      - radius {r.radius} - pad {r.padding} -
                                      focus {r.focus}
                                    </p>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-3">
                          {(badgeInfo.total > 0 ||
                            badgeInfo.variants.some((v) => v.count > 0)) && (
                            <div className="min-w-0">
                            <p className="mb-1 text-xs text-muted-foreground">
                              Badges ({badgeInfo.total})
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                              {badgeInfo.variants
                                .filter((v) => v.count > 0)
                                .map((v) => (
                                  <span
                                    key={`badge-${v.name}`}
                                    className="inline-flex items-center gap-1.5"
                                  >
                                    <Badge
                                      variant="secondary"
                                      className="rounded-md font-mono text-[11px] font-normal tabular-nums"
                                    >
                                      {v.name}
                                    </Badge>
                                    <span className="font-sans text-[11px] tabular-nums text-muted-foreground">
                                      x{v.count}
                                    </span>
                                  </span>
                                ))}
                            </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Theme exports */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[15px] font-semibold">
                      Theme exports
                    </CardTitle>
                    <CardDescription className="text-[13px]">
                      Reference output. Collapsed by default because it runs
                      long.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <ExportBlock
                      title="Tailwind"
                      text={tailwindText}
                      copyLabel="Copy Tailwind"
                    />
                    <ExportBlock
                      title="DTCG"
                      text={dtcgText}
                      copyLabel="Copy DTCG"
                    />
                    {designMdText && (
                      <ExportBlock
                        title="DESIGN.md"
                        text={designMdText}
                        copyLabel="Copy DESIGN.md"
                      />
                    )}
                  </CardContent>
                </Card>

                {/* WCAG */}
                {wcagPairs.length > 0 && (
                  <Card className="min-w-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[15px] font-semibold">
                        WCAG pairs ({wcagPairs.length})
                      </CardTitle>
                      <CardDescription className="text-[13px]">
                        Foreground and background pairs with contrast ratios.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 text-xs">
                              Preview
                            </TableHead>
                            <TableHead className="h-8 text-xs">FG</TableHead>
                            <TableHead className="h-8 text-xs">BG</TableHead>
                            <TableHead className="h-8 text-xs">
                              Ratio
                            </TableHead>
                            <TableHead className="h-8 text-xs">
                              Pass
                            </TableHead>
                            <TableHead className="h-8 text-right text-xs">
                              Uses
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {wcagPairs.map((p, i) => (
                            <TableRow key={i}>
                              <TableCell className="py-2">
                                <span
                                  className="inline-block rounded border border-border px-2 py-0.5 text-[11px]"
                                  style={{
                                    color:
                                      p.fg !== "-" ? p.fg : undefined,
                                    backgroundColor:
                                      p.bg !== "-" ? p.bg : undefined,
                                  }}
                                >
                                  Aa
                                </span>
                              </TableCell>
                              <TableCell className="py-2 font-mono text-xs">
                                {p.fg}
                              </TableCell>
                              <TableCell className="py-2 font-mono text-xs">
                                {p.bg}
                              </TableCell>
                              <TableCell className="py-2 font-sans text-[13px] tabular-nums text-muted-foreground">
                                {p.ratio ?? "-"}
                              </TableCell>
                              <TableCell className="py-2">
                                {p.pass == null ? (
                                  <span className="text-[13px] text-muted-foreground">
                                    -
                                  </span>
                                ) : p.pass === "true" ? (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
                                  >
                                    PASS
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="rounded-full border-destructive/40 bg-destructive/10 font-normal text-destructive"
                                  >
                                    FAIL
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-right font-sans text-[13px] tabular-nums text-muted-foreground">
                                {p.count ?? "-"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
