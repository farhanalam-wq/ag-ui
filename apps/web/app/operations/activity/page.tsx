"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ArrowRight,
  Camera,
  CheckCircle,
  CircleNotch,
  Clock,
  Globe,
  ListBullets,
  Prohibit,
  WarningCircle,
  XCircle,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import {
  useCompanyStore,
  useSelectedCompany,
} from "@/stores/use-company-store";
import {
  apiClient,
  type ActivityEvent,
  type ActivityKind,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";

const PAGE_SIZE = 50;

const PRESETS = [
  { value: "1h", label: "Last hour", ms: 60 * 60 * 1000 },
  { value: "24h", label: "Last 24 hours", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "all", label: "All time", ms: null },
] as const;

type Preset = (typeof PRESETS)[number]["value"];

const PRESET_MS: Record<Exclude<Preset, "all">, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const STATUSES = [
  "QUEUED",
  "DISCOVERING",
  "CRAWLING",
  "PARSING",
  "EMBEDDING",
  "PROCESSING",
  "READY",
  "FAILED",
  "CANCELLED",
];

function statusLabel(status: string): string {
  const normalized = status.toUpperCase();
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

function detailNumber(event: ActivityEvent, key: string): number | null {
  const value = event.detail?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

function detailString(event: ActivityEvent, key: string): string | null {
  const value = event.detail?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function detailText(event: ActivityEvent): string {
  if (event.kind === "crawl_job") {
    const selected = detailNumber(event, "selected") ?? 0;
    const crawled = detailNumber(event, "crawled") ?? 0;
    const failed = detailNumber(event, "failed") ?? 0;
    const docs = detailNumber(event, "docs") ?? 0;
    const parts = [`${crawled}/${selected} pages`];
    if (failed > 0) parts.push(`${failed} failed`);
    else if (docs > 0) parts.push(`${docs} docs`);
    return parts.join(" · ");
  }

  const version = detailNumber(event, "version");
  const pages = detailNumber(event, "pageCount");
  return `${version === null ? "Snapshot" : `v${version}`} · ${
    pages === null ? "—" : `${pages} pages`
  }`;
}

function KindBadge({ kind }: { kind: ActivityKind }) {
  if (kind === "snapshot") {
    return (
      <Badge
        variant="secondary"
        className="rounded-full text-[11px] font-normal"
      >
        <Camera className="mr-1 size-3" aria-hidden="true" />
        Snapshot
      </Badge>
    );
  }
  return (
    <Badge
      variant="secondary"
      className="rounded-full text-[11px] font-normal"
    >
      <Globe className="mr-1 size-3" aria-hidden="true" />
      Crawl job
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();

  if (normalized === "READY") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
      >
        <CheckCircle className="mr-1 size-3" aria-hidden="true" />
        {statusLabel(normalized)}
      </Badge>
    );
  }
  if (normalized === "FAILED") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-destructive/40 bg-destructive/10 font-normal text-destructive"
      >
        <XCircle className="mr-1 size-3" aria-hidden="true" />
        {statusLabel(normalized)}
      </Badge>
    );
  }
  if (normalized === "CANCELLED") {
    return (
      <Badge variant="outline" className="rounded-full font-normal">
        <Prohibit className="mr-1 size-3" aria-hidden="true" />
        {statusLabel(normalized)}
      </Badge>
    );
  }
  if (normalized === "QUEUED") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-sky-500/30 bg-sky-500/10 font-normal text-sky-700 dark:text-sky-300"
      >
        <Clock className="mr-1 size-3" aria-hidden="true" />
        {statusLabel(normalized)}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="rounded-full border-sky-500/30 bg-sky-500/10 font-normal text-sky-700 dark:text-sky-300"
    >
      <CircleNotch className="mr-1 size-3 animate-spin" aria-hidden="true" />
      {statusLabel(normalized)}
    </Badge>
  );
}

export default function ActivityPage() {
  const selectedCompany = useSelectedCompany();
  const companiesLoading = useCompanyStore((s) => s.isLoading);
  const companyId = selectedCompany?.id ?? null;

  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [offset, setOffset] = useState(0);

  const [preset, setPreset] = useState<Preset>("7d");
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState<ActivityKind | "all">("all");
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<ActivityEvent | null>(null);

  // A company switch starts a fresh view: no stale page, sheet, or live poll.
  useEffect(() => {
    setOffset(0);
    setSelected(null);
    setLive(false);
  }, [companyId]);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      setRefreshKey((k) => k + 1);
    }, 5000);
    const onVisibility = () => {
      if (!document.hidden) setRefreshKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [live]);

  useEffect(() => {
    let cancelled = false;

    if (!companyId) {
      setEvents([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return () => {
        cancelled = true;
      };
    }

    const since =
      preset === "all"
        ? undefined
        : new Date(Date.now() - PRESET_MS[preset]).toISOString();

    setLoading(true);
    setError(null);

    apiClient.operations
      .activity({
        companyId,
        status: status === "all" ? undefined : status,
        kind: kind === "all" ? undefined : kind,
        since,
        limit: PAGE_SIZE,
        offset,
      })
      .then((res) => {
        if (cancelled) return;
        setEvents(res.events);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load activity");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, status, kind, preset, offset, refreshKey, live]);

  // If the trail shrinks under a live refresh, fall back to a valid page.
  useEffect(() => {
    if (loading) return;
    if (offset > 0 && offset >= total) {
      setOffset(total === 0 ? 0 : Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE);
    }
  }, [loading, total, offset]);

  const resetFilters = useCallback(() => {
    setPreset("7d");
    setStatus("all");
    setKind("all");
    setOffset(0);
  }, []);

  const goTo = useCallback((next: number) => {
    setLive(false);
    setOffset(Math.max(0, next));
  }, []);

  const toggleLive = useCallback(() => {
    setLive((current) => {
      if (!current) setOffset(0);
      return !current;
    });
  }, []);

  const hasFilters =
    preset !== "7d" || status !== "all" || kind !== "all";

  // Never paint rows from the previous company while the new fetch is in
  // flight. `total` is only trusted when every returned event belongs to the
  // current company.
  const scopedEvents = companyId
    ? events.filter((event) => event.companyId === companyId)
    : [];
  const scopedTotal = events.length === scopedEvents.length ? total : 0;

  const totalPages = Math.max(1, Math.ceil(scopedTotal / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < scopedTotal;
  const showingFrom = scopedTotal === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, scopedTotal);
  const initialLoading =
    (companiesLoading && !companyId) || (loading && scopedEvents.length === 0);

  const selectedCrawl = selected?.kind === "crawl_job";
  const selectedSnapshot = selected?.kind === "snapshot";

  return (
    <StudioShell crumbs={[{ label: "Operations" }, { label: "Activity" }]}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
              Activity
            </h1>
            <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
              {selectedCompany
                ? `Crawl jobs and snapshot changes for ${selectedCompany.name}, newest first.`
                : "Crawl jobs and snapshot changes for the selected company."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {scopedTotal > 0 && (
              <Badge variant="secondary" className="rounded-full font-normal">
                {scopedTotal.toLocaleString()}{" "}
                {scopedTotal === 1 ? "event" : "events"}
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <ArrowClockwise aria-hidden="true" />
              Refresh
            </Button>
          </div>
        </div>

        {selectedCompany && (
          <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2">
            <Select
              value={preset}
              onValueChange={(value) => {
                setPreset(value as Preset);
                setOffset(0);
              }}
            >
              <SelectTrigger
                className="h-8 w-[148px] text-[13px]"
                aria-label="Date range"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {PRESETS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant={live ? "secondary" : "outline"}
              size="sm"
              className="h-8 text-xs"
              aria-pressed={live}
              title={
                live
                  ? "Live updates on — paging turns this off"
                  : "Poll for new activity every 5 seconds"
              }
              onClick={toggleLive}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  live ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/40"
                )}
                aria-hidden="true"
              />
              Live
            </Button>

            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setOffset(0);
              }}
            >
              <SelectTrigger
                className="h-8 w-[148px] text-[13px]"
                aria-label="Status"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {statusLabel(value)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            <Select
              value={kind}
              onValueChange={(value) => {
                setKind(value as ActivityKind | "all");
                setOffset(0);
              }}
            >
              <SelectTrigger
                className="h-8 w-[136px] text-[13px]"
                aria-label="Kind"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">All kinds</SelectItem>
                  <SelectItem value="crawl_job">Crawl jobs</SelectItem>
                  <SelectItem value="snapshot">Snapshots</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>

            {hasFilters && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={resetFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="mt-4">
            <WarningCircle aria-hidden="true" />
            <AlertTitle>Couldn’t load activity</AlertTitle>
            <AlertDescription>
              <span className="break-all font-mono text-[11px]">{error}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {!(error && scopedEvents.length === 0) && (
          <Card className="mt-4 min-w-0 overflow-hidden">
            <CardContent className="p-0">
              {initialLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : !selectedCompany ? (
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ListBullets aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No company selected</EmptyTitle>
                    <EmptyDescription>
                      Add a company to start the activity trail.
                    </EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/knowledge/ingest">Add a company</Link>
                    </Button>
                  </EmptyContent>
                </Empty>
              ) : scopedEvents.length === 0 ? (
                <Empty className="py-12">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <ListBullets aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>
                      {hasFilters ? "No matching activity" : "No activity yet"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {hasFilters
                        ? "Nothing matches this filter combination."
                        : "Ingest a site to start the trail. Crawl jobs and snapshots will appear here."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {hasFilters ? (
                    <EmptyContent>
                      <Button variant="outline" size="sm" onClick={resetFilters}>
                        Clear filters
                      </Button>
                    </EmptyContent>
                  ) : (
                    <EmptyContent>
                      <Button asChild>
                        <Link href="/knowledge/ingest">
                          Ingest a site
                          <ArrowRight aria-hidden="true" />
                        </Link>
                      </Button>
                    </EmptyContent>
                  )}
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="h-9 min-w-[180px] text-xs">
                        Company
                      </TableHead>
                      <TableHead className="h-9 w-[136px] text-xs">
                        Kind
                      </TableHead>
                      <TableHead className="h-9 w-[132px] text-xs">
                        Status
                      </TableHead>
                      <TableHead className="h-9 min-w-[220px] text-xs">
                        Detail
                      </TableHead>
                      <TableHead className="h-9 w-[136px] text-right text-xs">
                        Time
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedEvents.map((event) => (
                      <TableRow
                        key={`${event.kind}-${event.id}`}
                        className="cursor-pointer"
                        tabIndex={0}
                        onClick={() => setSelected(event)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(event);
                          }
                        }}
                      >
                        <TableCell className="max-w-0 py-2.5">
                          <span
                            className="block truncate text-[13px] font-medium"
                            title={event.companyName}
                          >
                            {event.companyName}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5">
                          <KindBadge kind={event.kind} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <StatusBadge status={event.status} />
                        </TableCell>
                        <TableCell className="py-2.5 font-sans text-xs tabular-nums text-muted-foreground">
                          {detailText(event)}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-sans text-xs tabular-nums text-muted-foreground">
                          <span title={formatDateTime(event.at)}>
                            {formatTime(event.at)}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {scopedTotal > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-2.5">
                  <p className="font-sans text-xs tabular-nums text-muted-foreground">
                    Showing {showingFrom}–{showingTo} of{" "}
                    {scopedTotal.toLocaleString()}{" "}
                    {scopedTotal === 1 ? "item" : "items"}
                  </p>
                  <Pagination className="mx-0 w-auto">
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          aria-disabled={!canPrev}
                          className={cn(
                            !canPrev && "pointer-events-none opacity-50"
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            if (canPrev) goTo(offset - PAGE_SIZE);
                          }}
                        />
                      </PaginationItem>
                      <PaginationItem>
                        <span className="px-2 font-sans text-xs tabular-nums text-muted-foreground">
                          {page} / {totalPages}
                        </span>
                      </PaginationItem>
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          aria-disabled={!canNext}
                          className={cn(
                            !canNext && "pointer-events-none opacity-50"
                          )}
                          onClick={(e) => {
                            e.preventDefault();
                            if (canNext) goTo(offset + PAGE_SIZE);
                          }}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Sheet
          open={selected !== null}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
        >
          {selected && (
            <SheetContent className="w-full overflow-y-auto sm:max-w-[520px]">
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  <KindBadge kind={selected.kind} />
                  <span>{selected.companyName}</span>
                </SheetTitle>
                <SheetDescription>
                  {formatDateTime(selected.at)}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={selected.status} />
                  <span className="font-sans text-[13px] tabular-nums text-muted-foreground">
                    {detailText(selected)}
                  </span>
                </div>

                <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                  <dt className="text-muted-foreground">ID</dt>
                  <dd className="break-all font-mono text-[11px]">
                    {selected.id}
                  </dd>

                  <dt className="text-muted-foreground">Company</dt>
                  <dd className="break-all">{selected.companyName}</dd>

                  <dt className="text-muted-foreground">Kind</dt>
                  <dd>{selected.kind === "crawl_job" ? "Crawl job" : "Snapshot"}</dd>

                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="font-mono text-[11px]">{selected.status}</dd>

                  <dt className="text-muted-foreground">Created</dt>
                  <dd>{formatDateTime(selected.at)}</dd>

                  {selectedCrawl && (
                    <>
                      <dt className="text-muted-foreground">Pages</dt>
                      <dd className="font-sans tabular-nums">
                        {detailNumber(selected, "crawled") ?? 0} crawled of{" "}
                        {detailNumber(selected, "selected") ?? 0} selected
                      </dd>

                      <dt className="text-muted-foreground">Documents</dt>
                      <dd className="font-sans tabular-nums">
                        {detailNumber(selected, "docs") ?? 0}
                      </dd>

                      <dt className="text-muted-foreground">Failed</dt>
                      <dd className="font-sans tabular-nums">
                        {detailNumber(selected, "failed") ?? 0}
                      </dd>

                      <dt className="text-muted-foreground">Snapshot</dt>
                      <dd className="break-all font-mono text-[11px]">
                        {detailString(selected, "snapshotId") ?? "—"}
                      </dd>

                      <dt className="text-muted-foreground">Updated</dt>
                      <dd>
                        {detailString(selected, "updatedAt")
                          ? formatDateTime(
                              detailString(selected, "updatedAt") as string
                            )
                          : "—"}
                      </dd>
                    </>
                  )}

                  {selectedSnapshot && (
                    <>
                      <dt className="text-muted-foreground">Version</dt>
                      <dd className="font-sans tabular-nums">
                        {detailNumber(selected, "version") === null
                          ? "—"
                          : `v${detailNumber(selected, "version")}`}
                      </dd>

                      <dt className="text-muted-foreground">Pages</dt>
                      <dd className="font-sans tabular-nums">
                        {detailNumber(selected, "pageCount") ?? "—"}
                      </dd>
                    </>
                  )}
                </dl>

                {selectedCrawl && (
                  <Button asChild variant="outline" size="sm">
                    <Link
                      href={`/operations/errors?jobId=${encodeURIComponent(
                        selected.id
                      )}`}
                    >
                      View errors for this job
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                )}
              </div>
            </SheetContent>
          )}
        </Sheet>
      </div>
    </StudioShell>
  );
}
