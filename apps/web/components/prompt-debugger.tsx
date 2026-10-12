"use client";

import React, { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CaretDown, FileCode } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

/**
 * Prompt layer inspector (Base / Admin / Runtime).
 *
 * Contract stub: the chat API does not expose prompt layers for a
 * snapshot yet, so this renders an honest empty state instead of
 * faked content. Wire real layers here when the API grows them.
 */
export function PromptDebugger() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-xs text-muted-foreground"
          aria-label={open ? "Hide prompt layers" : "Show prompt layers"}
        >
          <span>Prompt layers</span>
          <CaretDown
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Empty className="p-6">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileCode />
            </EmptyMedia>
            <EmptyTitle className="text-base">Prompt layers unavailable</EmptyTitle>
            <EmptyDescription>
              Base, Admin, and Runtime layers aren&apos;t exposed for this
              snapshot yet.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CollapsibleContent>
    </Collapsible>
  );
}
