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
  Trash,
  CheckCircle,
  XCircle,
  CircleNotch,
  Buildings,
  ArrowRight,
  MagnifyingGlass,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { UploadPanel } from "@/components/knowledge/upload-panel";
import { apiClient, type SourceDocument, type EnrichmentBatch, type CompanySummary } from "@/lib/api-client";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

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
  if (status === "PROCESSING")
    return (
      <Badge variant="outline" className="rounded-full font-normal">
        <CircleNotch className="mr-1 size-3 animate-spin" aria-hidden="true" />
        Processing
      </Badge>
    );
  return (
    <Badge variant="outline" className="rounded-full font-normal">
      {status}
    </Badge>
  );
}

type KindFilter = "all" | "crawl" | "file";

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
  const [deleteTarget, setDeleteTarget] = useState<SourceDocument | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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

  const crawledCount = useMemo(
    () => docs.filter((d) => d.sourceKind === "crawl").length,
    [docs]
  );
  const uploadedCount = useMemo(
    () => docs.filter((d) => d.sourceKind !== "crawl").length,
    [docs]
  );
  const chunkCount = detail?.chunkCount ?? summary?.chunkCount ?? 0;
  const factCount = detail?.factCount ?? summary?.factCount ?? 0;
  const batchById = useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return docs.filter((d) => {
      if (kindFilter === "crawl" && d.sourceKind === "upload") return false;
      if (kindFilter === "file" && d.sourceKind === "crawl") return false;
      if (!q) return true;
      return (
        d.title.toLowerCase().includes(q) ||
        d.url.toLowerCase().includes(q) ||
        (d.originName || "").toLowerCase().includes(q)
      );
    });
  }, [docs, kindFilter, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [docs, kindFilter, searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedDocs = useMemo(
    () => filteredDocs.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredDocs, safePage, pageSize]
  );
  const rangeStart =
    filteredDocs.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredDocs.length);

  const pageItems = useMemo<(number | "gap")[]>(() => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    const keep = new Set([1, 2, safePage - 1, safePage, safePage + 1, totalPages - 1, totalPages]);
    const items: (number | "gap")[] = [];
    for (let n = 1; n <= totalPages; n++) {
      if (!keep.has(n)) {
        if (items[items.length - 1] !== "gap") items.push("gap");
        continue;
      }
      items.push(n);
    }
    return items;
  }, [totalPages, safePage]);

  const handleDelete = useCallback(async () => {
    if (!selectedCompany || !deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.uploads.deleteDocuments(selectedCompany.id, [
        deleteTarget.id,
      ]);
      toast.success("Source deleted", {
        description: `${deleteTarget.title} was removed from the library.`,
      });
      setDeleteTarget(null);
      setPreview((p) => (p?.id === deleteTarget.id ? null : p));
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Delete failed";
      setError(message);
      toast.error("Delete failed", { description: message });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, selectedCompany, refresh]);

  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Sources" }]}>
      <div className="min-w-0">
        {/* PageHeader */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
              Sources
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              Everything the selected assistant knows. Crawled pages plus
              your uploads.
            </p>
          </div>
          {selectedCompany && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="rounded-full font-normal">
                <span
                  className={`mr-1.5 size-1.5 rounded-full ${
                    snapshotReady ? "bg-emerald-500" : "bg-amber-500"
                  }`}
                />
                {snapshotReady ? "All OK" : "Indexing"}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/knowledge/ingest")}
              >
                Ingest more
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
                Pick a company to inspect its knowledge sources.
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
            {/* Snapshot strip */}
            <p className="text-[13px] text-muted-foreground">
              Snapshot v{majorVersion}
              {maxMinor > 0 ? `.${maxMinor}` : ""} ·{" "}
              {snapshotReady ? "ready" : "indexing"} · {docs.length}{" "}
              documents
            </p>

            {/* Quota strip */}
            <Card>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4 md:divide-x md:divide-border">
                  <div className="min-w-0 pr-4">
                    <p className="text-[13px] text-muted-foreground">
                      Documents
                    </p>
                    <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                      {docs.length.toLocaleString()}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        / {uploadedCount} uploads
                      </span>
                    </p>
                  </div>
                  <div className="min-w-0 pr-4 md:px-5">
                    <p className="text-[13px] text-muted-foreground">Chunks</p>
                    <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                      {chunkCount.toLocaleString()}{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{" "}
                        {docs.length > 0
                          ? Math.round(chunkCount / docs.length)
                          : 0}{" "}
                        per doc
                      </span>
                    </p>
                  </div>
                  <div className="min-w-0 pr-4 md:px-5">
                    <p className="text-[13px] text-muted-foreground">Facts</p>
                    <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                      {factCount.toLocaleString()}
                    </p>
                  </div>
                  <div className="min-w-0 md:pl-5">
                    <p className="text-[13px] text-muted-foreground">Version</p>
                    <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                      v{majorVersion}
                      {maxMinor > 0 ? `.${maxMinor}` : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]"
              >
                <p className="font-medium">Could not load sources</p>
                <p className="mt-1 text-muted-foreground">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 h-7 text-xs"
                  onClick={() => void refresh()}
                >
                  Retry
                </Button>
              </div>
            )}

            {loading ? (
              <Card className="min-w-0">
                <CardContent className="space-y-2 pt-5">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Ledger */}
                <Card className="min-w-0">
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <CardTitle className="text-[15px] font-semibold">
                        Library ({filteredDocs.length})
                      </CardTitle>
                      <div className="flex items-center gap-1.5">
                        {(
                          [
                            { key: "all", label: "All" },
                            { key: "crawl", label: "Pages" },
                            { key: "file", label: "Files" },
                          ] as const
                        ).map((f) => (
                          <Button
                            key={f.key}
                            type="button"
                            variant={
                              kindFilter === f.key ? "secondary" : "ghost"
                            }
                            size="sm"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => setKindFilter(f.key)}
                          >
                            {f.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <div className="relative mt-3">
                      <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search titles and URLs"
                        aria-label="Search sources"
                        className="h-8 pl-8 text-[13px]"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {filteredDocs.length === 0 ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>
                            {docs.length === 0
                              ? "Library is empty"
                              : "No matches"}
                          </EmptyTitle>
                          <EmptyDescription>
                            {docs.length === 0
                              ? "Ingest a site or upload files below to add the first source."
                              : "No sources match this search. Clear it or switch the filter."}
                          </EmptyDescription>
                        </EmptyHeader>
                        {docs.length > 0 && (
                          <EmptyContent>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSearchQuery("");
                                setKindFilter("all");
                              }}
                            >
                              Clear search and filters
                            </Button>
                          </EmptyContent>
                        )}
                      </Empty>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="h-8 min-w-[280px] text-xs">
                              Source
                            </TableHead>
                            <TableHead className="h-8 w-[90px] text-xs">
                              Type
                            </TableHead>
                            <TableHead className="h-8 w-[90px] text-xs">
                              Version
                            </TableHead>
                            <TableHead className="h-8 w-[90px] text-right text-xs">
                              Words
                            </TableHead>
                            <TableHead className="h-8 w-[88px] text-right text-xs">
                              Actions
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagedDocs.map((doc) => {
                            const Icon = kindIcon(
                              doc.originName || doc.url,
                              doc.sourceKind
                            );
                            const batch = doc.batchId
                              ? batchById.get(doc.batchId)
                              : undefined;
                            return (
                              <TableRow
                                key={doc.id}
                                className="group cursor-pointer"
                                onClick={() => setPreview(doc)}
                              >
                                <TableCell className="max-w-0 py-2.5">
                                  <span className="flex min-w-0 items-center gap-2.5">
                                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                      <Icon
                                        className="size-3.5"
                                        aria-hidden="true"
                                      />
                                    </span>
                                    <span className="min-w-0">
                                      <span
                                        className="block truncate text-[13px] font-medium"
                                        title={doc.title}
                                      >
                                        {doc.title}
                                      </span>
                                      <span
                                        className="block truncate font-mono text-[11px] text-muted-foreground"
                                        title={
                                          doc.sourceKind === "crawl"
                                            ? doc.url
                                            : (doc.originName ?? doc.url)
                                        }
                                      >
                                        {doc.sourceKind === "crawl"
                                          ? doc.url
                                          : (doc.originName ?? doc.url)}
                                      </span>
                                    </span>
                                  </span>
                                </TableCell>
                                <TableCell className="py-2.5">
                                  <Badge
                                    variant="secondary"
                                    className="rounded-full text-[11px] font-normal"
                                  >
                                    {kindLabel(doc)}
                                  </Badge>
                                </TableCell>
                                <TableCell className="py-2.5 font-mono text-xs text-muted-foreground">
                                  {batch ? (
                                    <span title={`Batch ${batch.id}`}>
                                      v{majorVersion}.{batch.minor}
                                    </span>
                                  ) : (
                                    <span aria-label="No version">–</span>
                                  )}
                                </TableCell>
                                <TableCell className="py-2.5 text-right font-sans text-[13px] tabular-nums">
                                  {doc.wordCount.toLocaleString()}
                                </TableCell>
                                <TableCell className="py-2.5 text-right">
                                  <span className="inline-flex items-center opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="size-7 hover:text-destructive"
                                      title="Delete"
                                      aria-label={`Delete ${doc.title}`}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteTarget(doc);
                                      }}
                                    >
                                      <Trash
                                        className="size-3.5"
                                        aria-hidden="true"
                                      />
                                    </Button>
                                  </span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    )}
                    {filteredDocs.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
                        <p className="font-sans text-xs tabular-nums text-muted-foreground">
                          Showing {rangeStart} to {rangeEnd} of{" "}
                          {filteredDocs.length.toLocaleString()}
                        </p>
                        <div className="flex items-center gap-1">
                          {[10, 25, 50, 100].map((n) => (
                            <Button
                              key={n}
                              type="button"
                              variant={pageSize === n ? "secondary" : "ghost"}
                              size="sm"
                              className="h-7 px-2 text-xs tabular-nums"
                              onClick={() => setPageSize(n)}
                            >
                              {n}
                            </Button>
                          ))}
                        </div>
                        {totalPages > 1 && (
                          <Pagination className="mx-0 w-auto">
                            <PaginationContent>
                              <PaginationItem>
                                <PaginationPrevious
                                  href="#"
                                  aria-disabled={safePage === 1}
                                  className={
                                    safePage === 1
                                      ? "pointer-events-none opacity-50"
                                      : undefined
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setPage((p) => Math.max(1, p - 1));
                                  }}
                                />
                              </PaginationItem>
                              {pageItems.map((item, i) => (
                                <PaginationItem key={`${item}-${i}`}>
                                  {item === "gap" ? (
                                    <PaginationEllipsis />
                                  ) : (
                                    <PaginationLink
                                      href="#"
                                      isActive={item === safePage}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        setPage(item);
                                      }}
                                    >
                                      {item}
                                    </PaginationLink>
                                  )}
                                </PaginationItem>
                              ))}
                              <PaginationItem>
                                <PaginationNext
                                  href="#"
                                  aria-disabled={safePage === totalPages}
                                  className={
                                    safePage === totalPages
                                      ? "pointer-events-none opacity-50"
                                      : undefined
                                  }
                                  onClick={(e) => {
                                    e.preventDefault();
                                    setPage((p) =>
                                      Math.min(totalPages, p + 1)
                                    );
                                  }}
                                />
                              </PaginationItem>
                            </PaginationContent>
                          </Pagination>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Batches, compact */}
                {batches.length > 0 && (
                  <Card className="min-w-0">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-[15px] font-semibold">
                        Upload batches ({batches.length})
                      </CardTitle>
                      <CardDescription className="text-[13px]">
                        Each confirmed upload lands as a minor version.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-1 pt-0">
                      {batches.map((b) => (
                        <div
                          key={b.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted/40"
                        >
                          <span className="font-mono text-xs">
                            v{majorVersion}.{b.minor}
                          </span>
                          <StatusBadge status={b.status} />
                          <span className="font-sans tabular-nums text-muted-foreground">
                            {b.fileCount} files · {b.docs} docs
                            {b.failed > 0 && ` · ${b.failed} failed`}
                          </span>
                          {b.summary?.added &&
                            b.summary.added.length > 0 && (
                              <span
                                className="block w-full truncate font-mono text-[11px] text-muted-foreground"
                                title={b.summary.added.join(", ")}
                              >
                                + {b.summary.added.join(", ")}
                              </span>
                            )}
                          {b.status === "FAILED" && (
                            <span className="text-xs text-destructive">
                              {(b.errorSample as { message?: string } | null)
                                ?.message || "Processing failed"}
                            </span>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                <UploadPanel
                  companyId={selectedCompany.id}
                  majorVersion={majorVersion}
                  snapshotReady={snapshotReady}
                  onChanged={() => void refresh()}
                />
              </>
            )}
          </div>
        )}
      </div>

      <Sheet
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
      >
        <SheetContent
          className="flex w-full flex-col sm:max-w-[480px]"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            document.getElementById("source-preview-title")?.focus();
          }}
        >
          <SheetHeader>
            <div className="flex items-center gap-2">
              {preview && (
                <Badge
                  variant="secondary"
                  className="shrink-0 rounded-full text-[11px] font-normal"
                >
                  {kindLabel(preview)}
                </Badge>
              )}
              <SheetTitle
                id="source-preview-title"
                tabIndex={-1}
                className="min-w-0 flex-1 truncate text-left outline-none"
              >
                {preview?.title}
              </SheetTitle>
            </div>
            {preview && (
              <SheetDescription className="break-all text-left font-mono text-[11px]">
                {preview.sourceKind === "crawl"
                  ? preview.url
                  : (preview.originName ?? preview.url)}
              </SheetDescription>
            )}
          </SheetHeader>
          {preview && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-y py-3 text-[13px]">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Category</dt>
                <dd className="truncate font-medium capitalize">
                  {preview.category || "general"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Version</dt>
                <dd className="font-mono text-xs">
                  {preview.batchId && batchById.get(preview.batchId) ? (
                    <span>
                      v{majorVersion}.
                      {batchById.get(preview.batchId)!.minor}
                    </span>
                  ) : (
                    <span aria-label="No version">–</span>
                  )}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Words</dt>
                <dd className="font-sans tabular-nums">
                  {preview.wordCount.toLocaleString()}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Characters</dt>
                <dd className="font-sans tabular-nums">
                  {preview.contentLength.toLocaleString()}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Added</dt>
                <dd className="font-sans tabular-nums">
                  {new Date(preview.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Kind</dt>
                <dd className="font-medium capitalize">
                  {preview.sourceKind}
                </dd>
              </div>
            </dl>
          )}
          <p className="min-h-0 flex-1 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">
            {preview?.preview}
          </p>
          <SheetFooter className="gap-2 sm:justify-end">
            {preview?.sourceKind === "crawl" && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open original
                </a>
              </Button>
            )}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (preview) setDeleteTarget(preview);
              }}
            >
              Delete source
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteTarget?.title}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              One document leaves the answers immediately. Restorable from
              Snapshots with a rollback.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting ? "Deleting" : "Delete source"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </StudioShell>
  );
}
