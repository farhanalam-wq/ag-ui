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
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-zinc-200/70 dark:hover:bg-zinc-900 transition-colors"
            >
              <div
                className="flex aspect-square size-8 items-center justify-center rounded-lg font-bold text-xs shrink-0 shadow-inner border border-zinc-300/80 dark:border-zinc-700/60"
                style={{
                  backgroundColor: `${selectedCompany.brandColor}20`,
                  color: selectedCompany.brandColor,
                }}
              >
                {selectedCompany.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
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
            className="w-80 rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 shadow-2xl p-2 z-50"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={6}
          >
            <div className="flex items-center justify-between px-2 py-1 mb-1">
              <span className="text-[11px] font-mono uppercase text-zinc-500 font-semibold">
                Indexed Companies ({companies.length})
              </span>
              <span className="text-[10px] font-mono text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                Qdrant Active
              </span>
            </div>

            {/* Quick Search Filter */}
            {companies.length > 5 && (
              <div className="px-1 pb-2">
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter companies..."
                  className="w-full h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-brand-primary"
                />
              </div>
            )}

            {/* Fixed-Height Scrollable Company List */}
            <div className="max-h-72 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
              {filteredCompanies.length === 0 ? (
                <div className="py-4 text-center text-xs text-zinc-500 font-mono">
                  No matching companies found
                </div>
              ) : (
                filteredCompanies.map((company) => {
                  const isSelected = company.id === selectedCompany.id;
                  const docCount = company.docCount ?? 0;
                  const chunkCount = company.chunkCount ?? 0;

                  return (
                    <DropdownMenuItem
                      key={company.id}
                      onClick={() => onSelectCompany(company)}
                      className="gap-2.5 p-2 rounded-lg text-xs cursor-pointer focus:bg-zinc-100 dark:focus:bg-zinc-900 focus:text-zinc-900 dark:focus:text-zinc-100"
                    >
                      <div
                        className="flex size-7 items-center justify-center rounded-md font-bold text-[11px] shrink-0 border border-zinc-300 dark:border-zinc-700/50"
                        style={{
                          backgroundColor: `${company.brandColor}25`,
                          color: company.brandColor,
                        }}
                      >
                        {company.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-medium text-zinc-800 dark:text-zinc-200 truncate">
                            {company.name}
                          </span>
                          {docCount > 0 && (
                            <span className="text-[10px] font-mono text-zinc-500 shrink-0">
                              {docCount} docs
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-mono text-zinc-500 truncate">
                            {company.domain}
                          </span>
                          {chunkCount > 0 && (
                            <span className="text-[9px] font-mono text-brand-primary/80 shrink-0">
                              {chunkCount} chunks
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="size-4 text-brand-primary shrink-0" />
                      )}
                    </DropdownMenuItem>
                  );
                })
              )}
            </div>

            <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800 my-1" />

            <DropdownMenuItem
              onClick={onOpenAddDialog}
              className="gap-2 p-2 rounded-lg text-xs cursor-pointer text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 focus:bg-zinc-100 dark:focus:bg-zinc-900"
            >
              <div className="flex size-6 items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900">
                <Plus className="size-3.5 text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-medium">Ingestion Studio</span>
                <span className="text-[10px] text-zinc-500">Discover & crawl new company URLs</span>
              </div>
              <DropdownMenuShortcut className="text-zinc-500 font-mono text-[10px] ml-auto">
                /ingest
              </DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
