"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Stack,
  Globe,
  TrayArrowDown,
  CheckCircle,
  XCircle,
  CircleNotch,
  CaretDown,
  CaretRight,
  ArrowCounterClockwise,
  Buildings,
  ArrowRight,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { apiClient, type MajorVersion } from "@/lib/api-client";
import { useSelectedCompany } from "@/stores/use-company-store";

function statusPill(status: string) {
  const base =
    "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border";
  switch (status) {
    case "READY":
      return (
        <span className={`${base} border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300`}>
          <CheckCircle className="size-3" /> READY
        </span>
      );
    case "FAILED":
      return (
        <span className={`${base} border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400`}>
          <XCircle className="size-3" /> FAILED
        </span>
      );
    case "PROCESSING":
    case "CRAWLING":
      return (
        <span className={`${base} border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300`}>
          <CircleNotch className="size-3 animate-spin" /> {status}
        </span>
      );
    default:
      return (
        <span className={`${base} border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400`}>
          {status}
        </span>
      );
  }
}

function majorBrief(v: MajorVersion): string {
  const counts = v.summary?.counts;
  if (v.summary?.initial) return `${counts?.total ?? v.pageCount} pages indexed`;
  if (!v.summary || !counts) return "Details unavailable for this version";
  const parts = [`+${counts.added} pages`, `−${counts.removed}`, `~${counts.changed} changed`];
  return parts.join(" · ");
}

export default function SnapshotsPage() {
  const router = useRouter();
  const selectedCompany = useSelectedCompany();
  const [versions, setVersions] = useState<MajorVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirmRollback, setConfirmRollback] = useState<string | null>(null);
  const [rollingBack, setRollingBack] = useState(false);

  const refresh = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.companies.getVersions(selectedCompany.id);
      setVersions(res.versions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRollback = useCallback(
    async (key: string, major: number, minor: number) => {
      if (!selectedCompany) return;
      if (confirmRollback !== key) {
        setConfirmRollback(key);
        return;
      }
      setConfirmRollback(null);
      setRollingBack(true);
      try {
        await apiClient.uploads.rollback(selectedCompany.id, major, minor);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Rollback failed");
      } finally {
        setRollingBack(false);
      }
    },
    [confirmRollback, selectedCompany, refresh]
  );

  const rollbackButton = (key: string, label: string, major: number, minor: number) => (
    <button
      type="button"
      disabled={rollingBack}
      onClick={() => void handleRollback(key, major, minor)}
      title={
        confirmRollback === key
          ? `Click again to roll back to ${label}`
          : `Roll back to ${label} (compensating batch)`
      }
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border transition-colors disabled:opacity-50 ${
        confirmRollback === key
          ? "border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
      }`}
    >
      <ArrowCounterClockwise className="size-3" />
      {confirmRollback === key ? "Confirm" : label}
    </button>
  );

  const urlList = (label: string, entries?: { url: string; title: string }[]) => {
    if (!entries || entries.length === 0) return null;
    return (
      <div className="mt-1.5">
        <p className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">{label}</p>
        <ul className="mt-1 space-y-0.5">
          {entries.map((e) => (
            <li key={e.url} className="text-xs text-zinc-600 dark:text-zinc-300 truncate" title={e.url}>
              {e.title || e.url}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Snapshots" }]}>
      <div className="flex-1 p-4 sm:p-6 space-y-5 max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-9 rounded-xl border border-sidebar-border bg-sidebar-accent shrink-0">
            <Stack className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Snapshots</h1>
            <p className="text-xs text-muted-foreground">
              {selectedCompany
                ? `Version history for ${selectedCompany.name} — crawls are majors, uploads are minors.`
                : "Pick a company to inspect its version history."}
            </p>
          </div>
        </div>

        {!selectedCompany ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Buildings className="size-8 text-zinc-400" />
            <p className="text-sm text-zinc-500">No company selected yet.</p>
            <button
              type="button"
              onClick={() => router.push("/knowledge/ingest")}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white dark:bg-zinc-100 dark:hover:bg-white text-zinc-950 text-sm font-medium transition-colors"
            >
              Index a company <ArrowRight className="size-4" />
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                <XCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-zinc-500">
                <CircleNotch className="size-4 animate-spin" /> Loading versions…
              </div>
            ) : versions.length === 0 ? (
              <p className="text-xs text-zinc-500 py-6 text-center">
                No snapshots yet — crawl first in Knowledge → Ingest.
              </p>
            ) : (
              <ol className="relative space-y-3 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-zinc-200 dark:before:bg-zinc-800">
                {versions.map((v) => {
                  const isOpen = expanded.has(v.id);
                  const readyMinors = v.batches.filter((b) => b.status === "READY");
                  return (
                    <li key={v.id} className="relative pl-10">
                      <span className="absolute left-2 top-4 size-2 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="inline-flex items-center gap-1.5 text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            <Globe className="size-4 text-zinc-400" />
                            v{v.version}
                            {readyMinors.length > 0 &&
                              `.${Math.max(...readyMinors.map((b) => b.minor))}`}
                          </span>
                          {statusPill(v.status)}
                          <span className="text-[11px] font-mono text-zinc-500">
                            {new Date(v.createdAt).toLocaleString()}
                          </span>
                          {rollbackButton(`major-${v.id}`, `Restore v${v.version}.0`, v.version, 0)}
                        </div>
                        <p className="text-xs text-zinc-600 dark:text-zinc-300">{majorBrief(v)}</p>

                        {v.batches.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {v.batches.map((b) => (
                              <div
                                key={b.id}
                                className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"
                              >
                                <TrayArrowDown className="size-3.5 text-zinc-400 shrink-0" />
                                <span className="font-mono">
                                  v{v.version}.{b.minor}
                                </span>
                                {statusPill(b.status)}
                                <span className="font-mono text-[11px] text-zinc-500 truncate">
                                  {b.status === "READY" && b.summary?.added
                                    ? `+${b.summary.added.length} files: ${b.summary.added.slice(0, 3).join(", ")}${
                                        b.summary.added.length > 3 ? ` +${b.summary.added.length - 3} more` : ""
                                      }`
                                    : `${b.fileCount} files`}
                                </span>
                                {b.status === "READY" &&
                                  rollbackButton(
                                    `minor-${b.id}`,
                                    `Restore v${v.version}.${b.minor}`,
                                    v.version,
                                    b.minor
                                  )}
                              </div>
                            ))}
                          </div>
                        )}

                        {(v.summary?.added?.length || v.summary?.removed?.length || v.summary?.changed?.length) ? (
                          <button
                            type="button"
                            onClick={() => toggle(v.id)}
                            className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 pt-1"
                          >
                            {isOpen ? <CaretDown className="size-3.5" /> : <CaretRight className="size-3.5" />}
                            {isOpen ? "Hide details" : "Show details"}
                          </button>
                        ) : null}
                        {isOpen && (
                          <div className="pt-1">
                            {urlList("Added", v.summary?.added)}
                            {urlList("Removed", v.summary?.removed)}
                            {urlList("Changed", v.summary?.changed)}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )}
      </div>
    </StudioShell>
  );
}
