"use client";

/**
 * apps/web/app/intelligence/signals/signals-view.tsx
 *
 * Intelligence → Signals: the approval queue for FAQ patches drafted from
 * the Intent Radar's blindspots.
 *
 * The page is an inbox, not a publisher. Every draft sits in one of three
 * states — needs review, approved, dismissed — and the only transitions are
 * human ones: approve, dismiss, back to review. "Approved" is a state, not a
 * push; no CMS connector exists yet, and the header badge says so rather
 * than letting approval imply action.
 *
 * Generation is on demand and refuses honestly: the knowledge base returning
 * nothing is a `no-source` answer shown in place, not an error to retry
 * blindly — the fix is indexing the missing material first.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  CircleNotch,
  Copy,
  DownloadSimple,
  Sparkle,
  XCircle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiClient, ApiError } from "@/lib/api-client";
import type { SignalDraftRow, SignalDraftStatus } from "@/lib/api-client";

/* ------------------------------------------------------------------ */
/* Draft display helpers                                                */
/* ------------------------------------------------------------------ */

const STATUS_META: Record<
  SignalDraftStatus,
  { label: string; dot: string; hint: string }
> = {
  DRAFT: {
    label: "Needs review",
    dot: "bg-amber-500",
    hint: "Nothing has happened to this draft yet — approval is still yours to give.",
  },
  APPROVED: {
    label: "Approved",
    dot: "bg-emerald-500",
    hint: "Approved here — but nothing is published. CMS push arrives in Phase 2.",
  },
  DISMISSED: {
    label: "Dismissed",
    dot: "bg-zinc-400",
    hint: "Decided against. It stays listed so the decision is visible, not lost.",
  },
};

function StatusBadge({ status }: { status: SignalDraftStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className="rounded-full font-normal">
      <span className={cn("mr-1.5 size-1.5 rounded-full", meta.dot)} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "faq"
  );
}

function prettyJsonLd(jsonld: unknown): string {
  try {
    return JSON.stringify(jsonld, null, 2);
  } catch {
    return String(jsonld);
  }
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  } catch {
    toast.error("Copy failed — select the text and copy manually.");
  }
}

function downloadJsonLd(jsonld: unknown, question: string): void {
  const blob = new Blob([prettyJsonLd(jsonld)], { type: "application/ld+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `faq-${slugify(question)}.jsonld`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success("JSON-LD downloaded");
}

/* ------------------------------------------------------------------ */
/* The view                                                             */
/* ------------------------------------------------------------------ */

export interface PendingDraftRequest {
  clusterKey: string;
  question: string;
}

/**
 * Why generation did not return a draft. Refusals (422) are answers — the
 * fix is indexing material, not retrying. Everything else is an incident.
 */
interface PendingError {
  kind: "refused" | "rate-limited" | "failed";
  message: string;
}

function toPendingError(err: unknown): PendingError {
  if (err instanceof ApiError) {
    if (err.status === 422) return { kind: "refused", message: err.message };
    if (err.status === 429)
      return {
        kind: "rate-limited",
        message:
          err.retryAfterSec != null
            ? `${err.message} Try again in ${err.retryAfterSec}s.`
            : err.message,
      };
  }
  return {
    kind: "failed",
    message: err instanceof Error ? err.message : "Draft generation failed — try again.",
  };
}

export function SignalsView({
  companyId,
  pending,
}: {
  companyId: string;
  pending: PendingDraftRequest | null;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<SignalDraftRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pendingError, setPendingError] = useState<PendingError | null>(null);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setDrafts(null);
    setLoadError(null);
    apiClient.intelligence
      .drafts(companyId)
      .then((res) => {
        if (!cancelled) setDrafts(res.drafts);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Failed to load drafts.");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadKey]);

  /** Refusals are answers: shown in place on the pending card. */
  const generate = useCallback(async () => {
    if (!pending) return;
    setGenerating(true);
    setPendingError(null);
    try {
      const res = await apiClient.intelligence.generateDraft(
        companyId,
        pending.clusterKey,
        pending.question
      );
      toast.success(
        res.existing
          ? "A draft for this cluster already exists — reviewing it below."
          : "Draft generated, grounded in your knowledge base."
      );
      reload();
      // The request is served; a fresh URL keeps the queue, not the form.
      router.replace("/intelligence/signals", { scroll: false });
    } catch (err: unknown) {
      setPendingError(toPendingError(err));
    } finally {
      setGenerating(false);
    }
  }, [companyId, pending, reload, router]);

  const setStatus = useCallback(
    async (draft: SignalDraftRow, status: SignalDraftStatus) => {
      setBusyId(draft.id);
      try {
        const res = await apiClient.intelligence.setDraftStatus(
          companyId,
          draft.id,
          status
        );
        setDrafts((prev) =>
          prev ? prev.map((d) => (d.id === res.draft.id ? res.draft : d)) : prev
        );
        toast.success(
          status === "APPROVED"
            ? "Draft approved — it stays a draft on the site until a CMS push exists."
            : status === "DISMISSED"
              ? "Draft dismissed."
              : "Draft back in review."
        );
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Status change failed.");
      } finally {
        setBusyId(null);
      }
    },
    [companyId]
  );

  const groups = useMemo(() => {
    const list = drafts ?? [];
    return {
      review: list.filter((d) => d.status === "DRAFT"),
      approved: list.filter((d) => d.status === "APPROVED"),
      dismissed: list.filter((d) => d.status === "DISMISSED"),
    };
  }, [drafts]);

  if (drafts === null && !loadError) {
    return (
      <div className="mt-6 space-y-3">
        {pending && <Skeleton className="h-40 w-full" />}
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (loadError) {
    return (
      <Alert variant="destructive" className="mt-6">
        <AlertTitle>Couldn't load the draft queue</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{loadError}</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const isEmpty =
    groups.review.length === 0 &&
    groups.approved.length === 0 &&
    groups.dismissed.length === 0 &&
    !pending;

  if (isEmpty) {
    return (
      <Empty className="mt-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkle aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Nothing drafted yet</EmptyTitle>
          <EmptyDescription>
            Drafts start on the Intent Radar: pick a repeated question the
            site's answers couldn't back, and send it here. Every draft is
            grounded in what your own knowledge base retrieves — it refuses
            rather than invent.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/intelligence/intent-radar">
              <ArrowLeft className="size-4" data-icon="inline-start" />
              Open Intent Radar
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {pending && (
        <PendingCard
          pending={pending}
          generating={generating}
          error={pendingError}
          onGenerate={generate}
        />
      )}

      <DraftSection
        title="Needs review"
        caption="The approval gate. Approving records a human decision — it publishes nothing."
        drafts={groups.review}
        busyId={busyId}
        onSetStatus={setStatus}
      />
      <DraftSection
        title="Approved"
        caption="Cleared for the next CMS push. No push exists yet, so these stay drafts on the website."
        drafts={groups.approved}
        busyId={busyId}
        onSetStatus={setStatus}
      />
      <DraftSection
        title="Dismissed"
        caption="Kept for the record — a dismissal with its reason beats a queue that forgets."
        drafts={groups.dismissed}
        busyId={busyId}
        onSetStatus={setStatus}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pending generation card                                              */
/* ------------------------------------------------------------------ */

function PendingCard({
  pending,
  generating,
  error,
  onGenerate,
}: {
  pending: PendingDraftRequest;
  generating: boolean;
  error: PendingError | null;
  onGenerate: () => void;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Sparkle className="size-3.5" aria-hidden="true" />
              Sent from the Intent Radar — blindspot cluster
            </p>
            <h2 className="mt-1 text-base font-semibold leading-snug">
              {pending.question}
            </h2>
          </div>
          <Button onClick={onGenerate} disabled={generating}>
            {generating ? (
              <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkle className="size-4" aria-hidden="true" />
            )}
            {generating ? "Drafting…" : "Generate draft"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Generation grounds the FAQ in what your knowledge base retrieves for
          this exact wording. It will refuse instead of inventing: if no source
          answers the question, the answer is to index the missing material
          first, then draft again.
        </p>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>
              {error.kind === "refused"
                ? "Draft refused"
                : error.kind === "rate-limited"
                  ? "Rate limit"
                  : "Generation failed"}
            </AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}
        {error?.kind === "refused" && (
          <p className="text-[13px] text-muted-foreground">
            <Link
              href="/knowledge/ingest"
              className="font-medium underline underline-offset-4 hover:text-foreground"
            >
              Knowledge → Sources
            </Link>{" "}
            is where the missing material gets indexed.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* A status section of the queue                                        */
/* ------------------------------------------------------------------ */

function DraftSection({
  title,
  caption,
  drafts,
  busyId,
  onSetStatus,
}: {
  title: string;
  caption: string;
  drafts: SignalDraftRow[];
  busyId: string | null;
  onSetStatus: (draft: SignalDraftRow, status: SignalDraftStatus) => Promise<void>;
}) {
  if (drafts.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">
          {title}
          <span className="ml-2 font-normal tabular-nums text-muted-foreground">
            {drafts.length}
          </span>
        </h2>
        <p className="text-xs text-muted-foreground">{caption}</p>
      </div>
      <div className="space-y-3">
        {drafts.map((draft) => (
          <DraftCard
            key={draft.id}
            draft={draft}
            busy={busyId === draft.id}
            onSetStatus={onSetStatus}
          />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* One draft: FAQ and JSON-LD, the two artifacts, never one without     */
/* the other.                                                           */
/* ------------------------------------------------------------------ */

function DraftCard({
  draft,
  busy,
  onSetStatus,
}: {
  draft: SignalDraftRow;
  busy: boolean;
  onSetStatus: (draft: SignalDraftRow, status: SignalDraftStatus) => Promise<void>;
}) {
  const [tab, setTab] = useState<"faq" | "jsonld">("faq");
  const meta = STATUS_META[draft.status];
  const jsonld = prettyJsonLd(draft.jsonld);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusBadge status={draft.status} />
            <h3 className="mt-2 text-base font-semibold leading-snug">
              {draft.faq?.question ?? draft.question}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Cluster “{draft.clusterKey}”
              {draft.model ? ` · drafted by ${draft.model}` : ""} · updated{" "}
              {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : "—"}
            </p>
          </div>
          <div className="flex rounded-lg border p-0.5" role="tablist" aria-label="Draft artifact">
            {(["faq", "jsonld"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  tab === t
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "faq" ? "FAQ" : "JSON-LD"}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tab === "faq" ? (
          <FaqPanel draft={draft} />
        ) : (
          <div className="space-y-2">
            <pre className="max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 font-mono text-xs leading-relaxed">
              {jsonld}
            </pre>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => copyText(jsonld, "JSON-LD")}
              >
                <Copy className="size-4" aria-hidden="true" />
                Copy
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => downloadJsonLd(draft.jsonld, draft.question)}
              >
                <DownloadSimple className="size-4" aria-hidden="true" />
                Download
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              schema.org FAQPage — the public artifact. It carries the question
              and answer only: no retrieval scores, no cluster keys, no internal
              state.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="justify-between gap-2 border-t py-3">
        <p className="text-xs text-muted-foreground">{meta.hint}</p>
        <div className="flex shrink-0 gap-2">
          {draft.status === "DRAFT" ? (
            <>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => onSetStatus(draft, "APPROVED")}
              >
                {busy ? (
                  <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <CheckCircle className="size-4" aria-hidden="true" />
                )}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onSetStatus(draft, "DISMISSED")}
              >
                <XCircle className="size-4" aria-hidden="true" />
                Dismiss
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onSetStatus(draft, "DRAFT")}
            >
              {busy ? (
                <CircleNotch className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Back to review
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}

function FaqPanel({ draft }: { draft: SignalDraftRow }) {
  const faq = draft.faq;
  if (!faq) {
    return (
      <p className="text-sm text-muted-foreground">
        The draft carries no FAQ content — likely created before generation
        completed. Regenerate it from the Intent Radar.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{faq.answer}</p>
      {faq.sources.length > 0 ? (
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Grounded in
          </p>
          <ul className="mt-1.5 space-y-1">
            {faq.sources.map((s) => (
              <li key={s.url} className="text-[13px]">
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Sources are the reviewer's first check: open one and confirm the
            answer says only what the page says.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No source links recorded for this draft — verify the answer against
          your knowledge base before approving.
        </p>
      )}
    </div>
  );
}
