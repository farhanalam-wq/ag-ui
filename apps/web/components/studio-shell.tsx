"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
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
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";
import { useSessionStore } from "@/stores/use-session-store";

export interface Crumb {
  label: string;
  href?: string;
}

interface StudioShellProps {
  /** Breadcrumb trail rendered after the trigger, e.g. Knowledge / Sources. */
  crumbs: Crumb[];
  children: React.ReactNode;
  /**
   * Optional company-switch handler (e.g. Playground clears its chat thread
   * on switch). Defaults to store `select()` only.
   */
  onSelectCompany?: (company: CompanyItem) => void;
}

/**
 * Shared shell for studio routes: company list from the shared Zustand store
 * and switcher-driven company switching. Keeps the stub pages ~10 lines each.
 */
export function StudioShell({
  crumbs,
  children,
  onSelectCompany,
}: StudioShellProps) {
  const router = useRouter();
  const companies = useCompanyStore((s) => s.companies);
  const selectedCompany = useSelectedCompany();
  const ensureSession = useSessionStore((s) => s.ensure);

  useEffect(() => {
    // Session first, tenant data second: company lists are owner-scoped, so
    // fetching before the session resolves just buys a 401. If a stale or
    // revoked cookie slipped past the proxy, land on /login instead.
    let active = true;
    ensureSession().then((user) => {
      if (!active) return;
      if (!user) {
        router.replace("/login");
        return;
      }
      // Single shared loader (store dedupes concurrent callers).
      useCompanyStore.getState().ensureCompanies();
    });
    return () => {
      active = false;
    };
  }, [ensureSession, router]);

  return (
    <SidebarProvider
      defaultOpen={true}
      className="bg-background text-foreground"
    >
      <AppSidebar
        companies={companies}
        selectedCompany={selectedCompany}
        onSelectCompany={(comp) => {
          if (onSelectCompany) {
            onSelectCompany(comp);
          } else {
            useCompanyStore.getState().select(comp.id);
          }
        }}
        onOpenAddCompany={() => router.push("/knowledge/ingest")}
      />

      <SidebarInset className="min-w-0 flex-1 overflow-x-clip bg-background transition-colors duration-200">
        <a
          href="#studio-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
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

        <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
          <div
            id="studio-main"
            tabIndex={-1}
            className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 outline-none md:px-6"
          >
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
