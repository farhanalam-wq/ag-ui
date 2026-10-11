"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const MAX_FILES = 20;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_BATCH_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTS = ["pdf", "docx", "xlsx", "csv", "md", "mdx", "txt", "html", "htm", "json", "xml"];

// Single source of truth: every user-facing filetype list derives from here.
const ACCEPT_ATTR = ALLOWED_EXTS.map((e) => `.${e}`).join(",");
const TYPE_LIST = ALLOWED_EXTS.join(", ");

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
  const router = useRouter();
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
            message: `"${f.name}" has an unsupported type. Use ${TYPE_LIST}.`,
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
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-[15px] font-semibold">
              Enrich with files
            </CardTitle>
            <CardDescription className="mt-1 text-[13px]">
              Uploads join the library as version v{majorVersion}.
              <span className="font-mono">x</span>.
            </CardDescription>
          </div>
          {phase.name !== "idle" && phase.name !== "error" && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-muted-foreground"
              onClick={reset}
            >
              <X className="size-3.5" data-icon="inline-start" />
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {!snapshotReady && (
          <div
            role="note"
            className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[13px]"
          >
            <p className="font-medium">Crawl first, then upload</p>
            <p className="mt-0.5 text-muted-foreground">
              Uploads unlock once the company crawl is ready.{" "}
              <Button
                variant="link"
                className="h-auto p-0 text-[13px] font-normal"
                onClick={() => router.push("/knowledge/ingest")}
              >
                Go to Ingest
              </Button>
            </p>
          </div>
        )}

        {(phase.name === "idle" || phase.name === "error") && (
          <>
            {phase.name === "error" && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]"
              >
                <XCircle
                  className="mt-0.5 size-4 shrink-0 text-destructive"
                  aria-hidden="true"
                />
                <span>{phase.message}</span>
              </div>
            )}
            <div>
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
                aria-label="Upload files"
                className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-8 transition-colors ${
                  dragOver
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-muted/30 hover:border-muted-foreground/40"
                } ${snapshotReady ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}
              >
                <UploadSimple
                  className="size-6 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="text-sm">
                  Drop files here or{" "}
                  <span className="text-primary underline underline-offset-4">
                    browse
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {TYPE_LIST} · max {MAX_FILES} files, 25MB each, 100MB total
                </span>
              </button>
              <input
                ref={inputRef}
                id="source-file-upload"
                type="file"
                multiple
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={(e) => void handleFiles([...(e.target.files || [])])}
              />
            </div>
          </>
        )}

        {phase.name === "uploading" && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
            Extracting previews
          </div>
        )}

        {phase.name === "preview" && (
          <div className="space-y-3">
            <div className="divide-y rounded-lg border">
              {phase.draft.manifest.map((entry, i) => (
                <div
                  key={`${entry.filename}-${i}`}
                  className="flex items-start gap-2.5 px-3 py-2.5"
                >
                  <FileText
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="truncate text-[13px] font-medium">
                        {entry.title || entry.filename}
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                        {formatBytes(entry.size)}
                      </span>
                      {typeof entry.wordCount === "number" && (
                        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                          {entry.wordCount.toLocaleString()} words
                        </span>
                      )}
                    </p>
                    {entry.error ? (
                      <p className="mt-1 text-xs text-destructive">
                        {entry.error}
                      </p>
                    ) : (
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {entry.preview}
                      </p>
                    )}
                  </div>
                  {entry.error ? (
                    <XCircle
                      className="size-4 shrink-0 text-destructive"
                      aria-hidden="true"
                    />
                  ) : (
                    <CheckCircle
                      className="size-4 shrink-0 text-emerald-500"
                      aria-hidden="true"
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={() => void handleConfirm()}>
                <TrayArrowDown className="size-4" data-icon="inline-start" />
                Process batch
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCancel()}
              >
                Discard
              </Button>
            </div>
          </div>
        )}

        {phase.name === "polling" && (
          <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
            Indexing batch. This runs in the background, you can keep working.
          </div>
        )}

        {phase.name === "done" && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-[13px]">
            <CheckCircle
              className="mt-0.5 size-4 shrink-0 text-emerald-500"
              aria-hidden="true"
            />
            <span>
              Batch ready as v{majorVersion}.{phase.batch.minor} ·{" "}
              {phase.batch.docs} documents indexed.
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
