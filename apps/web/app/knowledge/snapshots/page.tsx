"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  return (
    <Badge variant="outline" className="rounded-full font-normal">
      <CircleNotch className="mr-1 size-3 animate-spin" aria-hidden="true" />
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </Badge>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  const [rollbackTarget, setRollbackTarget] = useState<{
    major: number;
    minor: number;
    label: string;
  } | null>(null);
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

  const handleRollback = useCallback(async () => {
    if (!selectedCompany || !rollbackTarget) return;
    setRollingBack(true);
    try {
      await apiClient.uploads.rollback(
        selectedCompany.id,
        rollbackTarget.major,
        rollbackTarget.minor
      );
      toast.success(`Rolled back to ${rollbackTarget.label}`, {
        description: "Answers follow that snapshot from here on.",
      });
      setRollbackTarget(null);
      await refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Rollback failed";
      setError(message);
      toast.error("Rollback failed", { description: message });
    } finally {
      setRollingBack(false);
    }
  }, [rollbackTarget, selectedCompany, refresh]);

  const rollbackButton = (label: string, major: number, minor: number) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs font-normal"
      title={`Roll back to ${label}`}
      onClick={() => setRollbackTarget({ major, minor, label })}
    >
      <ArrowCounterClockwise className="size-3.5" aria-hidden="true" />
      {label}
    </Button>
  );

  const urlList = (label: string, entries?: { url: string; title: string }[]) => {
    if (!entries || entries.length === 0) return null;
    return (
      <div className="mt-2">
        <p className="text-xs text-muted-foreground">
          {label} ({entries.length})
        </p>
        <ul className="mt-1 space-y-0.5">
          {entries.map((e) => (
            <li
              key={e.url}
              className="truncate font-mono text-[11px] text-muted-foreground"
              title={e.url}
            >
              {e.title || e.url}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const currentId = versions.find((v) => v.status === "READY")?.id ?? null;
  const liveReady = currentId !== null;

  return (
    <StudioShell crumbs={[{ label: "Knowledge" }, { label: "Snapshots" }]}>
      <div className="min-w-0">
        {/* PageHeader */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">
              Snapshots
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              Version history for the selected assistant. Crawls are majors,
              uploads are minors.
            </p>
          </div>
          {selectedCompany && (
            <Badge variant="outline" className="rounded-full font-normal">
              <span
                className={`mr-1.5 size-1.5 rounded-full ${
                  liveReady ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
              {liveReady ? "All OK" : "Indexing"}
            </Badge>
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
                Pick a company to inspect its version history.
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
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-[13px]"
              >
                <p className="font-medium">Could not load snapshots</p>
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
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                  ))}
                </CardContent>
              </Card>
            ) : versions.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>No snapshots yet</EmptyTitle>
                  <EmptyDescription>
                    Crawl a site to create the first version.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => router.push("/knowledge/ingest")}>
                    Ingest a site
                    <ArrowRight className="size-4" data-icon="inline-end" />
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="min-w-0 space-y-4">
                {versions.map((v) => {
                  const isOpen = expanded.has(v.id);
                  const isCurrent = v.id === currentId;
                  const readyMinors = v.batches.filter((b) => b.status === "READY");
                  const maxMinor =
                    readyMinors.length > 0
                      ? Math.max(...readyMinors.map((b) => b.minor))
                      : 0;
                  const added = v.summary?.added?.length ?? 0;
                  const removed = v.summary?.removed?.length ?? 0;
                  const changed = v.summary?.changed?.length ?? 0;
                  const hasDiff = added + removed + changed > 0;
                  return (
                    <Card key={v.id} className="min-w-0">
                      <CardHeader className="pb-3">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                          <span className="inline-flex items-center gap-1.5 font-mono text-[15px] font-semibold tracking-tight">
                            <Globe
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                            v{v.version}
                            {maxMinor > 0 && `.${maxMinor}`}
                          </span>
                          {isCurrent && (
                            <Badge
                              variant="outline"
                              className="rounded-full border-emerald-500/30 bg-emerald-500/10 font-normal text-emerald-700 dark:text-emerald-300"
                            >
                              Current
                            </Badge>
                          )}
                          <StatusBadge status={v.status} />
                          {v.theme ? (
                            <Badge
                              variant="outline"
                              title={`Stylesheet ${v.theme.id.slice(0, 8)} · ${v.theme.status}`}
                              className="rounded-full font-mono text-[11px] font-normal"
                            >
                              themed · {v.theme.status}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              title="No stylesheet stamped for this version"
                              className="rounded-full font-mono text-[11px] font-normal text-muted-foreground"
                            >
                              no theme
                            </Badge>
                          )}
                          <span className="font-sans text-xs tabular-nums text-muted-foreground">
                            {timeAgo(v.createdAt)}
                          </span>
                          <span className="ms-auto">
                            {rollbackButton(
                              `Restore v${v.version}.0`,
                              v.version,
                              0
                            )}
                          </span>
                        </div>
                        <CardDescription className="text-[13px]">
                          {majorBrief(v)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-1 pt-0">
                        {v.batches.map((b) => (
                          <div
                            key={b.id}
                            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-1.5 text-[13px] hover:bg-muted/40"
                          >
                            <TrayArrowDown
                              className="size-3.5 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="font-mono text-xs">
                              v{v.version}.{b.minor}
                            </span>
                            <StatusBadge status={b.status} />
                            <span className="font-sans tabular-nums text-muted-foreground">
                              {b.fileCount} files · {b.docs} docs
                              {b.failed > 0 && ` · ${b.failed} failed`}
                            </span>
                            {b.status === "READY" && (
                              <span className="ms-auto">
                                {rollbackButton(
                                  `Restore v${v.version}.${b.minor}`,
                                  v.version,
                                  b.minor
                                )}
                              </span>
                            )}
                          </div>
                        ))}
                        {hasDiff && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => toggle(v.id)}
                          >
                            {isOpen ? (
                              <CaretDown
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            ) : (
                              <CaretRight
                                className="size-3.5"
                                aria-hidden="true"
                              />
                            )}
                            {isOpen
                              ? "Hide details"
                              : `Show details · +${added} −${removed} ~${changed}`}
                          </Button>
                        )}
                        {isOpen && (
                          <div className="pb-1">
                            {urlList("Added", v.summary?.added)}
                            {urlList("Removed", v.summary?.removed)}
                            {urlList("Changed", v.summary?.changed)}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <AlertDialog
          open={rollbackTarget !== null}
          onOpenChange={(open) => {
            if (!open && !rollingBack) setRollbackTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Roll back to {rollbackTarget?.label}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Answers revert to that snapshot. Newer additions leave the
                answers while earlier deletions come back, recorded as a new
                batch. Nothing is erased.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rollingBack}>
                Keep current
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={rollingBack}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={(e) => {
                  e.preventDefault();
                  void handleRollback();
                }}
              >
                {rollingBack ? "Rolling back" : "Roll back"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </StudioShell>
  );
}
