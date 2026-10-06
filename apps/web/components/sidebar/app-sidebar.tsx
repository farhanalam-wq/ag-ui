"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { CompanySwitcher, type CompanyItem } from "./company-switcher";
import { NavMain } from "./nav-main";
import { NavUser } from "./nav-user";
import { findNavItemByHref } from "./nav-config";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  companies: CompanyItem[];
  selectedCompany: CompanyItem;
  onSelectCompany: (company: CompanyItem) => void;
  onOpenAddCompany: () => void | Promise<void>;
}

export function AppSidebar({
  companies,
  selectedCompany,
  onSelectCompany,
  onOpenAddCompany,
  ...props
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  // Active leaf follows the route (visual fallback: overview).
  const activeId = findNavItemByHref(pathname)?.id ?? "overview";

  const handleSelectItem = (href: string) => {
    if (href === pathname) return;
    const search = typeof window !== "undefined" ? window.location.search : "";
    router.push(`${href}${search}`);
  };

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
        <NavMain activeId={activeId} onSelectHref={handleSelectItem} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
