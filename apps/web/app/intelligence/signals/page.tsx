"use client";

/**
 * Intelligence → Signals.
 *
 * The approval queue for FAQ patches drafted from the Intent Radar. The
 * radar sends a blindspot cluster over (?cluster=&question=); this page
 * shows it as a pending request and the generation call grounds the draft
 * in the company's knowledge base — refusing, never inventing.
 *
 * Unlike the radar, this is a workspace, not a report: no range control,
 * no freshness — drafts are decisions with timestamps, not windowed
 * measurements. The shell is the same Studio shell the rest of the
 * product uses.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Buildings } from "@phosphor-icons/react";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useSelectedCompany } from "@/stores/use-company-store";
import { SignalsView, type PendingDraftRequest } from "./signals-view";

export default function SignalsPage() {
  return (
    <Suspense fallback={<SignalsFallback />}>
      <Signals />
    </Suspense>
  );
}

function Signals() {
  const company = useSelectedCompany();
  const searchParams = useSearchParams();

  // The radar hands over both parts of a cluster request: the normalised
  // wording (the grouping key) and the display question. One without the
  // other is not a request — a key with no question has nothing to retrieve
  // for, a question with no key could duplicate an existing draft.
  const clusterKey = searchParams.get("cluster");
  const question = searchParams.get("question");
  const pending: PendingDraftRequest | null =
    company && clusterKey && question
      ? { clusterKey, question }
      : null;

  return (
    <StudioShell crumbs={[{ label: "Intelligence" }, { label: "Signals" }]}>
      <div className="min-w-0">
        {/* PageHeader — same shape as Knowledge → Sources */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold leading-9 tracking-tight">
              Signals
            </h1>
            <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
              FAQ patches drafted from the Intent Radar's blindspots, each
              grounded in your own knowledge base and waiting on a human
              decision.
            </p>
          </div>
          {company && (
            <Badge variant="outline" className="rounded-full font-normal">
              <span className="mr-1.5 size-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              No CMS push yet — approval publishes nothing (Phase 2)
            </Badge>
          )}
        </div>

        {!company ? (
          <Empty className="mt-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Buildings aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No company selected</EmptyTitle>
              <EmptyDescription>
                Pick a company to work its draft queue.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <SignalsView companyId={company.id} pending={pending} />
        )}
      </div>
    </StudioShell>
  );
}

function SignalsFallback() {
  return (
    <StudioShell crumbs={[{ label: "Intelligence" }, { label: "Signals" }]}>
      <div>
        <Skeleton className="h-9 w-32" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    </StudioShell>
  );
}
