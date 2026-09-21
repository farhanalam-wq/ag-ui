"use client";

import * as React from "react";
import { Plus, ArrowSquareOut } from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CompanySwitcher, type CompanyItem } from "./company-switcher";
import { NavChats, type ChatThread } from "./nav-chats";
import { NavKnowledge } from "./nav-knowledge";
import { NavSettings } from "./nav-settings";
import { NavUser } from "./nav-user";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  companies: CompanyItem[];
  selectedCompany: CompanyItem;
  onSelectCompany: (company: CompanyItem) => void;
  onOpenAddCompany: () => void;
  onNewChat: () => void;
  activeChatId?: string;
  onSelectChat?: (chat: ChatThread) => void;
  chunkCount?: number;
  documentCount?: number;
}

export function AppSidebar({
  companies,
  selectedCompany,
  onSelectCompany,
  onOpenAddCompany,
  onNewChat,
  activeChatId,
  onSelectChat,
  chunkCount,
  documentCount,
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-200 dark:border-zinc-900 bg-zinc-50/70 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors" {...props}>
      <SidebarHeader className="border-b border-zinc-200/80 dark:border-zinc-900/80 p-2 space-y-1.5">
        <CompanySwitcher
          companies={companies}
          selectedCompany={selectedCompany}
          onSelectCompany={onSelectCompany}
          onOpenAddDialog={onOpenAddCompany}
        />
        <button
          type="button"
          onClick={onOpenAddCompany}
          className="flex w-full items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors shadow-sm group group-data-[collapsible=icon]:p-1.5"
          title="Index new company URL"
        >
          <Plus className="size-3.5 text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden truncate">Index URL</span>
        </button>
      </SidebarHeader>

      <SidebarContent className="space-y-2 py-2">
        <NavChats
          onNewChat={onNewChat}
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
        />
        <SidebarSeparator className="bg-zinc-200 dark:bg-zinc-900 mx-2" />
        <NavKnowledge
          companyDomain={selectedCompany.domain}
          chunkCount={chunkCount}
          documentCount={documentCount}
        />
        <SidebarSeparator className="bg-zinc-200 dark:bg-zinc-900 mx-2" />
        <NavSettings />
      </SidebarContent>

      <SidebarFooter className="border-t border-zinc-200/80 dark:border-zinc-900/80 p-2 space-y-2">
        <div className="flex items-center justify-between gap-1.5 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          <div
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono text-zinc-600 dark:text-zinc-400 bg-zinc-200/60 dark:bg-zinc-900/80 border border-zinc-300/80 dark:border-zinc-800/80 group-data-[collapsible=icon]:p-1.5 cursor-help"
            title="Qdrant Vector DB active on :6333 (1536-dim HNSW). PostgreSQL active on :5432 (Relational metadata)."
          >
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Qdrant active</span>
          </div>

          <a
            href="http://localhost:3001/health"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-mono text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 bg-zinc-200/60 dark:bg-zinc-900/80 border border-zinc-300/80 dark:border-zinc-800/80 hover:border-zinc-400 dark:hover:border-zinc-700 transition-colors group-data-[collapsible=icon]:p-1.5"
            title="API Health (Port 3001)"
          >
            <span className="group-data-[collapsible=icon]:hidden">API : 3001</span>
            <ArrowSquareOut className="size-3 shrink-0 text-zinc-400 dark:text-zinc-500" />
          </a>
        </div>
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
