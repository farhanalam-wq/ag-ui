"use client";

/**
 * Visitors → Leads (spec §9.2).
 *
 * The docket: one row per captured lead — contact details, BANT cues, tags,
 * extractor confidence and the pipeline status — with the originating
 * conversation one click away. Status moves are inline (optimistic, rolled
 * back on illegal transitions); the drawer holds the verbatims.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowClockwise,
  ChatCircleText,
  Copy,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { StudioShell } from "@/components/studio-shell";
import { useSelectedCompany } from "@/stores/use-company-store";
import {
  apiClient,
  type VisitorLeadDetail,
  type VisitorLeadRow,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Empty,
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
  { value: "7d", label: "Last 7 days", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "Last 30 days", ms: 30 * 24 * 60 * 60 * 1000 },
  { value: "90d", label: "Last 90 days", ms: 90 * 24 * 60 * 60 * 1000 },
  { value: "all", label: "All time", ms: null },
] as const;

type Preset = (typeof PRESETS)[number]["value"];

type LeadStatus = VisitorLeadRow["status"];

/** Mirrors `LEAD_STATUS_TRANSITIONS` in the database package. Keep in sync. */
const LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "QUALIFIED",
  "CONTACTED",
  "DISMISSED",
];
const LEAD_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NEW: ["QUALIFIED", "CONTACTED", "DISMISSED"],
  QUALIFIED: ["CONTACTED", "DISMISSED"],
  CONTACTED: ["DISMISSED"],
  DISMISSED: [],
};

const STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "New",
  QUALIFIED: "Qualified",
  CONTACTED: "Contacted",
  DISMISSED: "Dismissed",
};

/** Few semantic colours: pipeline state, one class per state. */
const STATUS_CLASSES: Record<LeadStatus, string> = {
  NEW: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300",
  QUALIFIED:
    "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-300",
  CONTACTED:
    "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-300",
  DISMISSED: "bg-muted text-muted-foreground",
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

function leadDisplayName(row: VisitorLeadRow): string {
  return row.contactName?.trim() || row.email || row.phone || "Unnamed lead";
}

function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() =>
        copyToClipboard(value, {
          successTitle: `${label} copied`,
        })
      }
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left font-mono text-xs hover:bg-accent"
      title={`Copy ${label}`}
    >
      <span className="truncate">{value}</span>
      <Copy
        className="size-3 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

function ConfidenceMeter({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="flex items-center gap-2" title={`Extractor confidence ${pct}%`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 75
              ? "bg-green-600"
              : pct >= 50
                ? "bg-amber-500"
                : "bg-destructive"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

const BANT_ROWS: Array<{ key: string; label: string }> = [
  { key: "budget", label: "Budget" },
  { key: "authority", label: "Authority" },
  { key: "need", label: "Need" },
  { key: "timeline", label: "Timeline" },
];

/**
 * One inline status change. Optimistic: the row flips immediately; an illegal
 * or failed move rolls back and surfaces the API's message.
 */
function useLeadStatusChanger(
  rows: VisitorLeadRow[],
  setRows: (update: (prev: VisitorLeadRow[]) => VisitorLeadRow[]) => void
) {
  return useCallback(
    async (leadId: string, status: LeadStatus) => {
      const previous = rows.find((r) => r.id === leadId);
      if (!previous || previous.status === status) return;

      // Optimistic write.
      setRows((prev) =>
        prev.map((r) => (r.id === leadId ? { ...r, status } : r))
      );
      try {
        const res = await apiClient.visitors.updateLead(leadId, status);
        setRows((prev) =>
          prev.map((r) =>
            r.id === leadId
              ? {
                  ...r,
                  status: res.lead.status,
                  updatedAt: res.lead.updatedAt,
                }
              : r
          )
        );
        toast.success(`Lead marked ${STATUS_LABELS[status].toLowerCase()}`);
      } catch (err) {
        // Roll back to what the table had before the move.
        setRows((prev) =>
          prev.map((r) =>
            r.id === leadId ? { ...r, status: previous.status } : r
          )
        );
        toast.error(
          err instanceof Error && err.message
            ? err.message
            : "Could not update the lead status"
        );
      }
    },
    [rows, setRows]
  );
}

function LeadStatusSelect({ lead }: { lead: VisitorLeadRow }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
          STATUS_CLASSES[lead.status]
        )}
      >
        {STATUS_LABELS[lead.status]}
      </span>
    </div>
  );
}

/**
 * Drawer: contact block, confidence, pipeline buttons, BANT verbatims, tags,
 * first-message quote and a deep link to the conversation transcript.
 */
function LeadDrawer({
  leadId,
  rows,
  onOpenChange,
  onLeadUpdated,
}: {
  leadId: string | null;
  rows: VisitorLeadRow[];
  onOpenChange: (open: boolean) => void;
  onLeadUpdated: (leadId: string, status: LeadStatus, updatedAt: string) => void;
}) {
  const [detail, setDetail] = useState<VisitorLeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState(false);

  // The row passed from the table keeps the drawer honest while the fetch
  // runs and after failure: drawer truth = table truth = server truth.
  const tableLead = rows.find((r) => r.id === leadId) ?? null;

  useEffect(() => {
    if (!leadId) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient.visitors
      .lead(leadId)
      .then((res) => {
        if (!cancelled) setDetail(res.lead);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load lead");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  const move = async (status: LeadStatus) => {
    if (!leadId || !tableLead || pendingStatus) return;
    setPendingStatus(true);
    try {
      const res = await apiClient.visitors.updateLead(leadId, status);
      onLeadUpdated(leadId, res.lead.status, res.lead.updatedAt);
      setDetail((d) =>
        d && d.id === leadId
          ? { ...d, status: res.lead.status, updatedAt: res.lead.updatedAt }
          : d
      );
      toast.success(`Lead marked ${STATUS_LABELS[status].toLowerCase()}`);
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Could not update the lead status"
      );
    } finally {
      setPendingStatus(false);
    }
  };

  // Drawer truth: conversation identity from the fetched detail, live status
  // from the table row (keeps the drawer honest during optimistic updates).
  const shown: VisitorLeadDetail | null =
    detail && tableLead
      ? { ...tableLead, conversation: detail.conversation }
      : detail ?? null;
  const transitions = shown ? LEAD_TRANSITIONS[shown.status] : [];

  return (
    <Sheet open={leadId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="text-base">
            {shown ? leadDisplayName(shown) : "Lead"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {shown
              ? `Captured ${formatTime(shown.createdAt)} · updated ${formatTime(shown.updatedAt)}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )}
          {error && !loading && (
            <Alert variant="destructive">
              <AlertTitle>Lead unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {shown && !loading && !error && (
            <div className="space-y-5">
              {/* Pipeline controls. Dismissed is terminal; only forward moves
                  are offerable — the server still validates everything. */}
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Pipeline
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  {LEAD_STATUSES.map((s) => {
                    const reachable = transitions.includes(s);
                    return (
                      <Button
                        key={s}
                        size="sm"
                        variant={s === shown.status ? "secondary" : "outline"}
                        disabled={!reachable || pendingStatus}
                        onClick={() => move(s)}
                      >
                        {s === shown.status
                          ? STATUS_LABELS[s]
                          : `→ ${STATUS_LABELS[s]}`}
                      </Button>
                    );
                  })}
                </div>
              </section>

              {/* Contact */}
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Contact
                </h3>
                <div className="space-y-1.5 text-sm">
                  {shown.contactName && <div>{shown.contactName}</div>}
                  {shown.email ? (
                    <CopyField value={shown.email} label="email" />
                  ) : null}
                  {shown.phone ? (
                    <CopyField value={shown.phone} label="phone" />
                  ) : null}
                  {!shown.email && !shown.phone && (
                    <p className="text-sm text-muted-foreground">
                      No contact details offered.
                    </p>
                  )}
                </div>
              </section>

              {/* Confidence */}
              <section className="flex items-center gap-3">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Confidence
                </h3>
                <ConfidenceMeter value={shown.confidence} />
              </section>

              {/* BANT verbatims */}
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-muted-foreground">
                  Qualification cues
                </h3>
                <dl className="space-y-2">
                  {BANT_ROWS.map(({ key, label }) => {
                    const quote = shown.bant?.[key] ?? null;
                    return (
                      <div
                        key={key}
                        className="rounded-lg border bg-muted/40 p-2.5"
                      >
                        <dt className="mb-0.5 text-[11px] font-medium text-muted-foreground">
                          {label}
                        </dt>
                        <dd
                          className={cn(
                            "text-sm",
                            quote ? "leading-relaxed" : "text-muted-foreground"
                          )}
                        >
                          {quote ?? "—"}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              {/* Tags */}
              {(shown.techStack.length > 0 || shown.extraTags.length > 0) && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    Tags
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {shown.techStack.map((tag) => (
                      <Badge key={`stack-${tag}`} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                    {shown.extraTags.map((tag) => (
                      <Badge key={`extra-${tag}`} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </section>
              )}

              {/* Provenance: what surfaced the lead */}
              {shown.firstMessage && (
                <section className="space-y-2">
                  <h3 className="text-xs font-medium text-muted-foreground">
                    First message
                  </h3>
                  <blockquote className="rounded-lg border-l-2 border-l-primary/40 bg-muted/40 px-3 py-2 text-sm italic leading-relaxed">
                    {shown.firstMessage}
                  </blockquote>
                </section>
              )}

              {shown.conversation ? (
                <Button variant="outline" size="sm" asChild className="w-full">
                  <Link
                    href={`/visitors/conversations?conversationId=${shown.conversation.id}`}
                  >
                    <ChatCircleText className="size-4" aria-hidden="true" />
                    View transcript ({shown.conversation.title})
                  </Link>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Conversation no longer available for this lead.
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function LeadsFallback() {
  return (
    <div className="min-w-0 space-y-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function LeadsView() {
  const company = useSelectedCompany();
  const companyId = company?.id;

  const [rows, setRows] = useState<VisitorLeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [preset, setPreset] = useState<Preset>("30d");
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Company switch resets the whole view.
  const previousCompanyId = useRef<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    const previous = previousCompanyId.current;
    previousCompanyId.current = companyId;
    if (!previous || previous === companyId) return;
    setRows([]);
    setTotal(0);
    setOffset(0);
    setSelectedId(null);
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

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
        : new Date(
            Date.now() - PRESETS.find((p) => p.value === preset)!.ms!
          ).toISOString();

    setLoading(true);
    setError(null);
    apiClient.visitors
      .leads({
        companyId,
        since,
        status: status === "all" ? undefined : status,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.leads);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load leads"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, preset, status, debouncedSearch, offset, refreshKey]);

  const changeStatus = useLeadStatusChanger(rows, setRows);

  const hasFilters =
    preset !== "30d" || status !== "all" || debouncedSearch !== "";
  const resetFilters = useCallback(() => {
    setPreset("30d");
    setStatus("all");
    setSearch("");
    setOffset(0);
  }, []);

  return (
    <StudioShell crumbs={[{ label: "Visitors" }, { label: "Leads" }]}>
      <div className="min-w-0 space-y-4 p-4 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Leads</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Contacts captured from conversations — qualification cues,
              confidence and the pipeline, ready for follow-up.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            <ArrowClockwise
              className={cn("size-4", loading && "animate-spin")}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <MagnifyingGlass
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone, message…"
              className="pl-8"
            />
          </div>
          <Select
            value={preset}
            onValueChange={(v) => {
              setPreset(v as Preset);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRESETS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v as typeof status);
              setOffset(0);
            }}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="size-4" aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load leads</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && !loading && rows.length === 0 && (
          <Card>
            <CardContent className="p-0">
              <Empty>
                <EmptyHeader>
                  <EmptyMedia>
                    <ChatCircleText className="size-5" aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasFilters
                      ? "No leads match these filters"
                      : "No leads yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasFilters
                      ? "Try widening the time range or clearing the search."
                      : "Leads appear automatically when visitors share contact details to be contacted in a conversation."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          </Card>
        )}

        {rows.length > 0 && (
          <Card className="pt-0">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right w-[130px]">
                      Captured
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: Math.min(rows.length, 8) }).map(
                        (_, i) => (
                          <TableRow key={`sk-${i}`}>
                            <TableCell colSpan={6}>
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        )
                      )
                    : rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedId(row.id)}
                        >
                          <TableCell className="max-w-[280px]">
                            <div className="truncate font-medium">
                              {leadDisplayName(row)}
                            </div>
                            {row.conversationTitle && (
                              <div className="truncate text-xs text-muted-foreground">
                                {row.conversationTitle}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[220px]">
                            {row.email ? (
                              <div className="truncate font-mono text-xs">
                                {row.email}
                              </div>
                            ) : null}
                            {row.phone ? (
                              <div className="truncate font-mono text-xs text-muted-foreground">
                                {row.phone}
                              </div>
                            ) : null}
                            {!row.email && !row.phone && (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex max-w-[160px] flex-wrap gap-1">
                              {row.techStack.slice(0, 2).map((tag) => (
                                <Badge
                                  key={`s-${row.id}-${tag}`}
                                  variant="secondary"
                                  className="max-w-[100px] truncate text-[10px]"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {row.extraTags.slice(0, 2).map((tag) => (
                                <Badge
                                  key={`e-${row.id}-${tag}`}
                                  variant="outline"
                                  className="max-w-[100px] truncate text-[10px]"
                                >
                                  {tag}
                                </Badge>
                              ))}
                              {row.techStack.length + row.extraTags.length >
                                4 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +
                                  {row.techStack.length +
                                    row.extraTags.length -
                                    4}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  STATUS_CLASSES[row.status]
                                )}
                              >
                                {STATUS_LABELS[row.status]}
                              </span>
                              {LEAD_TRANSITIONS[row.status].length > 0 && (
                                <Select
                                  value={row.status}
                                  onValueChange={(v) => {
                                    const next = v as LeadStatus;
                                    if (next !== row.status) {
                                      void changeStatus(row.id, next);
                                    }
                                  }}
                                >
                                  <SelectTrigger
                                    className="h-6 w-[110px] px-2 text-[11px]"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <SelectValue placeholder="Move to…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {/* Forward moves only: illegal transitions
                                        are hidden — a dismissal of a dismissed
                                        lead is a no-op, not an option. */}
                                    {LEAD_TRANSITIONS[row.status].map((s) => (
                                      <SelectItem key={s} value={s}>
                                        {STATUS_LABELS[s]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <ConfidenceMeter value={row.confidence} />
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {formatTime(row.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {(total > PAGE_SIZE || offset > 0) && rows.length > 0 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setOffset((o) => Math.max(0, o - PAGE_SIZE));
                  }}
                  className={cn(offset === 0 && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="text-xs text-muted-foreground px-2">
                  {Math.min(offset + 1, total)}–
                  {Math.min(offset + PAGE_SIZE, total)} of {total}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setOffset((o) => o + PAGE_SIZE);
                  }}
                  className={cn(
                    offset + PAGE_SIZE >= total && "pointer-events-none opacity-50"
                  )}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      <LeadDrawer
        leadId={selectedId}
        rows={rows}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onLeadUpdated={(id, newStatus, updatedAt) => {
          setRows((prev) =>
            prev.map((r) =>
              r.id === id ? { ...r, status: newStatus, updatedAt } : r
            )
          );
        }}
      />
    </StudioShell>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsFallback />}>
      <LeadsView />
    </Suspense>
  );
}
