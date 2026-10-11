"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Globe, Key, Plus, Trash } from "@phosphor-icons/react";
import { toast } from "sonner";
import { StudioShell } from "@/components/studio-shell";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, type WidgetKeyDomain, type WidgetKeyListItem } from "@/lib/api-client";
import { useCompanyKeys } from "@/components/integration/use-company-keys";
import { useSelectedCompany } from "@/stores/use-company-store";

function KeyDomainsSection({ k }: { k: WidgetKeyListItem }) {
  const [domains, setDomains] = useState<WidgetKeyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; origin: string } | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDomains(await apiClient.embed.listDomains(k.id));
    } catch (err: any) {
      setError(err.message || "Failed to load domains");
    } finally {
      setLoading(false);
    }
  }, [k.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!origin.trim() || adding) return;
    setAdding(true);
    setFormError(null);
    try {
      const d = await apiClient.embed.addDomain(k.id, { origin: origin.trim() });
      setDomains((prev) => [d, ...prev]);
      setOrigin("");
      toast.success("Origin added", {
        description: `${d.origin} is now allowlisted for this key.`,
      });
    } catch (err: any) {
      const message = err.message || "Failed to add origin";
      setFormError(message);
      toast.error("Failed to add origin", { description: message });
    } finally {
      setAdding(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget || removing) return;
    setRemoving(true);
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      await apiClient.embed.removeDomain(target.id);
      setDomains((prev) => prev.filter((d) => d.id !== target.id));
      toast.success("Origin removed", {
        description: `${target.origin} no longer allows this key.`,
      });
    } catch (err: any) {
      const message = err.message || "Failed to remove origin";
      setFormError(message);
      toast.error("Failed to remove origin", { description: message });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card className="min-w-0">
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold">{k.label}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{k.keyPrefix}...</span>
          <Badge variant="outline" className="rounded-full font-normal">
            <span
              className={`mr-1.5 size-1.5 rounded-full ${k.revoked ? "bg-muted-foreground/40" : "bg-emerald-500"}`}
            />
            {k.revoked ? "revoked" : "active"}
          </Badge>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-destructive">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </div>
        ) : domains.length === 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 font-mono text-[11px] text-muted-foreground">
            No origins - this key works on any site. Add one to lock it down.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-left font-mono text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Origin</th>
                  <th className="px-3 py-2 font-medium">Paths</th>
                  <th className="px-3 py-2 font-medium text-right">Added</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {domains.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono">{d.origin}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">
                      {d.includePaths.join(", ")}
                      {d.excludePaths.length > 0 && (
                        <span> - excl {d.excludePaths.join(", ")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setRemoveTarget({ id: d.id, origin: d.origin })}
                        disabled={removing}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive disabled:opacity-50"
                        title="Remove origin"
                        aria-label={`Remove ${d.origin}`}
                      >
                        <Trash className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!k.revoked && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="https://company.com"
                spellCheck={false}
                className="font-mono"
                aria-label={`Add origin for ${k.label}`}
              />
              <Button variant="outline" size="sm" onClick={handleAdd} disabled={!origin.trim() || adding}>
                <Plus />
                <span>{adding ? "Adding..." : "Add"}</span>
              </Button>
            </div>
            {formError && (
              <p role="alert" className="font-mono text-[11px] text-destructive">
                {formError}
              </p>
            )}
            <p className="font-mono text-[11px] text-muted-foreground">
              Exact origins only (scheme + host). Paths default to all; use [data-conversion] markers for conversion tracking.
            </p>
          </div>
        )}
      </CardContent>
      <AlertDialog
        open={removeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !removing) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeTarget?.origin}?</AlertDialogTitle>
            <AlertDialogDescription>
              Embeds on this origin stop working immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep origin</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
            >
              {removing ? "Removing..." : "Remove origin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function AllowedDomainsPage() {
  const selected = useSelectedCompany();
  const { keys, loading, error, reload } = useCompanyKeys(selected?.id ?? null);

  return (
    <StudioShell crumbs={[{ label: "Integration" }, { label: "Allowed Domains" }]}>
      <div className="w-full min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">Allowed Domains</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              Lock each widget key to the sites allowed to use it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/integration/embed-snippet">
                <ArrowLeft className="size-3.5" aria-hidden="true" />
                Back to snippet
              </Link>
            </Button>
          </div>
        </div>

        {!selected ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Globe aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No company selected</EmptyTitle>
              <EmptyDescription>
                Ingest a company first, then lock its keys to domains here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" asChild>
                <Link href="/knowledge/ingest">Go to Ingest</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-destructive">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={reload}>Retry</Button>
          </div>
        ) : keys.length === 0 ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Key aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No widget keys</EmptyTitle>
              <EmptyDescription>
                Issue a key from the Embed Snippet page first.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" asChild>
                <Link href="/integration/embed-snippet">Go to Embed Snippet</Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-4">
            {keys.map((k) => (
              <KeyDomainsSection key={k.id} k={k} />
            ))}
          </div>
        )}
      </div>
    </StudioShell>
  );
}
