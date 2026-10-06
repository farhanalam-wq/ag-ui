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
import { IngestionStudio } from "@/components/ingestion/ingestion-studio";
import { apiClient } from "@/lib/api-client";
import type { CompanyItem } from "@/components/sidebar/company-switcher";
import { ModeToggle } from "@/components/mode-toggle";
import { ArrowLeft, ChatCircleText } from "@phosphor-icons/react";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

export default function IngestRoutePage() {
  const router = useRouter();
  const companies = useCompanyStore((s) => s.companies);
  const selectedCompany = useSelectedCompany();

  useEffect(() => {
    if (useCompanyStore.getState().companies.length > 0) return;
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
          useCompanyStore.getState().setCompanies(dynamicList);
        }
      } catch {
        // Non-blocking
      }
    }
    loadCompanies();
  }, []);

  const handleCompanyIndexed = (company: CompanyItem) => {
    // Store the newly indexed company and navigate to the playground.
    useCompanyStore.getState().upsertAndSelect(company);
    router.push("/playground");
  };

  const handleCancel = () => {
    router.push("/playground");
  };

  return (
    <SidebarProvider defaultOpen={true}>
      <div className="flex min-h-screen w-full bg-background text-foreground transition-colors duration-200">
        {selectedCompany && (
          <AppSidebar
            companies={companies}
            selectedCompany={selectedCompany}
            onSelectCompany={(comp) => {
              useCompanyStore.getState().select(comp.id);
              router.push("/playground");
            }}
            onOpenAddCompany={() => {}}
          />
        )}

        <SidebarInset className="flex flex-col bg-background min-h-screen transition-colors duration-200">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-zinc-900/80 bg-zinc-950/80 px-4 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900" />
              <Separator orientation="vertical" className="mr-2 h-4 bg-zinc-800" />
              <Breadcrumb>
                <BreadcrumbList className="text-xs">
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      href="/playground"
                      onClick={(e) => {
                        e.preventDefault();
                        router.push("/playground");
                      }}
                      className="text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1.5"
                    >
                      <ArrowLeft className="size-3" />
                      <span>Chat</span>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-zinc-600" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-zinc-200 font-mono">
                      Ingestion Studio & Knowledge Crawler
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/playground")}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
              >
                <ChatCircleText className="size-3.5" />
                <span>Return to Chat</span>
              </button>
              <ModeToggle />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-6">
            <IngestionStudio
              onCompanyIndexed={handleCompanyIndexed}
              onCancel={handleCancel}
            />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
