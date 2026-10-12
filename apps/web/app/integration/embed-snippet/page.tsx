"use client";

import Link from "next/link";
import { Buildings, Lock } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { EmbedSnippetStudio } from "@/components/integration/embed-snippet-studio";
import { useSelectedCompany } from "@/stores/use-company-store";

export default function EmbedSnippetPage() {
  const selected = useSelectedCompany();

  return (
    <StudioShell crumbs={[{ label: "Integration" }, { label: "Embed Snippet" }]}>
      <div className="w-full min-w-0 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] leading-9 tracking-tight font-semibold">Embed Snippet</h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-[65ch]">
              One script tag turns any site into this company&apos;s assistant.
            </p>
          </div>
          {selected && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href="/integration/allowed-domains">
                  <Lock className="size-3.5" aria-hidden="true" />
                  Lock key to domains
                </Link>
              </Button>
            </div>
          )}
        </div>

        {!selected ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Buildings aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No company selected</EmptyTitle>
              <EmptyDescription>
                Ingest a company first, then its snippet appears here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" asChild>
                <Link href="/knowledge/ingest">Go to Ingest</Link>
              </Button>
            </EmptyContent>
          </Empty>
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
