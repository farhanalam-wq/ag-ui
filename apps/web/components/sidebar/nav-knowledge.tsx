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
  onOpenDocuments?: () => void;
  onOpenFacts?: () => void;
  onOpenChunks?: () => void;
}

export function NavKnowledge({
  companyDomain,
  chunkCount = 17,
  documentCount = 5,
  onOpenDocuments,
  onOpenFacts,
  onOpenChunks,
}: NavKnowledgeProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1">
        Knowledge Layer
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Indexed crawled documents"
            onClick={onOpenDocuments}
            className="text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <FileText className="size-4 text-zinc-500" />
            <span>Crawled Pages</span>
            <SidebarMenuBadge className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 ml-auto">
              {documentCount}
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Deterministic extracted company facts"
            onClick={onOpenFacts}
            className="text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Fingerprint className="size-4 text-zinc-500" />
            <span>Structured Facts</span>
            <SidebarMenuBadge className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 ml-auto">
              SQL
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="PostgreSQL pgvector 1536-dim embeddings"
            onClick={onOpenChunks}
            className="text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Stack className="size-4 text-zinc-500" />
            <span>Vector Chunks</span>
            <SidebarMenuBadge className="text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 ml-auto">
              {chunkCount}
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="BullMQ crawler & pipeline queue health"
            className="text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          >
            <Cpu className="size-4 text-zinc-500" />
            <span>Queue Pipeline</span>
            <SidebarMenuBadge className="text-[10px] font-mono text-emerald-500 bg-emerald-950/40 border border-emerald-800/60 ml-auto">
              Ready
            </SidebarMenuBadge>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
