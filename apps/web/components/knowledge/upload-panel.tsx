"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadSimple,
  TrayArrowDown,
  CheckCircle,
  XCircle,
  CircleNotch,
  X,
  FileText,
} from "@phosphor-icons/react";
import { apiClient, type UploadDraft, type EnrichmentBatch } from "@/lib/api-client";

const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTS = ["pdf", "docx", "xlsx", "csv", "md", "mdx", "txt", "html", "htm", "json", "xml"];

function extOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

interface UploadPanelProps {
  companyId: string;
  majorVersion: number;
  snapshotReady: boolean;
  onChanged: () => void;
}

type Phase =
  | { name: "idle" }
  | { name: "uploading" }
  | { name: "preview"; draft: UploadDraft }
  | { name: "polling"; batchId: string }
  | { name: "done"; batch: EnrichmentBatch }
  | { name: "error"; message: string };

/**
 * Dropzone -> DRAFT preview -> confirm -> poll worker -> READY.
 * One upload request = one batch = one minor version bump.
 */
export function UploadPanel({ companyId, majorVersion, snapshotReady, onChanged }: UploadPanelProps) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const startPolling = useCallback(
    (batchId: string) => {
      stopPolling();
      setPhase({ name: "polling", batchId });
      pollRef.current = setInterval(async () => {
        try {
          const batches = await apiClient.uploads.list(companyId);
          const batch = batches.find((b) => b.id === batchId);
          if (!batch) return;
          if (batch.status === "READY") {
            stopPolling();
            setPhase({ name: "done", batch });
            onChanged();
          } else if (batch.status === "FAILED" || batch.status === "CANCELLED") {
            stopPolling();
            setPhase({
              name: "error",
              message:
                (batch.errorSample as { message?: string } | null)?.message ||
                `Batch ${batch.status.toLowerCase()}`,
            });
            onChanged();
          }
        } catch {
          // Transient poll failure: keep polling.
        }
      }, 3000);
    },
    [companyId, onChanged, stopPolling]
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (!snapshotReady) return;
      if (files.length === 0 || files.length > MAX_FILES) {
        setPhase({ name: "error", message: `Select between 1 and ${MAX_FILES} files per batch.` });
        return;
      }
      const total = files.reduce((n, f) => n + f.size, 0);
      if (total > MAX_BATCH_BYTES) {
        setPhase({ name: "error", message: "Batch exceeds the 100MB total limit." });
        return;
      }
      for (const f of files) {
        if (f.size === 0 || f.size > MAX_FILE_BYTES) {
          setPhase({ name: "error", message: `"${f.name}" must be between 1 byte and 25MB.` });
          return;
        }
        if (!ALLOWED_EXTS.includes(extOf(f.name))) {
          setPhase({
            name: "error",
            message: `"${f.name}" has an unsupported type. Use pdf, docx, xlsx, csv, md, txt, html, json, or sitemap xml.`,
          });
          return;
        }
      }
      setPhase({ name: "uploading" });
      try {
        const draft = await apiClient.uploads.create(companyId, files);
        setPhase({ name: "preview", draft });
      } catch (err) {
        setPhase({ name: "error", message: err instanceof Error ? err.message : "Upload failed" });
      }
    },
    [companyId, snapshotReady]
  );

  const handleConfirm = useCallback(async () => {
    if (phase.name !== "preview") return;
    const batchId = phase.draft.batchId;
    try {
      await apiClient.uploads.confirm(companyId, batchId);
      onChanged();
      startPolling(batchId);
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Confirm failed" });
    }
  }, [phase, companyId, onChanged, startPolling]);

  const handleCancel = useCallback(async () => {
    if (phase.name !== "preview") return;
    try {
      await apiClient.uploads.cancel(companyId, phase.draft.batchId);
      setPhase({ name: "idle" });
      onChanged();
    } catch (err) {
      setPhase({ name: "error", message: err instanceof Error ? err.message : "Cancel failed" });
    }
  }, [phase, companyId, onChanged]);

  const reset = useCallback(() => {
    stopPolling();
    setPhase({ name: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }, [stopPolling]);

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Enrich with files
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            One upload = one batch = one minor version bump (v{majorVersion}.
            <span className="font-mono">x</span>).
          </p>
        </div>
        {phase.name !== "idle" && phase.name !== "error" && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="size-3.5" />
            Reset
          </button>
        )}
      </div>

      {!snapshotReady && (
        <div className="p-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-700 dark:text-amber-300">
          Uploads unlock once the company crawl is READY. Crawl first in Knowledge → Ingest.
        </div>
      )}

      {(phase.name === "idle" || phase.name === "error") && (
        <>
          {phase.name === "error" && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              <XCircle className="size-4 shrink-0 mt-0.5" />
              <span>{phase.message}</span>
            </div>
          )}
          <button
            type="button"
            disabled={!snapshotReady}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles([...e.dataTransfer.files]);
            }}
            className={`w-full flex flex-col items-center justify-center gap-2 p-8 rounded-xl border border-dashed transition-colors ${
              dragOver
                ? "border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-800/60"
                : "border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/60 hover:border-zinc-400 dark:hover:border-zinc-600"
            } ${snapshotReady ? "cursor-pointer" : "opacity-50 cursor-not-allowed"}`}
          >
            <UploadSimple className="size-6 text-zinc-400 dark:text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Drop files here or <span className="underline">browse</span>
            </span>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500">
              pdf · docx · xlsx · csv · md · txt · html · json · sitemap — max 20 files, 25MB each
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.csv,.md,.mdx,.txt,.html,.htm,.json,.xml"
            className="hidden"
            onChange={(e) => void handleFiles([...(e.target.files || [])])}
          />
        </>
      )}

      {phase.name === "uploading" && (
        <div className="flex items-center gap-2 p-4 text-sm text-zinc-500 dark:text-zinc-400">
          <CircleNotch className="size-4 animate-spin" />
          Extracting previews…
        </div>
      )}

      {phase.name === "preview" && (
        <div className="space-y-3">
          <div className="space-y-2">
            {phase.draft.manifest.map((entry, i) => (
              <div
                key={`${entry.filename}-${i}`}
                className="flex items-start gap-2.5 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60"
              >
                <FileText className="size-4 shrink-0 mt-0.5 text-zinc-400 dark:text-zinc-500" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {entry.title || entry.filename}
                    </span>
                    <span className="text-[11px] font-mono text-zinc-500">{formatBytes(entry.size)}</span>
                    {typeof entry.wordCount === "number" && (
                      <span className="text-[11px] font-mono text-zinc-500">{entry.wordCount} words</span>
                    )}
                  </div>
                  {entry.error ? (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{entry.error}</p>
                  ) : (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{entry.preview}</p>
                  )}
                </div>
                {entry.error ? (
                  <XCircle className="size-4 shrink-0 text-red-500" />
                ) : (
                  <CheckCircle className="size-4 shrink-0 text-emerald-500" />
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleConfirm()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white dark:bg-zinc-100 dark:hover:bg-white text-zinc-950 text-sm font-medium transition-colors"
            >
              <TrayArrowDown className="size-4" />
              Process batch
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-sm text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {phase.name === "polling" && (
        <div className="flex items-center gap-2 p-4 text-sm text-zinc-500 dark:text-zinc-400">
          <CircleNotch className="size-4 animate-spin" />
          Indexing batch… this runs in the background, you can keep working.
        </div>
      )}

      {phase.name === "done" && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle className="size-4 shrink-0 mt-0.5" />
          <span>
            Batch READY as v{majorVersion}.{phase.batch.minor} — {phase.batch.docs} documents indexed.
          </span>
        </div>
      )}
    </section>
  );
}
