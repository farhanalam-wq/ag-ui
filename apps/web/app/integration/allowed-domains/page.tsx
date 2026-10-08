"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Globe, Plus, Trash } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, type WidgetKeyDomain, type WidgetKeyListItem } from "@/lib/api-client";
import { useCompanyKeys } from "@/components/integration/use-company-keys";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

function KeyDomainsSection({ k }: { k: WidgetKeyListItem }) {
  const [domains, setDomains] = useState<WidgetKeyDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    } catch (err: any) {
      setFormError(err.message || "Failed to add origin");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    if (!window.confirm("Remove this origin? Embeds on it stop working immediately.")) return;
    try {
      await apiClient.embed.removeDomain(id);
      setDomains((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      setFormError(err.message || "Failed to remove origin");
    }
  };

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-200">{k.label}</span>
        <span className="text-[11px] font-mono text-zinc-500">{k.keyPrefix}…</span>
        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
            k.revoked
              ? "border-zinc-700 text-zinc-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          }`}
        >
          {k.revoked ? "revoked" : "active"}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : error ? (
        <div className="text-xs text-red-300 font-mono">
          {error}{" "}
          <button type="button" onClick={load} className="underline hover:text-red-200">
            Retry
          </button>
        </div>
      ) : domains.length === 0 ? (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-200/90 font-mono">
          No origins — this key works on any site. Add one to lock it down.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-900/60 sticky top-0">
              <tr className="text-left text-zinc-500 font-mono">
                <th className="px-3 py-2 font-medium">Origin</th>
                <th className="px-3 py-2 font-medium">Paths</th>
                <th className="px-3 py-2 font-medium text-right">Added</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {domains.map((d) => (
                <tr key={d.id} className="hover:bg-zinc-900/40">
                  <td className="px-3 py-2 font-mono text-zinc-200">{d.origin}</td>
                  <td className="px-3 py-2 font-mono text-zinc-400">
                    {d.includePaths.join(", ")}
                    {d.excludePaths.length > 0 && (
                      <span className="text-zinc-500"> · excl {d.excludePaths.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-500 text-right">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(d.id)}
                      className="p-1.5 rounded-md text-zinc-500 hover:text-red-300 hover:bg-zinc-800 transition-colors"
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
              <span>{adding ? "Adding…" : "Add"}</span>
            </Button>
          </div>
          {formError && <p className="text-[11px] font-mono text-red-300">{formError}</p>}
          <p className="text-[11px] font-mono text-zinc-500">
            Exact origins only (scheme + host). Paths default to all; use [data-conversion] markers for conversion tracking.
          </p>
        </div>
      )}
    </div>
  );
}

export default function AllowedDomainsPage() {
  const companies = useCompanyStore((s) => s.companies);
  const selected = useSelectedCompany();
  const { keys, loading, error, reload } = useCompanyKeys(selected?.id ?? null);

  return (
    <StudioShell crumbs={[{ label: "Integration" }, { label: "Allowed Domains" }]}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">Allowed Domains</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              Lock each widget key to the sites allowed to use it.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {companies.length > 1 && (
              <select
                aria-label="Select company"
                value={selected?.id ?? ""}
                onChange={(e) => useCompanyStore.getState().select(e.target.value)}
                className="h-9 px-3 rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 font-mono"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              href="/integration/embed-snippet"
              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              ← Back to snippet
            </Link>
          </div>
        </div>

        {!selected ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center space-y-3">
            <Globe className="size-6 text-zinc-500 mx-auto" />
            <div className="text-sm font-semibold text-zinc-200">No company yet</div>
            <p className="text-sm text-muted-foreground">
              Ingest a company first, then lock its keys to domains here.
            </p>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : error ? (
          <div className="text-xs text-red-300 font-mono">
            {error}{" "}
            <button type="button" onClick={reload} className="underline hover:text-red-200">
              Retry
            </button>
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center space-y-3">
            <div className="text-sm font-semibold text-zinc-200">No widget keys</div>
            <p className="text-sm text-muted-foreground">
              Issue a key from the Embed Snippet page first.
            </p>
          </div>
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
