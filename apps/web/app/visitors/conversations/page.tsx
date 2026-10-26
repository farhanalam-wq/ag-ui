"use client";

/**
 * Visitors → Conversations (spec §9.1).
 *
 * Master list with filters (search, rating, time preset) and a read-only
 * transcript sheet: role bubbles, evidence chips, per-message ratings and the
 * visit context resolved through the cookieless session hash.
 */

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowClockwise,
  ChatCircleText,
  CheckCircle,
  MagnifyingGlass,
  Microphone,
  ThumbsDown,
  ThumbsUp,
  X,
} from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { useSelectedCompany } from "@/stores/use-company-store";
import {
  apiClient,
  type VisitorConversationRow,
  type VisitorTranscriptBundle,
} from "@/lib/api-client";
import { cn } from "@/lib/utils";
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

function RatingBadges({ up, down }: { up: number; down: number }) {
  if (up === 0 && down === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      {up > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs text-green-700 dark:text-green-400">
          <ThumbsUp className="size-3" aria-hidden="true" />
          {up}
        </span>
      )}
      {down > 0 && (
        <span className="inline-flex items-center gap-0.5 text-xs text-destructive">
          <ThumbsDown className="size-3" aria-hidden="true" />
          {down}
        </span>
      )}
    </span>
  );
}

function ConversationRating({ rating }: { rating: number }) {
  const Icon = rating === 1 ? ThumbsUp : ThumbsDown;
  const positive = rating === 1;
  return (
    <Icon
      className={cn(
        "size-3.5",
        positive ? "text-green-700 dark:text-green-400" : "text-destructive"
      )}
      aria-label={positive ? "Rated thumbs up" : "Rated thumbs down"}
    />
  );
}

function tzLabel(offset: number | null): string {
  if (offset === null) return "unknown";
  const sign = offset <= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** tzOffset from the collector is minutes EAST of UTC. */
function tzCity(offset: number | null): string {
  if (offset === null) return "unknown";
  const m = 60 - ((offset % 60) + 60) % 60;
  const h = ((offset + m) / 60).toFixed(2);
  const hh = Math.floor(offset / 60);
  return tzLabel(offset);
}

function TranscriptMessageBubble({
  role,
  content,
  rating,
}: {
  role: "user" | "assistant";
  content: string;
  rating: number | null;
}) {
  const isUser = role === "user";
  return (
    <div
      className={cn(
        "flex w-full gap-3",
        isUser ? "justify-start" : "justify-end"
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser
            ? "bg-muted text-foreground"
            : "bg-primary text-primary-foreground"
        )}
      >
        {content}
        <span
          className={cn(
            "mt-1 flex items-center gap-2 text-[10px]",
            isUser ? "text-muted-foreground" : "text-primary-foreground/70"
          )}
        >
          {isUser ? "Visitor" : "Assistant"}
          {rating !== null && <ConversationRating rating={rating} />}
        </span>
      </div>
    </div>
  );
}

function TranscriptSheet({
  conversationId,
  onOpenChange,
}: {
  conversationId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [bundle, setBundle] = useState<VisitorTranscriptBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conversationId) {
      setBundle(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiClient.visitors
      .conversation(conversationId)
      .then((res) => {
        if (!cancelled) setBundle(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load transcript");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  return (
    <Sheet open={conversationId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="text-base flex items-center gap-1.5">
            {bundle?.conversation.channel === "voice" && (
              <Microphone
                className="size-4 text-muted-foreground"
                aria-hidden="true"
                weight="fill"
              />
            )}
            {bundle?.conversation.title ?? "Transcript"}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {bundle?.conversation.channel === "voice"
              ? "Voice session — spoken lines transcribed by speech-to-text, no citations"
              : bundle?.conversation.path ?? "Unknown entry page"}
            {bundle ? ` · started ${formatTime(bundle.conversation.createdAt)}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-4/5" />
              ))}
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertTitle> Transcript unavailable</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {bundle && !loading && !error && (
            <div className="space-y-4">
              {bundle.session && (
                <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Visit</span>
                    <span>
                      {bundle.session.browser ?? "unknown"} on {bundle.session.os ?? "unknown"}
                      {bundle.session.device ? ` (${bundle.session.device})` : ""}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Timezone</span>
                    <span className="font-mono">{tzLabel(bundle.session.tzOffset)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pages seen</span>
                    <span>{bundle.session.pageviewCount ?? "—"}</span>
                  </div>
                  {bundle.session.converted && (
                    <div className="flex items-center justify-between text-green-700 dark:text-green-400">
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle className="size-3.5" aria-hidden="true" />
                        Converted
                      </span>
                      {bundle.session.revenue && (
                        <span className="font-mono">{bundle.session.revenue}</span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {bundle.messages.map((m) => (
                <div key={m.id} className="space-y-1">
                  <TranscriptMessageBubble
                    role={m.role}
                    content={m.content}
                    rating={m.role === "assistant" ? m.rating : null}
                  />
                  {m.role === "assistant" && m.evidence && m.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-6">
                      {m.evidence.slice(0, 4).map((ev, i) => {
                        const inner = (
                          <Badge
                            variant="outline"
                            className="max-w-[260px] truncate font-normal text-[11px]"
                          >
                            {ev.type === "fact" ? "Fact" : "Chunk"} · {ev.pageTitle ?? ev.sourceId ?? "source"}
                          </Badge>
                        );
                        return ev.url ? (
                          <Link key={i} href={ev.url} target="_blank" rel="noreferrer">
                            {inner}
                          </Link>
                        ) : (
                          <span key={i}>{inner}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
              {bundle.messages.length === 0 && (
                <p className="text-sm text-muted-foreground">No messages recorded.</p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ConversationsFallback() {
  return (
    <div className="min-w-0 space-y-4">
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function ConversationsView() {
  const searchParams = useSearchParams();
  const urlConversationId = searchParams.get("conversationId");

  const company = useSelectedCompany();
  const companyId = company?.id;

  const [rows, setRows] = useState<VisitorConversationRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [preset, setPreset] = useState<Preset>("30d");
  const [rating, setRating] = useState<"all" | "up" | "down">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (urlConversationId) setSelectedId(urlConversationId);
  }, [urlConversationId]);

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
      preset === "all" ? undefined : new Date(Date.now() - PRESETS.find((p) => p.value === preset)!.ms!).toISOString();

    setLoading(true);
    setError(null);
    apiClient.visitors
      .conversations({
        companyId,
        since,
        rating: rating === "all" ? undefined : rating === "up" ? 1 : -1,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset,
      })
      .then((res) => {
        if (cancelled) return;
        setRows(res.conversations);
        setTotal(res.total);
      })
      .catch((err) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : "Failed to load conversations");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, preset, rating, debouncedSearch, offset, refreshKey]);

  const hasFilters = preset !== "30d" || rating !== "all" || debouncedSearch !== "";
  const resetFilters = useCallback(() => {
    setPreset("30d");
    setRating("all");
    setSearch("");
    setOffset(0);
  }, []);

  return (
    <StudioShell crumbs={[{ label: "Visitors" }, { label: "Conversations" }]}>
      <div className="min-w-0 space-y-4 p-4 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Conversations</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Every chat a visitor had with your assistants — read transcripts,
              ratings and the visit context behind them.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={loading}
          >
            <ArrowClockwise className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
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
              placeholder="Search message text…"
              className="pl-8"
            />
          </div>
          <Select value={preset} onValueChange={(v) => { setPreset(v as Preset); setOffset(0); }}>
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
          <Select value={rating} onValueChange={(v) => { setRating(v as typeof rating); setOffset(0); }}>
            <SelectTrigger className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All ratings</SelectItem>
              <SelectItem value="up">
                <span className="inline-flex items-center gap-1.5">
                  <ThumbsUp className="size-3" aria-hidden="true" /> Thumbs up
                </span>
              </SelectItem>
              <SelectItem value="down">
                <span className="inline-flex items-center gap-1.5">
                  <ThumbsDown className="size-3" aria-hidden="true" /> Thumbs down
                </span>
              </SelectItem>
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
            <AlertTitle>Couldn&apos;t load conversations</AlertTitle>
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
                    {hasFilters ? "No conversations match these filters" : "No conversations yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasFilters
                      ? "Try widening the time range or clearing the search."
                      : "Once visitors chat with an embedded assistant, every conversation appears here."}
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
                    <TableHead className="w-[34%]">Conversation</TableHead>
                    <TableHead className="text-right">Messages</TableHead>
                    <TableHead>Visit</TableHead>
                    <TableHead>Ratings</TableHead>
                    <TableHead className="text-right w-[180px]">Last message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading
                    ? Array.from({ length: Math.min(rows.length, 8) }).map((_, i) => (
                        <TableRow key={`sk-${i}`}>
                          <TableCell colSpan={5}>
                            <Skeleton className="h-6 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    : rows.map((row) => (
                        <TableRow
                          key={row.id}
                          className="cursor-pointer"
                          onClick={() => setSelectedId(row.id)}
                        >
                          <TableCell className="max-w-[340px]">
                            <div className="flex items-center gap-1.5">
                              {row.channel === "voice" && (
                                <Microphone
                                  className="size-3.5 shrink-0 text-muted-foreground"
                                  aria-label="Voice conversation"
                                  weight="fill"
                                />
                              )}
                              <div className="truncate font-medium">{row.title}</div>
                            </div>
                            {row.path && (
                              <div className="truncate font-mono text-xs text-muted-foreground">
                                {row.path}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">
                            {row.messageCount}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.browser ?? "unknown"} · {row.os ?? "unknown"}
                          </TableCell>
                          <TableCell>
                            <RatingBadges up={row.ratingUp} down={row.ratingDown} />
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {row.lastMessageAt ? formatTime(row.lastMessageAt) : formatTime(row.createdAt)}
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
                  {Math.min(offset + 1, total)}–{Math.min(offset + PAGE_SIZE, total)} of {total}
                </span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setOffset((o) => o + PAGE_SIZE);
                  }}
                  className={cn(offset + PAGE_SIZE >= total && "pointer-events-none opacity-50")}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>

      <TranscriptSheet
        conversationId={selectedId}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </StudioShell>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={<ConversationsFallback />}>
      <ConversationsView />
    </Suspense>
  );
}
