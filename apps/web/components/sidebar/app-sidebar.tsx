"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { CompanySwitcher, type CompanyItem } from "./company-switcher";
import { NavChats } from "./nav-chats";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  companies: CompanyItem[];
  selectedCompany: CompanyItem;
  onSelectCompany: (company: CompanyItem) => void;
  onOpenAddCompany: () => void | Promise<void>;
  onNewChat: () => void | Promise<void>;
}

export function AppSidebar({
  companies,
  selectedCompany,
  onSelectCompany,
  onOpenAddCompany,
  onNewChat,
  ...props
}: AppSidebarProps) {
  // Phase 1 visual-only selection. Phase 2 will derive this from the route.
  const [activeId, setActiveId] = React.useState("overview");

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <CompanySwitcher
          companies={companies}
          selectedCompany={selectedCompany}
          onSelectCompany={onSelectCompany}
          onOpenAddDialog={() => void (async () => { await onOpenAddCompany(); })()}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavChats onNewChat={onNewChat} />
        <NavMain activeId={activeId} onSelect={setActiveId} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
