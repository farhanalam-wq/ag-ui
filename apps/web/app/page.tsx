"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputBadge,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Buildings,
  Stack,
  Sparkle,
  ArrowRight,
  ShieldCheck,
  MagnifyingGlass,
  Lightning,
  Code,
  ArrowCounterClockwise,
  Sidebar as SidebarIcon,
  ChatCircleText,
} from "@phosphor-icons/react";
import { useCompanyChat } from "@/hooks/use-company-chat";
import { ChatMessageItem } from "@/components/chat-message";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { IngestionStudio } from "@/components/ingestion/ingestion-studio";
import { apiClient } from "@/lib/api-client";
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
import { ModeToggle } from "@/components/mode-toggle";
import type { CompanyItem } from "@/components/sidebar/company-switcher";

// ============================================================================
// Fallback / Initial Companies Data
// ============================================================================

const DEFAULT_COMPANIES: CompanyItem[] = [
  {
    id: "f2161db4-a037-4c5f-ba79-cb0db2889ad0",
    name: "Resend",
    domain: "resend.com",
    description: "Email API for developers. Modern delivery platform built for speed and reliability.",
    brandColor: "#3b82f6",
    badge: "17 Chunks • Indexed",
    suggestedQueries: [
      "What are the pricing tiers and sending limits?",
      "What SDKs and programming languages are supported?",
      "How does Resend handle domain verification and DNS records?",
      "What are the contact options and enterprise support SLA?",
    ],
  },
  {
    id: "b58fffa6-d53a-40e1-82c0-1952c131a657",
    name: "Anthropic",
    domain: "anthropic.com",
    description: "AI research and safety company behind Claude, dedicated to building reliable AI systems.",
    brandColor: "#d97706",
    badge: "66 Chunks • Indexed",
    suggestedQueries: [
      "What are Claude 3.5 Sonnet's core capabilities and context limits?",
      "Where are Anthropic's headquarters and research offices located?",
      "What are the enterprise security and safety guidelines?",
      "What are the API pricing rates per million tokens?",
    ],
  },
  {
    id: "e3952a5c-b6de-4c04-ab4a-5be1497f0fac",
    name: "Red Hat",
    domain: "redhat.com",
    description: "Enterprise open source solutions, Linux platforms, and hybrid cloud infrastructure.",
    brandColor: "#ef4444",
    badge: "44 Chunks • Indexed",
    suggestedQueries: [
      "What are the main enterprise products and platforms?",
      "Where is Red Hat headquarters located?",
      "What open source community projects does Red Hat sponsor?",
      "How does Red Hat OpenShift pricing and licensing work?",
    ],
  },
  {
    id: "a23db983-1fb7-4c2d-b1f1-7b9b9501ab64",
    name: "Stripe",
    domain: "stripe.com",
    description: "Financial infrastructure for the internet. Payments, billing, and commerce APIs.",
    brandColor: "#6366f1",
    badge: "Verified • Indexed",
    suggestedQueries: [
      "What are the processing fees for card transactions and billing?",
      "What APIs and SDKs are available for subscription management?",
      "Where are Stripe's dual headquarters located?",
      "What compliance certifications and fraud protection features exist?",
    ],
  },
];

export default function Home() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyItem[]>(DEFAULT_COMPANIES);
  const [selectedCompany, setSelectedCompany] = useState<CompanyItem>(DEFAULT_COMPANIES[0]);
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<"visual" | "text">("text");
  const [workspaceView, setWorkspaceView] = useState<"chat" | "ingest">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    currentStage,
    activeEvidence,
    sendMessage,
    clearMessages,
    isDrawerOpen,
    selectedEvidence,
    openDrawerWithEvidence,
    closeDrawer,
  } = useCompanyChat();

  // Dynamically resolve real companies from backend API via centralised apiClient
  useEffect(() => {
    async function fetchApiCompanies() {
      try {
        const apiList = await apiClient.companies.list();

        if (apiList.length > 0) {
          const dynamicList: CompanyItem[] = apiList.map((apiComp) => {
            const defMatch = DEFAULT_COMPANIES.find(
              (def) =>
                def.domain.toLowerCase() === apiComp.domain.toLowerCase() ||
                def.name.toLowerCase() === apiComp.name.toLowerCase()
            );

            const brandColor = apiComp.brand?.tokens?.colors?.primary || defMatch?.brandColor || "#3b82f6";
            const docCount = apiComp.docCount ?? apiComp.latestSnapshot?.pageCount ?? 0;
            const chunkCount = apiComp.chunkCount ?? 0;
            const factCount = apiComp.factCount ?? 0;
            const status = apiComp.status || apiComp.latestSnapshot?.status || "READY";

            return {
              ...(defMatch || {}),
              id: apiComp.id,
              name: apiComp.name,
              domain: apiComp.domain,
              description: defMatch?.description || `Indexed knowledge base for ${apiComp.name} (${apiComp.domain}).`,
              brandColor,
              badge: `${docCount} Docs • Indexed`,
              docCount,
              chunkCount,
              factCount,
              status,
              suggestedQueries: defMatch?.suggestedQueries || [
                `What are the core products and APIs provided by ${apiComp.name}?`,
                `What are the pricing tiers, limits, and plan options?`,
                `Where are ${apiComp.name} headquarters and contact options?`,
                `What compliance certifications and security features exist?`,
              ],
            };
          });

          setCompanies(dynamicList);
          setSelectedCompany((prev) => {
            // Check if ?company= was passed in URL
            if (typeof window !== "undefined") {
              const params = new URLSearchParams(window.location.search);
              const companyParam = params.get("company");
              if (companyParam) {
                const target = dynamicList.find(
                  (c) => c.id === companyParam || c.domain.toLowerCase() === companyParam.toLowerCase()
                );
                if (target) return target;
              }
            }
            const matchedCurrent = dynamicList.find((m) => m.domain === prev.domain);
            return matchedCurrent || dynamicList[0];
          });
        }
      } catch {
        // Fallback to DEFAULT_COMPANIES
      }
    }
    fetchApiCompanies();
  }, []);

  // Auto-scroll to bottom on new streaming tokens
  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isStreaming]);

  const handleSelectCompany = (company: CompanyItem) => {
    setSelectedCompany(company);
    clearMessages();
    setQuery("");
  };

  const handleCompanyIndexed = (newCompany: CompanyItem) => {
    setCompanies((prev) => {
      const exists = prev.some(
        (c) => c.domain.toLowerCase() === newCompany.domain.toLowerCase()
      );
      return exists
        ? prev.map((c) =>
            c.domain.toLowerCase() === newCompany.domain.toLowerCase() ? newCompany : c
          )
        : [newCompany, ...prev];
    });
    setSelectedCompany(newCompany);
    clearMessages();
    setQuery("");
    setWorkspaceView("chat");
  };

  const handleQuerySubmit = async (submittedText: string) => {
    if (!submittedText.trim() || isStreaming) return;
    await sendMessage(submittedText, selectedCompany.id);
  };

  const handleNewChat = () => {
    clearMessages();
    setQuery("");
  };

  const isConversationActive = messages.length > 0;

  return (
    <SidebarProvider defaultOpen={true}>
      {/* Dynamic Brand Primary CSS Injection */}
      <div
        className="flex min-h-screen w-full bg-background text-foreground antialiased selection:bg-zinc-200 dark:selection:bg-zinc-800 selection:text-zinc-900 dark:selection:text-zinc-100 transition-colors duration-200"
        style={
          {
            "--brand-primary": selectedCompany.brandColor,
          } as React.CSSProperties
        }
      >
        {/* Collapsible Enterprise App Sidebar */}
        <AppSidebar
          companies={companies}
          selectedCompany={selectedCompany}
          onSelectCompany={(comp) => {
            handleSelectCompany(comp);
            setWorkspaceView("chat");
          }}
          onOpenAddCompany={() => router.push("/ingest")}
          onNewChat={handleNewChat}
          chunkCount={selectedCompany.chunkCount ?? 0}
          documentCount={selectedCompany.docCount ?? 0}
          factCount={selectedCompany.factCount ?? 0}
          status={selectedCompany.status ?? "Ready"}
        />

        {/* Main Content Area via SidebarInset */}
        <SidebarInset className="flex flex-col bg-background min-h-screen transition-colors duration-200">
          {/* Top Sticky Header with SidebarTrigger, Breadcrumbs, Status Controls & Theme Toggle */}
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-zinc-900/80 bg-zinc-950/80 px-4 backdrop-blur-md transition-colors duration-200">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="-ml-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900" />
              <Separator orientation="vertical" className="mr-2 h-4 bg-zinc-800" />
              <Breadcrumb>
                <BreadcrumbList className="text-xs">
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setWorkspaceView("chat");
                      }}
                      className="text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      Companies
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block text-zinc-600" />
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      href="#"
                      className="text-zinc-200 font-medium hover:text-white transition-colors"
                    >
                      {workspaceView === "ingest" ? "New Ingestion" : selectedCompany.name}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-zinc-600" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-zinc-400 font-mono">
                      {workspaceView === "ingest" ? "Ingestion Studio" : "Intelligence Chat"}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* Right Header Status Badges, Controls & Mode Toggle */}
            <div className="flex items-center gap-2 sm:gap-2.5">
              {isConversationActive && (
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                  title="Reset conversation"
                >
                  <ArrowCounterClockwise className="size-3.5" />
                  <span className="hidden sm:inline">New Chat</span>
                </button>
              )}

              {activeEvidence.length > 0 && (
                <button
                  type="button"
                  onClick={() => openDrawerWithEvidence()}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-300 transition-colors"
                >
                  <SidebarIcon className="size-3.5 text-brand-primary" />
                  <span>Sources ({activeEvidence.length})</span>
                </button>
              )}

              {/* Visual vs Text View Mode Toggle */}
              <div className="inline-flex items-center p-0.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/80 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setViewMode("visual")}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === "visual"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-semibold"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                  title="Generative Visual UI mode"
                >
                  <Sparkle className={`size-3.5 ${viewMode === "visual" ? "text-brand-primary" : ""}`} />
                  <span>Visual</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("text")}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
                    viewMode === "text"
                      ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm font-semibold"
                      : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                  title="Plain text chat mode"
                >
                  <ChatCircleText className="size-3.5" />
                  <span>Text</span>
                </button>
              </div>

              {/* Shadcn Theme Mode Toggle */}
              <ModeToggle />
            </div>
          </header>

          {/* Conditional Render: Ingestion Studio vs Main Chat Canvas */}
          {workspaceView === "ingest" ? (
            <IngestionStudio
              onCompanyIndexed={handleCompanyIndexed}
              onCancel={() => setWorkspaceView("chat")}
            />
          ) : (
            <main className={`flex-1 flex flex-col items-center justify-between p-4 sm:p-6 w-full ${viewMode === "visual" ? "max-w-5xl" : "max-w-4xl"} mx-auto transition-all`}>
              {/* When Empty: Hero & Suggested Inquiries */}
              {!isConversationActive && (
                <div className="w-full flex-1 flex flex-col justify-center items-center my-8 space-y-6">
                  <div className="text-center max-w-2xl mx-auto space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-medium text-zinc-400">
                      <Stack className="size-3.5 text-zinc-400" />
                      <span>Hybrid Retrieval &bull; Fact Extraction &bull; Generative UI</span>
                    </div>

                    <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-100">
                      {selectedCompany.name} Intelligence
                    </h1>

                    <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed">
                      {selectedCompany.description}
                    </p>
                  </div>

                  {/* Suggested Query Chips */}
                  <div className="w-full max-w-2xl space-y-2.5 pt-2">
                    <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
                      <Sparkle className="size-3.5 text-zinc-500" />
                      <span>Suggested Inquiries for {selectedCompany.name}:</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {selectedCompany.suggestedQueries.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setQuery(item);
                            handleQuerySubmit(item);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 text-zinc-300 px-3 py-1.5 transition-all text-left group"
                        >
                          <span>{item}</span>
                          <ArrowRight className="size-3 text-zinc-500 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Architectural highlights */}
                  <div className="w-full max-w-2xl pt-6 border-t border-zinc-900">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="p-3 rounded-lg border border-zinc-900 bg-zinc-950/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                          <ShieldCheck className="size-4 text-emerald-400" />
                          <span>SSRF Guarded</span>
                        </div>
                        <p className="text-zinc-500 text-[11px]">
                          Private IPs, metadata endpoints & localhost fully restricted.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg border border-zinc-900 bg-zinc-950/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                          <MagnifyingGlass className="size-4 text-brand-primary" />
                          <span>Qdrant Vectors</span>
                        </div>
                        <p className="text-zinc-500 text-[11px]">
                          1536-dim HNSW indexing with cached sub-10ms queries.
                        </p>
                      </div>

                      <div className="p-3 rounded-lg border border-zinc-900 bg-zinc-950/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
                          <Lightning className="size-4 text-amber-400" />
                          <span>Grounded RAG</span>
                        </div>
                        <p className="text-zinc-500 text-[11px]">
                          Deterministic fact extraction & verifiable cited source blocks.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* When Active: Conversation Messages Stream */}
              {isConversationActive && (
                <div className="w-full space-y-6 my-4 pb-8 flex-1">
                  {messages.map((msg) => (
                    <ChatMessageItem
                      key={msg.id}
                      message={msg}
                      companyName={selectedCompany.name}
                      brandColor={selectedCompany.brandColor}
                      onOpenEvidence={openDrawerWithEvidence}
                      viewMode={viewMode}
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Bottom Docked PromptInput */}
              <div className="w-full sticky bottom-4 z-20 pt-2">
                <PromptInput
                  value={query}
                  onValueChange={setQuery}
                  onSubmit={handleQuerySubmit}
                  isSubmitting={isStreaming}
                  className="w-full border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur-2xl"
                >
                  <PromptInputBody>
                    <PromptInputTextarea
                      placeholder={`Ask anything about ${selectedCompany.name} (e.g. pricing tiers, API limits, HQ location)...`}
                      className="text-sm text-zinc-100 placeholder-zinc-500 py-1"
                      minHeight={52}
                    />
                  </PromptInputBody>

                  <PromptInputFooter>
                    <PromptInputTools>
                      <PromptInputBadge
                        icon={Buildings}
                        label={selectedCompany.domain}
                        className="bg-zinc-900/90 border-zinc-800 text-zinc-300"
                      />
                      <PromptInputBadge
                        icon={Stack}
                        label="Qdrant HNSW"
                        className="hidden sm:inline-flex bg-zinc-900/50 border-zinc-800/80 text-zinc-400"
                      />
                    </PromptInputTools>

                    <div className="flex items-center gap-2">
                      <span className="hidden sm:inline-block text-[11px] text-zinc-500 font-mono">
                        Return to send
                      </span>
                      <PromptInputSubmit
                        className="bg-zinc-100 hover:bg-white text-zinc-950 cursor-pointer"
                        aria-label="Submit prompt"
                      />
                    </div>
                  </PromptInputFooter>
                </PromptInput>
              </div>
            </main>
          )}
        </SidebarInset>

        {/* Collapsible Evidence Drawer */}
        <EvidenceDrawer
          isOpen={isDrawerOpen}
          onClose={closeDrawer}
          evidence={activeEvidence}
          selectedEvidence={selectedEvidence}
        />
      </div>
    </SidebarProvider>
  );
}
