"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowClockwise,
  ChatCircle,
  Code,
  GearSix,
  Globe,
  MagnifyingGlass,
  Microphone,
  Plugs,
  Warning,
  WarningCircle,
  X,
  XCircle,
  type Icon,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import {
  useCompanyStore,
  useSelectedCompany,
} from "@/stores/use-company-store";
import {
  apiClient,
  type ErrorEventRow,
  type ErrorLevel,
  type ErrorSource,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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

const SOURCES: ErrorSource[] = [
  "api",
  "crawler",
  "worker",
  "embed",
  "retrieval",
  "chat",
  "voice",
];

const SOURCE_ICONS: Record<ErrorSource, Icon> = {
  api: Plugs,
  crawler: Globe,
  worker: GearSix,
  embed: Code,
  retrieval: MagnifyingGlass,
  chat: ChatCircle,
  voice: Microphone,
};

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

function contextValue(
  context: Record<string, unknown> | null,
  key: string
): string | null {
  const value = context?.[key];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function LevelBadge({ level }: { level: ErrorLevel }) {
  if (level === "warn") {
    return (
      <Badge
        variant="outline"
        className="rounded-full border-amber-500/30 bg-amber-500/10 font-normal text-amber-700 dark:text-amber-300"
      >
        <Warning className="mr-1 size-3" aria-hidden="true" />
        Warn
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="rounded-full border-destructive/40 bg-destructive/10 font-normal text-destructive"
    >
      <XCircle className="mr-1 size-3" aria-hidden="true" />
      Error
    </Badge>
  );
}

function SourceCell({ source }: { source: ErrorSource }) {
  const Icon = SOURCE_ICONS[source] ?? GearSix;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="font-mono text-xs">{source}</span>
    </span>
  );
}

function ErrorsFallback() {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-4 h-[420px] w-full" />
    </div>
  );
}

function ErrorsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedCompany = useSelectedCompany();
  const companiesLoading = useCompanyStore((s) => s.isLoading);
  const companyId = selectedCompany?.id ?? null;

  const urlJobId = searchParams.get("jobId") ?? undefined;

  const [rows, setRows] = useState<ErrorEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [offset, setOffset] = useState(0);

  const [preset, setPreset] = useState<Preset>("7d");
  const [source, setSource] = useState<ErrorSource | "all">("all");
  const [level, setLevel] = useState<ErrorLevel | "all">("all");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [jobId, setJobId] = useState<string | undefined>(urlJobId);
  const [live, setLive] = useState(false);
  const [selected, setSelected] = useState<ErrorEventRow | null>(null);

  // Follow the Activity cross-link when it changes.
  useEffect(() => {
    setJobId(urlJobId);
    setOffset(0);
  }, [urlJobId]);

  // Switching companies starts a fresh, company-scoped view. An old job chip
  // must never filter a newly selected company down to zero rows.
  const previousCompanyId = useRef<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    const previous = previousCompanyId.current;
    previousCompanyId.current = companyId;
    if (!previous || previous === companyId) return;

    setRows([]);
    setTotal(0);
    setOffset(0);
    setSelected(null);
    setLive(false);
    setJobId(undefined);
    if (urlJobId) router.replace("/operations/errors");
  }, [companyId, urlJobId, router]);

  // 300 ms debounce on the search box.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  // Live polls at offset 0 and pauses while the tab is hidden.
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
      setRows([]);
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
      .errors({
        companyId,
        source: source === "all" ? undefined : source,
        level: level === "all" ? undefined : level,
        since,
        q: q || undefined,
        jobId,
        limit: PAGE_SIZE,
        offset,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.events);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load errors");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, source, level, preset, q, jobId, offset, refreshKey, live]);

  // If the trail shrinks under a live refresh, fall back to a valid page.
  useEffect(() => {
    if (loading) return;
    if (offset > 0 && offset >= total) {
      setOffset(total === 0 ? 0 : Math.floor((total - 1) / PAGE_SIZE) * PAGE_SIZE);
    }
  }, [loading, total, offset]);

  const clearJob = useCallback(() => {
    setJobId(undefined);
    setOffset(0);
    router.replace("/operations/errors");
  }, [router]);

  const resetFilters = useCallback(() => {
    setPreset("7d");
    setSource("all");
    setLevel("all");
    setSearch("");
    setQ("");
    setOffset(0);
    if (jobId) clearJob();
  }, [jobId, clearJob]);

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
    preset !== "7d" ||
    source !== "all" ||
    level !== "all" ||
    search.trim() !== "" ||
    Boolean(jobId);

  // Never paint rows from the previous company while the new fetch is in
  // flight. `total` is only trusted when every returned row belongs to the
  // current company.
  const scopedRows = companyId
    ? rows.filter((row) => row.companyId === companyId)
    : [];
  const scopedTotal = rows.length === scopedRows.length ? total : 0;

  const totalPages = Math.max(1, Math.ceil(scopedTotal / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < scopedTotal;
  const showingFrom = scopedTotal === 0 ? 0 : offset + 1;
  const showingTo = Math.min(offset + PAGE_SIZE, scopedTotal);
  const initialLoading =
    (companiesLoading && !companyId) || (loading && scopedRows.length === 0);
  const companyName = selectedCompany?.name ?? "—";

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
            Errors
          </h1>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            {selectedCompany
              ? `Failures from the API, workers, and runtime for ${selectedCompany.name}, newest first.`
              : "Failures from the API, workers, and runtime, newest first."}
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
                : "Poll for new errors every 5 seconds"
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

          <div className="relative min-w-[200px] flex-1">
            <MagnifyingGlass
              className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search message or route…"
              aria-label="Search errors"
              className="h-8 pl-8 text-[13px]"
            />
          </div>

          <Select
            value={source}
            onValueChange={(value) => {
              setSource(value as ErrorSource | "all");
              setOffset(0);
            }}
          >
            <SelectTrigger
              className="h-8 w-[132px] text-[13px]"
              aria-label="Source"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All sources</SelectItem>
                {SOURCES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>

          <Select
            value={level}
            onValueChange={(value) => {
              setLevel(value as ErrorLevel | "all");
              setOffset(0);
            }}
          >
            <SelectTrigger
              className="h-8 w-[116px] text-[13px]"
              aria-label="Level"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All levels</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>

          {jobId && (
            <Badge
              variant="outline"
              className="h-8 gap-1.5 rounded-full px-2.5 font-normal"
              title={jobId}
            >
              Job {jobId.slice(0, 8)}
              <button
                type="button"
                aria-label="Clear job filter"
                className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={clearJob}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          )}

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
          <AlertTitle>Couldn’t load errors</AlertTitle>
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

      {!(error && scopedRows.length === 0) && (
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
                    <WarningCircle aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No company selected</EmptyTitle>
                  <EmptyDescription>
                    Add a company to start capturing errors.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/knowledge/ingest">Add a company</Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : scopedRows.length === 0 ? (
              <Empty className="py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <WarningCircle aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasFilters ? "No matching errors" : "No errors captured"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasFilters
                      ? "Nothing matches this search and filter combination."
                      : "Failures from the API, workers, and runtime will appear here as they happen."}
                  </EmptyDescription>
                </EmptyHeader>
                {hasFilters && (
                  <EmptyContent>
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 w-[132px] text-xs">Source</TableHead>
                    <TableHead className="h-9 w-[100px] text-xs">Level</TableHead>
                    <TableHead className="h-9 min-w-[300px] text-xs">
                      Message
                    </TableHead>
                    <TableHead className="h-9 w-[200px] text-xs">Route</TableHead>
                    <TableHead className="h-9 w-[76px] text-xs">Status</TableHead>
                    <TableHead className="h-9 w-[136px] text-right text-xs">
                      Time
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scopedRows.map((row) => {
                    const route =
                      contextValue(row.context, "path") ??
                      contextValue(row.context, "stage");
                    const status =
                      contextValue(row.context, "status") ??
                      contextValue(row.context, "code");

                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        tabIndex={0}
                        onClick={() => setSelected(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(row);
                          }
                        }}
                      >
                        <TableCell className="py-2.5">
                          <SourceCell source={row.source} />
                        </TableCell>
                        <TableCell className="py-2.5">
                          <LevelBadge level={row.level} />
                        </TableCell>
                        <TableCell className="max-w-0 py-2.5">
                          <span
                            className="line-clamp-2 text-[13px]"
                            title={row.message}
                          >
                            {row.message}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-0 py-2.5">
                          <span
                            className="block truncate font-mono text-[11px] text-muted-foreground"
                            title={route ?? undefined}
                          >
                            {route ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 font-mono text-xs tabular-nums text-muted-foreground">
                          {status ?? "—"}
                        </TableCell>
                        <TableCell className="py-2.5 text-right font-sans text-xs tabular-nums text-muted-foreground">
                          <span title={formatDateTime(row.createdAt)}>
                            {formatTime(row.createdAt)}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
          <SheetContent className="w-full overflow-y-auto sm:max-w-[560px]">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <LevelBadge level={selected.level} />
                <span className="font-mono text-sm">{selected.source}</span>
              </SheetTitle>
              <SheetDescription>
                {formatDateTime(selected.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <div className="break-words rounded-md border bg-muted/30 p-3 text-[13px] leading-relaxed">
                {selected.message}
              </div>

              <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                <dt className="text-muted-foreground">ID</dt>
                <dd className="break-all font-mono text-[11px]">
                  {selected.id}
                </dd>

                <dt className="text-muted-foreground">Company</dt>
                <dd className="break-all">{companyName}</dd>

                <dt className="text-muted-foreground">Route</dt>
                <dd className="break-all font-mono text-[11px]">
                  {contextValue(selected.context, "path") ?? "—"}
                </dd>

                <dt className="text-muted-foreground">Stage</dt>
                <dd className="break-all font-mono text-[11px]">
                  {contextValue(selected.context, "stage") ?? "—"}
                </dd>

                <dt className="text-muted-foreground">Status</dt>
                <dd className="font-mono text-[11px]">
                  {contextValue(selected.context, "status") ??
                    contextValue(selected.context, "code") ??
                    "—"}
                </dd>

                <dt className="text-muted-foreground">Job</dt>
                <dd className="break-all font-mono text-[11px]">
                  {contextValue(selected.context, "jobId") ?? "—"}
                </dd>
              </dl>

              {selected.stack && (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-medium">Stack</h3>
                  <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                    {selected.stack}
                  </pre>
                </div>
              )}

              {selected.context && (
                <div>
                  <h3 className="mb-1.5 text-[13px] font-medium">Context</h3>
                  <pre className="max-h-[320px] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(selected.context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}

export default function ErrorsPage() {
  return (
    <StudioShell crumbs={[{ label: "Operations" }, { label: "Errors" }]}>
      <Suspense fallback={<ErrorsFallback />}>
        <ErrorsContent />
      </Suspense>
    </StudioShell>
  );
}
