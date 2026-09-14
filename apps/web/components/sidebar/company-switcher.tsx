"use client";

import * as React from "react";
import {
  CaretUpDown,
  Plus,
  Buildings,
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

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-zinc-900 transition-colors"
            >
              <div
                className="flex aspect-square size-8 items-center justify-center rounded-lg font-bold text-xs shrink-0 shadow-inner border border-zinc-700/60"
                style={{
                  backgroundColor: `${selectedCompany.brandColor}20`,
                  color: selectedCompany.brandColor,
                }}
              >
                {selectedCompany.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-zinc-100 flex items-center gap-1.5">
                  {selectedCompany.name}
                </span>
                <span className="truncate text-xs text-zinc-500 font-mono">
                  {selectedCompany.domain}
                </span>
              </div>
              <CaretUpDown className="ml-auto size-4 text-zinc-400" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl p-1.5"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-[11px] font-mono uppercase text-zinc-500 px-2 py-1">
              Indexed Companies
            </DropdownMenuLabel>
            {companies.map((company) => {
              const isSelected = company.id === selectedCompany.id;
              return (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => onSelectCompany(company)}
                  className="gap-2.5 p-2 rounded-lg text-xs cursor-pointer focus:bg-zinc-900 focus:text-zinc-100"
                >
                  <div
                    className="flex size-6 items-center justify-center rounded-md font-bold text-[10px] shrink-0 border border-zinc-700/50"
                    style={{
                      backgroundColor: `${company.brandColor}25`,
                      color: company.brandColor,
                    }}
                  >
                    {company.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium text-zinc-200 truncate">
                      {company.name}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500 truncate">
                      {company.domain}
                    </span>
                  </div>
                  {isSelected && (
                    <Check className="size-3.5 text-brand-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              );
            })}
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />
            <DropdownMenuItem
              onClick={onOpenAddDialog}
              className="gap-2 p-2 rounded-lg text-xs cursor-pointer text-zinc-300 hover:text-zinc-100 focus:bg-zinc-900"
            >
              <div className="flex size-6 items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-900">
                <Plus className="size-3.5 text-zinc-400" />
              </div>
              <span className="font-medium">Index New Company</span>
              <DropdownMenuShortcut className="text-zinc-500 font-mono text-[10px]">
                URL
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
