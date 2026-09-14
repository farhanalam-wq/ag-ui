"use client";

import * as React from "react";
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
      <SidebarHeader className="border-b border-zinc-200/80 dark:border-zinc-900/80 p-2">
        <CompanySwitcher
          companies={companies}
          selectedCompany={selectedCompany}
          onSelectCompany={onSelectCompany}
          onOpenAddDialog={onOpenAddCompany}
        />
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

      <SidebarFooter className="border-t border-zinc-200/80 dark:border-zinc-900/80 p-2">
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
