"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

// Phase F: route-level error boundary. Client directive is required here.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center p-4 sm:p-6">
      <div className="flex max-w-sm items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
        <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <div className="font-semibold">Something went wrong</div>
          <div className="mt-0.5 font-mono text-[11px]">
            {error?.digest ? `Error digest: ${error.digest}` : "Please try again."}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 h-8"
            onClick={() => reset()}
          >
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
