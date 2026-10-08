"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StudioShell } from "@/components/studio-shell";
import { apiClient, type BrandLatestResponse, type BrandStylesheet } from "@/lib/api-client";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

type StatusKind = "empty" | "queued" | "extracting" | "ready" | "failed";

function normalizeStatus(s?: string | null): StatusKind {
  const v = (s || "").toUpperCase();
  if (v === "READY" || v === "DONE") return "ready";
  if (v === "FAILED" || v === "ERROR") return "failed";
  if (v === "QUEUED" || v === "PENDING") return "queued";
  if (v === "EXTRACTING" || v === "EXTRACTING_APPEARANCE" || v === "CRAWLING" || v === "PARSING" || v === "RUNNING" || v === "IN_PROGRESS")
    return "extracting";
  return "empty";
}

function statusLabel(kind: StatusKind, raw?: string | null): string {
  if (kind === "ready") return "Ready";
  if (kind === "failed") return "Failed";
  if (kind === "queued") return "Queued";
  if (kind === "extracting") return raw === "EXTRACTING_APPEARANCE" ? "Extracting stylesheet…" : "Extracting…";
  return "No stylesheet yet";
}

function statusClasses(kind: StatusKind): string {
  if (kind === "ready") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (kind === "failed") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (kind === "queued") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  if (kind === "extracting") return "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-300 animate-pulse";
  return "border-zinc-800 bg-zinc-900/60 text-zinc-400";
}

function asRecord(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as Record<string, any>) : {};
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

function CopyButton({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable — no-op
        }
      }}
      className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-[11px] font-mono text-zinc-300 transition-colors"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export default function AppearancePage() {
  const searchParams = useSearchParams();
  const companyParam = searchParams.get("company");
  const selectedCompany = useSelectedCompany();
  const companies = useCompanyStore((s) => s.companies);

  const companyId = useMemo(() => {
    if (companyParam) return companyParam;
    return selectedCompany?.id ?? null;
  }, [companyParam, selectedCompany?.id]);

  const companyName = useMemo(() => {
    if (!companyId) return null;
    const found =
      companies.find((c) => c.id === companyId) ??
      (selectedCompany?.id === companyId ? selectedCompany : null);
    return found?.name ?? null;
  }, [companies, selectedCompany, companyId]);

  const [latest, setLatest] = useState<BrandLatestResponse | null>(null);
  const [history, setHistory] = useState<BrandStylesheet[]>([]);
  const [selectedSheetId, setSelectedSheetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);

  const fetchLatest = useCallback(async (id: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiClient.brand.getLatest(id);
      setLatest(res);
      setSelectedSheetId((prev) => prev ?? res.stylesheet?.id ?? null);
      // Fire-and-forget history (non-blocking for main view)
      apiClient.brand
        .getHistory(id)
        .then((h) => setHistory(h.items || []))
        .catch(() => setHistory([]));
    } catch (err: any) {
      setLoadError(err?.message || "Failed to load appearance");
      setLatest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!companyId) {
      setLatest(null);
      setHistory([]);
      return;
    }
    setSelectedSheetId(null);
    fetchLatest(companyId);
  }, [companyId, fetchLatest]);

  const activeSheet: BrandStylesheet | null = useMemo(() => {
    if (!latest?.stylesheet) return null;
    if (selectedSheetId && selectedSheetId !== latest.stylesheet.id) {
      const found = history.find((h) => h.id === selectedSheetId);
      if (found) return found;
    }
    return latest.stylesheet;
  }, [latest, history, selectedSheetId]);

  const statusKind = normalizeStatus(activeSheet?.status);

  const handleRetry = async () => {
    if (!companyId) return;
    setRetrying(true);
    setRetryMsg(null);
    try {
      await apiClient.brand.retry(companyId);
      setRetryMsg("Re-extraction queued. Refresh in a few seconds.");
    } catch (err: any) {
      setRetryMsg(err?.message || "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  // ---- Token derivations (defensive: backend shapes may vary) ----
  const tokens = asRecord(latest?.brand?.tokens);
  const raw = asRecord(activeSheet?.raw);
  const rawColors = asRecord(raw.colors ?? raw.palette ?? tokens.colors);
  const tokenColors = asRecord(tokens.colors);

  const swatches: { key: string; value: string }[] = useMemo(() => {
    const out: { key: string; value: string }[] = [];
    const push = (key: string, value: unknown) => {
      if (typeof value === "string" && /^#([0-9a-f]{3,8})$/i.test(value.trim())) {
        out.push({ key, value: value.trim() });
      }
    };
    for (const [k, v] of Object.entries(tokenColors)) push(k, v);
    const palette = (rawColors as any)?.palette;
    if (Array.isArray(palette)) {
      palette.slice(0, 12).forEach((entry: any, i: number) => {
        if (typeof entry === "string") push(`palette-${i}`, entry);
        else if (entry && typeof entry === "object") {
          const hex = entry.hex ?? entry.value ?? entry.color;
          const conf = entry.confidence;
          if (conf != null && typeof conf === "number" && conf < 0.5) return;
          push(entry.name ?? `palette-${i}`, hex);
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

  const typographyRows: { label: string; family: string; size: string; weight: string }[] = useMemo(() => {
    const typo = asRecord(raw.typography ?? tokens.typography ?? (raw as any)?.fonts);
    const entries = Object.entries(typo);
    if (entries.length === 0) return [];
    return entries.slice(0, 12).map(([label, v]) => {
      if (typeof v === "string") return { label, family: v, size: "—", weight: "—" };
      const r = asRecord(v);
      return {
        label,
        family: String(r.family ?? r.fontFamily ?? r.font ?? "—"),
        size: String(r.size ?? r.fontSize ?? "—"),
        weight: String(r.weight ?? r.fontWeight ?? "—"),
      };
    });
  }, [raw, tokens]);

  const radiusVal = tokens.radius ?? raw.radius ?? (raw as any)?.borderRadius ?? "—";
  const shadowVal = (tokens as any).shadow ?? raw.shadow ?? raw.shadows ?? (raw as any)?.boxShadow ?? "—";
  const spacingVal = (tokens as any).spacing ?? raw.spacing ?? "—";
  const componentCounts = asRecord(raw.components ?? raw.componentCounts ?? (tokens as any)?.components);

  const wcagPairs: { fg: string; bg: string; ratio?: string; pass?: string }[] = useMemo(() => {
    const wcag = activeSheet?.wcag;
    const arr = Array.isArray(wcag) ? wcag : Array.isArray((wcag as any)?.pairs) ? (wcag as any).pairs : [];
    return arr.slice(0, 20).map((p: any) => {
      if (typeof p === "string") return { fg: p, bg: "—" };
      const r = asRecord(p);
      return {
        fg: String(r.fg ?? r.foreground ?? r.text ?? "—"),
        bg: String(r.bg ?? r.background ?? "—"),
        ratio: r.ratio != null ? String(r.ratio) : undefined,
        pass: r.pass != null ? String(r.pass) : r.AA != null ? String(r.AA) : undefined,
      };
    });
  }, [activeSheet]);

  const tailwindText = stringifyForCopy(activeSheet?.tailwind);
  const dtcgText = stringifyForCopy(activeSheet?.dtcg);

  return (
    <StudioShell crumbs={[{ label: "Experience" }, { label: "Appearance" }]}>
      <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-zinc-100">Appearance</h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono">
            {companyName ? (
              <>
                Stylesheet tokens for <span className="text-zinc-200">{companyName}</span>
                <span className="text-zinc-600"> ({companyId})</span>
              </>
            ) : (
              "Extracted stylesheet tokens, Tailwind theme and WCAG pairs per company."
            )}
          </p>
        </div>

        {!companyId ? (
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center space-y-2">
            <div className="text-sm font-semibold text-zinc-200">No company selected</div>
            <p className="text-xs text-zinc-500 font-mono">
              Pick a company in the sidebar or open{" "}
              <span className="text-zinc-300">/experience/appearance?company=&lt;id&gt;</span>.
            </p>
          </div>
        ) : loading ? (
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center text-xs text-zinc-500 font-mono animate-pulse">
            Loading appearance…
          </div>
        ) : loadError ? (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-300 font-mono">
            {loadError}
            <button
              type="button"
              onClick={() => fetchLatest(companyId)}
              className="ml-3 underline hover:text-red-200"
            >
              Retry
            </button>
          </div>
        ) : !activeSheet && !latest?.brand ? (
          <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/40 text-center space-y-3">
            <div className="text-sm font-semibold text-zinc-200">No stylesheet yet</div>
            <p className="text-xs text-zinc-500 font-mono">
              Run an ingestion for this company, then extract its appearance.
            </p>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="px-3 py-1.5 rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 hover:bg-fuchsia-500/20 text-fuchsia-200 text-xs font-mono transition-colors disabled:opacity-50"
            >
              {retrying ? "Queueing…" : "Extract appearance"}
            </button>
            {retryMsg && <div className="text-[11px] font-mono text-zinc-400">{retryMsg}</div>}
          </div>
        ) : (
          <>
            {/* Status banner */}
            <div className={`p-3.5 rounded-xl border text-xs font-mono flex flex-wrap items-center justify-between gap-3 ${statusClasses(statusKind)}`}>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{statusLabel(statusKind, activeSheet?.status)}</span>
                {activeSheet?.id && <span className="opacity-70">· {activeSheet.id.slice(0, 8)}</span>}
                {activeSheet?.error && statusKind === "failed" && (
                  <span className="opacity-90">· {activeSheet.error}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {retryMsg && <span className="opacity-80">{retryMsg}</span>}
                {(statusKind === "failed" || statusKind === "ready" || statusKind === "queued") && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={retrying}
                    className="px-2.5 py-1 rounded-md border border-current hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    {retrying ? "Queueing…" : "Retry extraction"}
                  </button>
                )}
              </div>
            </div>

            {/* History selector */}
            {history.length > 0 && (
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
                <label htmlFor="appearance-history">Version:</label>
                <select
                  id="appearance-history"
                  value={selectedSheetId ?? activeSheet?.id ?? ""}
                  onChange={(e) => setSelectedSheetId(e.target.value || null)}
                  className="h-8 px-2 rounded-md border border-zinc-800 bg-zinc-900 text-zinc-200 text-xs font-mono"
                >
                  {latest?.stylesheet && (
                    <option value={latest.stylesheet.id}>
                      latest · {latest.stylesheet.status} · {latest.stylesheet.createdAt}
                    </option>
                  )}
                  {history.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.id.slice(0, 8)} · {h.status} · {h.createdAt}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => companyId && fetchLatest(companyId)}
                  className="underline hover:text-zinc-200"
                >
                  Refresh
                </button>
              </div>
            )}

            {latest?.brand?.logoUrl && (
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={latest.brand.logoUrl} alt="Brand logo" className="h-10 w-auto rounded" />
                <span className="text-[11px] font-mono text-zinc-500 break-all">{latest.brand.logoUrl}</span>
              </div>
            )}

            {/* Colors */}
            <section className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">Colors</h2>
              {swatches.length === 0 ? (
                <p className="text-xs text-zinc-500 font-mono">No color tokens extracted yet.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {swatches.map((s) => (
                    <div key={`${s.key}-${s.value}`} className="flex items-center gap-2 p-2 rounded-lg border border-zinc-800/80 bg-zinc-950/60">
                      <span
                        className="size-6 rounded-md border border-zinc-700 shrink-0"
                        style={{ backgroundColor: s.value }}
                        title={`${s.key}: ${s.value}`}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-zinc-200 truncate">{s.key}</div>
                        <div className="text-[10px] font-mono text-zinc-500">{s.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Typography */}
            <section className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">Typography</h2>
              {typographyRows.length === 0 ? (
                <p className="text-xs text-zinc-500 font-mono">No typography tokens extracted yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-left text-zinc-500 border-b border-zinc-800">
                        <th className="py-1.5 pr-3 font-medium">Token</th>
                        <th className="py-1.5 pr-3 font-medium">Family</th>
                        <th className="py-1.5 pr-3 font-medium">Size</th>
                        <th className="py-1.5 font-medium">Weight</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {typographyRows.map((r) => (
                        <tr key={r.label} className="text-zinc-300">
                          <td className="py-1.5 pr-3 text-zinc-400">{r.label}</td>
                          <td className="py-1.5 pr-3">{r.family}</td>
                          <td className="py-1.5 pr-3">{r.size}</td>
                          <td className="py-1.5">{r.weight}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Radius / shadow / spacing + components */}
            <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2 text-xs font-mono">
                <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Shape &amp; Elevation</h2>
                <div className="text-zinc-400">
                  radius: <span className="text-zinc-200">{typeof radiusVal === "string" ? radiusVal : JSON.stringify(radiusVal)}</span>
                </div>
                <div className="text-zinc-400">
                  shadow: <span className="text-zinc-200">{typeof shadowVal === "string" ? shadowVal : JSON.stringify(shadowVal)}</span>
                </div>
                <div className="text-zinc-400">
                  spacing: <span className="text-zinc-200">{typeof spacingVal === "string" ? spacingVal : JSON.stringify(spacingVal)}</span>
                </div>
              </div>
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2 text-xs font-mono">
                <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Components</h2>
                {Object.keys(componentCounts).length === 0 ? (
                  <p className="text-zinc-500">No component counts yet.</p>
                ) : (
                  Object.entries(componentCounts).slice(0, 12).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-zinc-400">
                      <span>{k}</span>
                      <span className="text-zinc-200">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Tailwind / DTCG */}
            <section className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">Theme exports</h2>
                <div className="flex items-center gap-2">
                  <CopyButton label="Copy Tailwind" value={tailwindText} />
                  <CopyButton label="Copy DTCG" value={dtcgText} />
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] font-mono text-zinc-500 mb-1">tailwind</div>
                  <pre className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 text-[11px] font-mono text-zinc-300 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                    {tailwindText || "—"}
                  </pre>
                </div>
                <div>
                  <div className="text-[11px] font-mono text-zinc-500 mb-1">DTCG</div>
                  <pre className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 text-[11px] font-mono text-zinc-300 max-h-64 overflow-auto whitespace-pre-wrap break-all">
                    {dtcgText || "—"}
                  </pre>
                </div>
              </div>
            </section>

            {/* WCAG */}
            {wcagPairs.length > 0 && (
              <section className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-3">
                <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">WCAG pairs</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="text-left text-zinc-500 border-b border-zinc-800">
                        <th className="py-1.5 pr-3 font-medium">Preview</th>
                        <th className="py-1.5 pr-3 font-medium">FG</th>
                        <th className="py-1.5 pr-3 font-medium">BG</th>
                        <th className="py-1.5 pr-3 font-medium">Ratio</th>
                        <th className="py-1.5 font-medium">Pass</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900">
                      {wcagPairs.map((p, i) => (
                        <tr key={i} className="text-zinc-300">
                          <td className="py-1.5 pr-3">
                            <span
                              className="inline-block px-2 py-0.5 rounded border border-zinc-700 text-[10px]"
                              style={{ color: p.fg !== "—" ? p.fg : undefined, backgroundColor: p.bg !== "—" ? p.bg : undefined }}
                            >
                              Aa
                            </span>
                          </td>
                          <td className="py-1.5 pr-3">{p.fg}</td>
                          <td className="py-1.5 pr-3">{p.bg}</td>
                          <td className="py-1.5 pr-3">{p.ratio ?? "—"}</td>
                          <td className="py-1.5">{p.pass ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeSheet?.screenshot_url && (
              <section className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
                <h2 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">Screenshot</h2>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeSheet.screenshot_url} alt="Stylesheet screenshot" className="rounded-lg border border-zinc-800 max-h-96 w-auto" />
              </section>
            )}
          </>
        )}
      </div>
    </StudioShell>
  );
}
