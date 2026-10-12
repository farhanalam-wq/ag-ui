"use client";

import React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { FileText, Stack } from "@phosphor-icons/react";
import { EvidenceCard } from "@/components/evidence-card";
import type { EvidenceItem } from "@/hooks/use-company-chat";

interface EvidenceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  evidence: EvidenceItem[];
  selectedEvidence?: EvidenceItem | null;
  onSelect?: (item: EvidenceItem) => void;
}

export function EvidenceDrawer({
  isOpen,
  onClose,
  evidence,
  selectedEvidence,
  onSelect,
}: EvidenceDrawerProps) {
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="flex w-[480px] max-w-full flex-col gap-0 p-0 sm:max-w-[480px]">
        <SheetTitle className="sr-only">Verified evidence sources</SheetTitle>
        <SheetDescription className="sr-only">
          Cited chunks grounding the current answer.
        </SheetDescription>

        {/* Header */}
        <div className="flex items-center justify-between gap-2.5 border-b border-border px-6 py-4 pr-14">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg border border-border bg-muted p-1.5">
              <Stack className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">
                Verified Evidence Sources
              </h2>
              <p className="text-xs tabular-nums text-muted-foreground">
                {evidence.length} cited chunk{evidence.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-6">
          {evidence.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileText />
                </EmptyMedia>
                <EmptyTitle>No citations yet</EmptyTitle>
                <EmptyDescription>
                  Ask a question — grounded sources land here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-4">
              {evidence.map((item, index) => (
                <EvidenceCard
                  key={item.id || index}
                  item={item}
                  index={index}
                  selected={selectedEvidence?.id === item.id}
                  onSelect={onSelect}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between border-t border-border px-6 py-3 font-mono text-[11px] text-muted-foreground">
          <span>Qdrant HNSW</span>
          <span>text-embedding-3-small</span>
        </div>
      </SheetContent>
    </Sheet>
  );
}
