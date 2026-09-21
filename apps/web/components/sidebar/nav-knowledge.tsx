"use client";

import * as React from "react";
import {
  FileText,
  Fingerprint,
  Stack,
  Cpu,
  Database,
} from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from "@/components/ui/sidebar";

interface NavKnowledgeProps {
  companyDomain: string;
  chunkCount?: number;
  documentCount?: number;
  factCount?: number;
  status?: string;
  onOpenDocuments?: () => void;
  onOpenFacts?: () => void;
  onOpenChunks?: () => void;
}

export function NavKnowledge({
  companyDomain,
  chunkCount = 0,
  documentCount = 0,
  factCount = 0,
  status = "Ready",
  onOpenDocuments,
  onOpenFacts,
  onOpenChunks,
}: NavKnowledgeProps) {
  const normStatus = (status || "Ready").toUpperCase();
  const isReady = normStatus === "READY";
  const isCrawling = ["CRAWLING", "PROCESSING", "EMBEDDING", "QUEUED"].includes(normStatus);
  const isFailed = normStatus === "FAILED";

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1">
        Knowledge Layer
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={`Indexed crawled documents for ${companyDomain}`}
            onClick={onOpenDocuments}
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-colors"
          >
            <FileText className="size-4 text-zinc-400 dark:text-zinc-500" />
            <span>Crawled Pages</span>
            <SidebarMenuBadge className="text-[10px] font-mono bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-300/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 ml-auto">
              {documentCount}
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Deterministic extracted company facts"
            onClick={onOpenFacts}
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-colors"
          >
            <Fingerprint className="size-4 text-zinc-400 dark:text-zinc-500" />
            <span>Structured Facts</span>
            <SidebarMenuBadge className="text-[10px] font-mono bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-300/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 ml-auto">
              {factCount > 0 ? factCount : "SQL"}
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Qdrant 1536-dim vector embeddings in company_chunks"
            onClick={onOpenChunks}
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-colors"
          >
            <Stack className="size-4 text-zinc-400 dark:text-zinc-500" />
            <span>Vector Chunks</span>
            <SidebarMenuBadge className="text-[10px] font-mono bg-zinc-200/80 dark:bg-zinc-900 border border-zinc-300/80 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 ml-auto">
              {chunkCount}
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Ingestion & crawl pipeline state"
            className="text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Cpu className="size-4 text-zinc-500" />
            <span>Queue Pipeline</span>
            <SidebarMenuBadge
              className={`text-[10px] font-mono ml-auto ${
                isReady
                  ? "text-emerald-500 bg-emerald-950/40 border border-emerald-800/60"
                  : isCrawling
                  ? "text-blue-400 bg-blue-950/40 border border-blue-800/60 animate-pulse"
                  : isFailed
                  ? "text-red-400 bg-red-950/40 border border-red-800/60"
                  : "text-amber-400 bg-amber-950/40 border border-amber-800/60"
              }`}
            >
              {status || "Ready"}
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
