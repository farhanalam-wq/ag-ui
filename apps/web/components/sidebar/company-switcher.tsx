"use client";

import * as React from "react";
import {
  CaretUpDown,
  Plus,
  Check,
} from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export interface CompanyItem {
  id: string;
  name: string;
  domain: string;
  description: string;
  brandColor: string;
  badge: string;
  docCount?: number;
  chunkCount?: number;
  factCount?: number;
  status?: string;
  suggestedQueries: string[];
}

interface CompanySwitcherProps {
  companies: CompanyItem[];
  selectedCompany: CompanyItem;
  onSelectCompany: (company: CompanyItem) => void;
  onOpenAddDialog: () => void;
}

export function CompanySwitcher({
  companies,
  selectedCompany,
  onSelectCompany,
  onOpenAddDialog,
}: CompanySwitcherProps) {
  const { isMobile } = useSidebar();
  const [filter, setFilter] = React.useState("");

  const filteredCompanies = React.useMemo(() => {
    if (!filter.trim()) return companies;
    const q = filter.toLowerCase().trim();
    return companies.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.domain.toLowerCase().includes(q)
    );
  }, [companies, filter]);

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={(open) => !open && setFilter("")}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div
                className="flex aspect-square size-8 items-center justify-center rounded-lg font-bold text-xs shrink-0"
                style={{
                  backgroundColor: `${selectedCompany.brandColor}20`,
                  color: selectedCompany.brandColor,
                }}
              >
                {selectedCompany.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {selectedCompany.name}
                </span>
                <span className="truncate text-xs">
                  {selectedCompany.domain}
                </span>
              </div>
              <CaretUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Companies
            </DropdownMenuLabel>
            {companies.length > 5 && (
              <div className="px-2 pb-2">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter companies..."
                  className="w-full h-8 px-2.5 rounded-md border bg-transparent text-xs focus:outline-none"
                />
              </div>
            )}
            {filteredCompanies.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No matching companies found
              </div>
            ) : (
              filteredCompanies.map((company, index) => {
                const isSelected = company.id === selectedCompany.id;
                return (
                  <DropdownMenuItem
                    key={company.id}
                    onClick={() => onSelectCompany(company)}
                    className="gap-2 p-2"
                  >
                    <div
                      className="flex size-6 items-center justify-center rounded-md border font-bold text-[11px] shrink-0"
                      style={{
                        backgroundColor: `${company.brandColor}20`,
                        color: company.brandColor,
                      }}
                    >
                      {company.name.slice(0, 2).toUpperCase()}
                    </div>
                    {company.name}
                    {isSelected ? (
                      <Check className="ml-auto size-3.5 shrink-0" />
                    ) : (
                      <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                    )}
                  </DropdownMenuItem>
                );
              })
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenAddDialog} className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-transparent">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">Ingestion Studio</div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
