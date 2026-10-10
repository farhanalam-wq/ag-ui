"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Database,
  Globe,
  FilePdf,
  FileDoc,
  FileXls,
  FileCsv,
  FileMd,
  FileTxt,
  FileHtml,
  FileCode,
  FileText,
  Eye,
  Trash,
  X,
  CheckCircle,
  XCircle,
  CircleNotch,
  Buildings,
  ArrowRight,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { UploadPanel } from "@/components/knowledge/upload-panel";
import { apiClient, type SourceDocument, type EnrichmentBatch, type CompanySummary } from "@/lib/api-client";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

function kindIcon(filename: string, sourceKind: string) {
  if (sourceKind === "crawl") return Globe;
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  switch (ext) {
    case "pdf":
      return FilePdf;
    case "docx":
    case "doc":
      return FileDoc;
    case "xlsx":
    case "xls":
      return FileXls;
    case "csv":
      return FileCsv;
    case "md":
    case "mdx":
      return FileMd;
    case "html":
    case "htm":
      return FileHtml;
    case "json":
      return FileCode;
    case "txt":
      return FileTxt;
    default:
      return FileText;
  }
}

function kindLabel(doc: SourceDocument): string {
  if (doc.sourceKind === "crawl") return "PAGE";
  const ext = (doc.originName || doc.url).split(".").pop()?.toUpperCase() || "FILE";
  return ext.replace("://", "").slice(0, 5);
}

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
      return (
        <span className={`${base} border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300`}>
          <CircleNotch className="size-3 animate-spin" /> PROCESSING
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

export default function SourcesPage() {
  const router = useRouter();
  const companies = useCompanyStore((s) => s.companies);
  const selectedCompany = useSelectedCompany();
  const [docs, setDocs] = useState<SourceDocument[]>([]);
  const [batches, setBatches] = useState<EnrichmentBatch[]>([]);
  const [detail, setDetail] = useState<CompanySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<SourceDocument | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    if (!selectedCompany) return;
    setLoading(true);
    setError(null);
    try {
      const [docRes, batchRes, listRes] = await Promise.all([
        apiClient.companies.getDocuments(selectedCompany.id),
        apiClient.uploads.list(selectedCompany.id),
        apiClient.companies.list(),
      ]);
      setDocs(docRes.documents);
      setBatches(batchRes);
      setDetail(listRes.find((c) => c.id === selectedCompany.id) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sources");
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(
    () => companies.find((c) => c.id === selectedCompany?.id),
    [companies, selectedCompany]
  );
  const majorVersion = detail?.latestSnapshot?.version ?? 1;
  const snapshotReady =
    (detail?.latestSnapshot?.status || detail?.status || summary?.status) === "READY";
  const maxMinor = useMemo(
    () =>
      batches
        .filter((b) => b.status === "READY")
        .reduce((n, b) => Math.max(n, b.minor), 0),
    [batches]
  );

  const crawled = useMemo(() => docs.filter((d) => d.sourceKind === "crawl"), [docs]);
  const uploaded = useMemo(() => docs.filter((d) => d.sourceKind !== "crawl"), [docs]);
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const handleDelete = useCallback(
    async (docId: string) => {
      if (!selectedCompany) return;
      if (confirmDelete !== docId) {
        setConfirmDelete(docId);
        return;
      }
      setConfirmDelete(null);
      setDeleting(true);
      try {
        await apiClient.uploads.deleteDocuments(selectedCompany.id, [docId]);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
      } finally {
        setDeleting(false);
      }
    },
    [confirmDelete, selectedCompany, refresh]
  );

  const docRow = (doc: SourceDocument) => {
    const Icon = kindIcon(doc.originName || doc.url, doc.sourceKind);
    const batch = doc.batchId ? batchById.get(doc.batchId) : undefined;
    return (
      <div
        key={doc.id}
        className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60"
      >
        <div className="flex items-center justify-center size-8 rounded-lg bg-zinc-200 dark:bg-zinc-800 shrink-0">
          <Icon className="size-4 text-zinc-500 dark:text-zinc-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
              {doc.title}
            </span>
            <span className="px-1.5 py-px rounded text-[10px] font-mono border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">
              {kindLabel(doc)}
            </span>
            {batch && (
              <span className="px-1.5 py-px rounded text-[10px] font-mono border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400">
                v{majorVersion}.{batch.minor}
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 truncate mt-0.5">
            {doc.sourceKind === "crawl" ? doc.url : doc.originName} · {doc.wordCount} words
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPreview(doc)}
          title="Preview"
          className="p-1.5 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors shrink-0"
        >
          <Eye className="size-4" />
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={() => void handleDelete(doc.id)}
          title={confirmDelete === doc.id ? "Click again to confirm delete" : "Delete (tombstoned, restorable)"}
          className={`p-1.5 rounded transition-colors shrink-0 disabled:opacity-50 ${
            confirmDelete === doc.id
              ? "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-950/50"
              : "text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-200 dark:hover:bg-zinc-800"
          }`}
        >
          <Trash className="size-4" />
        </button>
      </div>
    );
  };

  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Sources" }]}>
      <div className="flex-1 p-4 sm:p-6 space-y-5 max-w-4xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center size-9 rounded-xl border border-sidebar-border bg-sidebar-accent shrink-0">
            <Database className="size-4 text-muted-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">Sources</h1>
            <p className="text-xs text-muted-foreground">
              {selectedCompany
                ? `Everything ${selectedCompany.name} knows — crawled pages plus your uploads.`
                : "Pick a company to inspect its knowledge sources."}
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {[
                { label: "Version", value: maxMinor > 0 ? `v${majorVersion}.${maxMinor}` : `v${majorVersion}` },
                { label: "Documents", value: String(docs.length) },
                { label: "Uploads", value: String(uploaded.length) },
                { label: "Chunks", value: String(detail?.chunkCount ?? summary?.chunkCount ?? 0) },
                { label: "Facts", value: String(detail?.factCount ?? summary?.factCount ?? 0) },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40"
                >
                  <p className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">{stat.value}</p>
                  <p className="text-[11px] font-sans uppercase tracking-wider text-zinc-500">{stat.label}</p>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
                <XCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-10 justify-center text-sm text-zinc-500">
                <CircleNotch className="size-4 animate-spin" /> Loading sources…
              </div>
            ) : (
              <>
                <section className="space-y-2.5">
                  <h2 className="text-xs font-sans uppercase tracking-wider text-zinc-500">
                    Website · {crawled.length}
                  </h2>
                  {crawled.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-2">No crawled pages yet.</p>
                  ) : (
                    crawled.map(docRow)
                  )}
                </section>

                <section className="space-y-2.5">
                  <h2 className="text-xs font-sans uppercase tracking-wider text-zinc-500">
                    Uploads · {uploaded.length}
                  </h2>
                  {uploaded.length === 0 ? (
                    <p className="text-xs text-zinc-500 py-2">
                      Nothing uploaded yet — enrich below to add your first files.
                    </p>
                  ) : (
                    uploaded.map(docRow)
                  )}
                </section>

                {batches.length > 0 && (
                  <section className="space-y-2.5">
                    <h2 className="text-xs font-sans uppercase tracking-wider text-zinc-500">
                      Batches · {batches.length}
                    </h2>
                    {batches.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/60 space-y-1.5"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-medium text-zinc-800 dark:text-zinc-200">
                            v{majorVersion}.{b.minor}
                          </span>
                          {statusPill(b.status)}
                          <span className="text-[11px] font-mono text-zinc-500">
                            {b.fileCount} files · {b.docs} docs
                            {b.failed > 0 && ` · ${b.failed} failed`}
                          </span>
                        </div>
                        {b.summary?.added && b.summary.added.length > 0 && (
                          <p className="text-[11px] font-mono text-zinc-500 truncate">
                            + {b.summary.added.join(", ")}
                          </p>
                        )}
                        {b.status === "FAILED" && (
                          <p className="text-xs text-red-500 dark:text-red-400">
                            {(b.errorSample as { message?: string } | null)?.message || "Processing failed"}
                          </p>
                        )}
                      </div>
                    ))}
                  </section>
                )}

                <UploadPanel
                  companyId={selectedCompany.id}
                  majorVersion={majorVersion}
                  snapshotReady={snapshotReady}
                  onChanged={() => void refresh()}
                />
              </>
            )}
          </>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
          onClick={() => setPreview(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {preview.title}
                </h3>
                <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
                  {kindLabel(preview)} · {preview.wordCount} words ·{" "}
                  {preview.sourceKind === "crawl" ? preview.url : preview.originName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="p-1.5 rounded text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
              {preview.preview}
            </p>
          </div>
        </div>
      )}
    </StudioShell>
  );
}
