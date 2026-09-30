"use client";

import * as React from "react";
import { Plus, CircleNotch } from "@phosphor-icons/react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { CompanySwitcher, type CompanyItem } from "./company-switcher";
import { NavChats } from "./nav-chats";
import { NavSettings } from "./nav-settings";
import { NavUser } from "./nav-user";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  companies: CompanyItem[];
  selectedCompany: CompanyItem;
  onSelectCompany: (company: CompanyItem) => void;
  onOpenAddCompany: () => void | Promise<void>;
  onNewChat: () => void;
}

export function AppSidebar({
  companies,
  selectedCompany,
  onSelectCompany,
  onOpenAddCompany,
  onNewChat,
  ...props
}: AppSidebarProps) {
  const [isIndexing, setIsIndexing] = React.useState(false);

  const handleIndexClick = async () => {
    if (isIndexing) return;
    setIsIndexing(true);
    try {
      await onOpenAddCompany();
    } finally {
      // Reset after navigation starts; fallback timeout covers sync callbacks
      setTimeout(() => setIsIndexing(false), 1500);
    }
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-zinc-200 dark:border-zinc-900 bg-zinc-50/70 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors" {...props}>
      <SidebarHeader className="border-b border-zinc-200/80 dark:border-zinc-900/80 p-2 space-y-1.5">
        <CompanySwitcher
          companies={companies}
          selectedCompany={selectedCompany}
          onSelectCompany={onSelectCompany}
          onOpenAddDialog={() => void handleIndexClick()}
        />
        <button
          type="button"
          onClick={() => void handleIndexClick()}
          disabled={isIndexing}
          aria-busy={isIndexing}
          className="flex w-full items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors shadow-sm group group-data-[collapsible=icon]:p-1.5 disabled:opacity-60 disabled:cursor-wait"
          title="Index new company URL"
        >
          {isIndexing ? (
            <CircleNotch className="size-3.5 animate-spin text-zinc-500 shrink-0" />
          ) : (
            <Plus className="size-3.5 text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-white transition-colors shrink-0" />
          )}
          <span className="group-data-[collapsible=icon]:hidden truncate">
            {isIndexing ? "Indexing…" : "Index URL"}
          </span>
        </button>
      </SidebarHeader>

      <SidebarContent className="space-y-2 py-2">
        <NavChats onNewChat={onNewChat} />
        <SidebarSeparator className="bg-zinc-200 dark:bg-zinc-900 mx-2" />
        <NavSettings />
      </SidebarContent>

      <SidebarFooter className="border-t border-zinc-200/80 dark:border-zinc-900/80 p-2 space-y-2">
        <NavUser />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
