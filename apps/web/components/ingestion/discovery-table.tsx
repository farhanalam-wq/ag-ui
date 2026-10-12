"use client";

import React, { useState, useMemo } from "react";
import {
  MagnifyingGlass,
  CheckSquare,
  Square,
  ArrowSquareOut,
  CircleNotch,
} from "@phosphor-icons/react";
import type { DiscoveryResponse } from "@/lib/api-client";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DiscoveryTableProps {
  discovery: DiscoveryResponse;
  selectedUrls: Set<string>;
  onToggleUrl: (url: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectTopN: (n: number) => void;
  onApplyRange: (rangeStr: string) => void;
  onStartIngest: () => void;
  isStarting?: boolean;
}

/** Compact 1-based window: 1 … c-1 c c+1 … T (all pages when ≤7). */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const keep = new Set(
    [1, 2, current - 1, current, current + 1, total - 1, total].filter(
      (n) => n >= 1 && n <= total
    )
  );
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    out.push(n);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) out.push("…");
  });
  return out;
}

export function DiscoveryTable({
  discovery,
  selectedUrls,
  onToggleUrl,
  onSelectAll,
  onSelectNone,
  onSelectTopN,
  onApplyRange,
  onStartIngest,
  isStarting = false,
}: DiscoveryTableProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [rangeInput, setRangeInput] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const { pages, info } = discovery;

  // Categories list with counts
  const categoriesWithCounts = useMemo(() => {
    const list: { key: string; label: string; count: number }[] = [
      { key: "all", label: "All pages", count: pages.length },
    ];
    if (info?.byCategory) {
      for (const [cat, count] of Object.entries(info.byCategory)) {
        list.push({ key: cat, label: cat.charAt(0).toUpperCase() + cat.slice(1), count });
      }
    }
    return list;
  }, [pages, info]);

  // Filtered pages by category and search
  const filteredPages = useMemo(() => {
    return pages.filter((p) => {
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch =
        !searchQuery.trim() ||
        p.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [pages, activeCategory, searchQuery]);

  // Rank lookup in O(1): original position survives filtering and paging.
  const rankByUrl = useMemo(() => {
    const map = new Map<string, number>();
    pages.forEach((p, i) => {
      if (!map.has(p.url)) map.set(p.url, i + 1);
    });
    return map;
  }, [pages]);

  // Page resets whenever the result set changes shape.
  React.useEffect(() => {
    setPage(1);
  }, [activeCategory, searchQuery, pages, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredPages.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filteredPages.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  const rangeStart = filteredPages.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, filteredPages.length);

  const handleRangeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeInput.trim()) return;
    onApplyRange(rangeInput.trim());
  };

  // Estimated crawl duration
  const estWaves = Math.ceil(selectedUrls.size / 25);
  const estTimeSec = (estWaves * 1.5).toFixed(1);

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* Telemetry strip */}
      <Card>
        <CardContent className="pt-5">
          <div className="grid grid-cols-2 gap-y-4 md:grid-cols-4 md:divide-x md:divide-border">
            <div className="min-w-0 pr-4">
              <p className="text-[13px] text-muted-foreground">Discovered</p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {pages.length.toLocaleString()}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  URLs
                </span>
              </p>
            </div>
            <div className="min-w-0 pr-4 md:px-5">
              <p className="text-[13px] text-muted-foreground">
                Discovery time
              </p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {(info.durationMs / 1000).toFixed(2)}s
              </p>
            </div>
            <div className="min-w-0 pr-4 md:px-5">
              <p className="text-[13px] text-muted-foreground">Sources</p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {info.sitemapsFollowed?.length || (info.robotsSitemaps ? 1 : 0)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  sitemaps
                </span>
              </p>
            </div>
            <div className="min-w-0 md:pl-5">
              <p className="text-[13px] text-muted-foreground">
                Selected to crawl
              </p>
              <p className="mt-1 font-sans text-xl font-semibold tabular-nums tracking-tight">
                {selectedUrls.size}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  pages · ~{estTimeSec}s
                </span>
              </p>
            </div>
          </div>
          <p className="mt-4 border-t pt-3 text-[13px] text-muted-foreground">
            Ranked by importance. Thin and duplicate pages are pruned
            automatically during the crawl.
          </p>
        </CardContent>
      </Card>

      {/* Category filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {categoriesWithCounts.map((c) => (
          <Button
            key={c.key}
            type="button"
            variant={activeCategory === c.key ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={() => setActiveCategory(c.key)}
          >
            {c.label}
            <Badge
              variant="outline"
              className="ml-1 rounded-full px-1.5 font-mono text-[10px] font-normal"
            >
              {c.count}
            </Badge>
          </Button>
        ))}
      </div>

      {/* Selection toolbar */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Quick select</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={onSelectAll}
              >
                All ({pages.length})
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => onSelectTopN(10)}
              >
                Top 10
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => onSelectTopN(20)}
              >
                Top 20
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => onSelectTopN(50)}
              >
                Top 50
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={onSelectNone}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form onSubmit={handleRangeSubmit}>
              <label
                htmlFor="discovery-range"
                className="text-xs text-muted-foreground"
              >
                Pick by rank, like 1 to 20 plus 35
              </label>
              <div className="mt-1.5 flex items-center gap-1.5">
                <Input
                  id="discovery-range"
                  type="text"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  placeholder="1-20, 35"
                  className="h-8 w-32 font-mono text-xs"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                >
                  Apply
                </Button>
              </div>
            </form>
            <div>
              <label
                htmlFor="discovery-search"
                className="text-xs text-muted-foreground"
              >
                Search
              </label>
              <div className="relative mt-1.5">
                <MagnifyingGlass className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="discovery-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter URLs"
                  className="h-8 w-40 pl-8 text-xs sm:w-48"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discovered URLs ledger */}
      <Card className="min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-[15px] font-semibold">
            Discovered pages ({filteredPages.length})
          </CardTitle>
          <CardDescription className="text-[13px]">
            Uncheck thin or off-topic pages so answers stay sharp.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="max-h-[60vh] overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 h-8 w-10 bg-card text-center shadow-[0_1px_0_var(--border)]">
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedUrls.size === pages.length) onSelectNone();
                      else onSelectAll();
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Toggle all pages"
                  >
                    {selectedUrls.size === pages.length ? (
                      <CheckSquare className="size-4 text-primary" />
                    ) : (
                      <Square className="size-4" />
                    )}
                  </button>
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-8 w-12 bg-card text-center text-xs shadow-[0_1px_0_var(--border)]">
                  Rank
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-8 w-20 bg-card text-xs shadow-[0_1px_0_var(--border)]">Priority</TableHead>
                <TableHead className="sticky top-0 z-10 h-8 w-28 bg-card text-xs shadow-[0_1px_0_var(--border)]">Category</TableHead>
                <TableHead className="sticky top-0 z-10 h-8 bg-card text-xs shadow-[0_1px_0_var(--border)]">Target URL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-10 text-center">
                    <p className="text-sm font-medium">No pages match</p>
                    <p className="mt-1 text-[13px] text-muted-foreground">
                      Clear the search or pick another category.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((p) => {
                  const isSelected = selectedUrls.has(p.url);
                  const originalIndex = rankByUrl.get(p.url) ?? 0;
                  return (
                    <TableRow
                      key={p.url}
                      tabIndex={0}
                      className="cursor-pointer focus-visible:bg-accent focus-visible:outline-none"
                      onClick={() => onToggleUrl(p.url)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onToggleUrl(p.url);
                        }
                      }}
                    >
                    <TableCell
                      className="py-2 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => onToggleUrl(p.url)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={`Toggle ${p.url}`}
                      >
                        {isSelected ? (
                          <CheckSquare className="size-4 text-primary" />
                        ) : (
                          <Square className="size-4" />
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="py-2 text-center font-sans text-xs tabular-nums text-muted-foreground">
                      {originalIndex}
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="outline"
                        className="rounded font-mono text-[10px] font-normal"
                      >
                        {p.priority}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2">
                      <Badge
                        variant="secondary"
                        className="rounded-full text-[11px] font-normal"
                      >
                        {p.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-0 py-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px]">
                        <span className="block truncate" title={p.url}>
                          {p.url}
                        </span>
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          title="Open URL in new tab"
                        >
                          <ArrowSquareOut className="size-3" />
                        </a>
                      </span>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          </div>

          {/* Pagination bar */}
          {filteredPages.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-border pt-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs tabular-nums text-muted-foreground">
                Showing {rangeStart}–{rangeEnd} of {filteredPages.length}
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((v) => Math.max(1, v - 1));
                      }}
                      aria-disabled={safePage === 1}
                      className={
                        safePage === 1
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                    />
                  </PaginationItem>
                  {pageWindow(safePage, totalPages).map((n, i) =>
                    n === "…" ? (
                      <PaginationItem key={`gap-${i}`}>
                        <PaginationEllipsis />
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={n}>
                        <PaginationLink
                          isActive={n === safePage}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(n);
                          }}
                        >
                          {n}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((v) => Math.min(totalPages, v + 1));
                      }}
                      aria-disabled={safePage === totalPages}
                      className={
                        safePage === totalPages
                          ? "pointer-events-none opacity-50"
                          : undefined
                      }
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="discovery-page-size"
                  className="text-xs text-muted-foreground"
                >
                  Rows
                </label>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => setPageSize(Number(v))}
                >
                  <SelectTrigger
                    id="discovery-page-size"
                    className="h-8 w-20 text-xs"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer bar */}
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[13px] text-muted-foreground">
            <span className="font-sans font-semibold tabular-nums text-foreground">
              {selectedUrls.size} of {pages.length} pages selected
            </span>{" "}
            · about {estWaves} crawl {estWaves === 1 ? "wave" : "waves"}
          </div>
          <Button
            type="button"
            disabled={selectedUrls.size === 0 || isStarting}
            onClick={onStartIngest}
          >
            {isStarting ? (
              <>
                <CircleNotch
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
                Starting pipeline
              </>
            ) : (
              <>Start ingestion ({selectedUrls.size})</>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
