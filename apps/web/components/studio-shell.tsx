"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { AppSidebar } from "@/components/sidebar/app-sidebar";
import type { CompanyItem } from "@/components/sidebar/company-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { apiClient } from "@/lib/api-client";

export interface Crumb {
  label: string;
  href?: string;
}

interface StudioShellProps {
  /** Breadcrumb trail rendered after the trigger, e.g. Knowledge / Sources. */
  crumbs: Crumb[];
  children: React.ReactNode;
}

/**
 * Shared shell for studio routes (soon-pages): company list fetch honoring
 * `?company=`, switcher-driven company switching that preserves the current
 * pathname, and the standard header. Keeps the ~17 stub pages ~10 lines each.
 */
export function StudioShell({ crumbs, children }: StudioShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<CompanyItem | null>(null);

  useEffect(() => {
    async function loadCompanies() {
      try {
        const list = await apiClient.companies.list();
        if (list.length > 0) {
          const dynamicList: CompanyItem[] = list.map((c) => {
            const brandColor = c.brand?.tokens?.colors?.primary || "#3b82f6";
            const docCount = c.docCount ?? c.latestSnapshot?.pageCount ?? 0;
            return {
              id: c.id,
              name: c.name,
              domain: c.domain,
              description: `Indexed knowledge base for ${c.name} (${c.domain}).`,
              brandColor,
              badge: `${docCount} Docs • Indexed`,
              docCount,
              chunkCount: c.chunkCount ?? 0,
              factCount: c.factCount ?? 0,
              status: c.status || c.latestSnapshot?.status || "READY",
              suggestedQueries: [
                `What are the core products and APIs provided by ${c.name}?`,
                `What are the pricing tiers, limits, and plan options?`,
                `Where are ${c.name} headquarters and contact options?`,
              ],
            };
          });
          setCompanies(dynamicList);
          setSelectedCompany((prev) => {
            if (typeof window !== "undefined") {
              const companyParam = new URLSearchParams(window.location.search).get("company");
              if (companyParam) {
                const target = dynamicList.find(
                  (c) => c.id === companyParam || c.domain.toLowerCase() === companyParam.toLowerCase()
                );
                if (target) return target;
              }
            }
            if (prev) {
              const match = dynamicList.find((m) => m.id === prev.id);
              if (match) return match;
            }
            return dynamicList[0];
          });
        }
      } catch {
        // Non-blocking: shell renders without a sidebar when list fails.
      }
    }
    loadCompanies();
  }, []);

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background text-foreground transition-colors duration-200">
        {selectedCompany && (
          <AppSidebar
            companies={companies}
            selectedCompany={selectedCompany}
            onSelectCompany={(comp) => {
              setSelectedCompany(comp);
              router.push(`${pathname}?company=${encodeURIComponent(comp.id)}`);
            }}
            onOpenAddCompany={() => router.push("/knowledge/ingest")}
          />
        )}

        <SidebarInset className="flex flex-col bg-background min-h-screen transition-colors duration-200">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b px-4 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 h-4" />
              <Breadcrumb>
                <BreadcrumbList className="text-xs">
                  {crumbs.map((crumb, i) => {
                    const isLast = i === crumbs.length - 1;
                    return (
                      <React.Fragment key={`${crumb.label}-${i}`}>
                        {i > 0 && <BreadcrumbSeparator />}
                        <BreadcrumbItem>
                          {isLast || !crumb.href ? (
                            <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink
                              href={crumb.href}
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(crumb.href!);
                              }}
                            >
                              {crumb.label}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </React.Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex items-center gap-2">
              <ModeToggle />
            </div>
          </header>

          <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
