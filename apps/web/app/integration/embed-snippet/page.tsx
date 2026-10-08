"use client";

import Link from "next/link";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { EmbedSnippetStudio } from "@/components/integration/embed-snippet-studio";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

export default function EmbedSnippetPage() {
  const companies = useCompanyStore((s) => s.companies);
  const selected = useSelectedCompany();

  return (
    <StudioShell crumbs={[{ label: "Integration" }, { label: "Embed Snippet" }]}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6 w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">Embed Snippet</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              One script tag turns any site into this company&apos;s assistant.
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
              href="/integration/allowed-domains"
              className="text-[11px] font-mono text-zinc-500 hover:text-zinc-200 transition-colors"
            >
              Lock this key to domains →
            </Link>
          </div>
        </div>

        {!selected ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-8 text-center space-y-3">
            <div className="text-sm font-semibold text-zinc-200">No company yet</div>
            <p className="text-sm text-muted-foreground">
              Ingest a company first, then its snippet appears here.
            </p>
            <Link href="/knowledge/ingest">
              <Button size="sm">Go to Ingest</Button>
            </Link>
          </div>
        ) : (
          <EmbedSnippetStudio
            companyId={selected.id}
            companyName={selected.name}
            brandColor={selected.brandColor || "#3b82f6"}
          />
        )}
      </div>
    </StudioShell>
  );
}
