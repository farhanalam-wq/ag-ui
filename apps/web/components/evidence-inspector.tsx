"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText } from "@phosphor-icons/react";
import { EvidenceCard } from "@/components/evidence-card";
import type { EvidenceItem } from "@/hooks/use-company-chat";

interface EvidenceInspectorProps {
  evidence: EvidenceItem[];
  selectedEvidence?: EvidenceItem | null;
  onSelect?: (item: EvidenceItem) => void;
  isStreaming?: boolean;
}

/** Desktop reading surface for citations (mobile uses the Sheet). */
export function EvidenceInspector({
  evidence,
  selectedEvidence,
  onSelect,
  isStreaming,
}: EvidenceInspectorProps) {
  return (
    <Card className="flex min-h-0 flex-1 flex-col">
      <CardHeader>
        <CardTitle className="text-base">Sources</CardTitle>
        <CardDescription className="tabular-nums">
          {evidence.length > 0
            ? `${evidence.length} cited chunk${evidence.length === 1 ? "" : "s"}`
            : "Citation inspector"}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 overflow-y-auto">
        {isStreaming && evidence.length === 0 ? (
          <div className="flex flex-col gap-4" aria-label="Loading citations">
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-24 rounded-xl" />
          </div>
        ) : evidence.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>No citations</EmptyTitle>
              <EmptyDescription>
                Ask a question — cited sources land here.
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
      </CardContent>
    </Card>
  );
}
