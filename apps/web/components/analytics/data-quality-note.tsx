"use client";

/**
 * apps/web/components/analytics/data-quality-note.tsx
 *
 * The caveat note.
 *
 * Every report computes the caveats that apply to its numbers — no tracked
 * traffic, uniques unavailable, a channel filter that hides the unique
 * count, a sampled message window. Until now those flags were computed and
 * never shown, so the module's stated honesty was a claim rather than a
 * behaviour (F-07).
 *
 * The wording is not written here: the API resolves the codes to sentences
 * from the catalogue, so every surface says the same thing about the same
 * caveat.
 */

import { Info } from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function DataQualityNote({
  notes,
  className,
}: {
  /** The caveat sentences, resolved server-side from the catalogue. */
  notes: string[];
  className?: string;
}) {
  if (!notes || notes.length === 0) return null;
  return (
    <Alert className={cn("bg-muted/40", className)}>
      <Info className="size-4" aria-hidden="true" />
      <AlertTitle className="text-[13px]">About these numbers</AlertTitle>
      <AlertDescription>
        <ul className="list-disc space-y-1 pl-4 text-[13px]">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
