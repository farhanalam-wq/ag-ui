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
  CircleNotch,
  ArrowCounterClockwise,
  Sidebar as SidebarIcon,
} from "@phosphor-icons/react";
import { useCompanyChat } from "@/hooks/use-company-chat";
import { ChatMessageItem } from "@/components/chat-message";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { IngestionStudio } from "@/components/ingestion/ingestion-studio";
import { VoiceSession } from "@/components/voice/voice-session";
import {
  VoiceAmplitudeBars,
  VoiceChatButton,
  VoiceErrorChip,
} from "@/components/voice/voice-chat-button";
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
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

export default function PlaygroundPage() {
  const router = useRouter();
  const companies = useCompanyStore((s) => s.companies);
  const isLoadingCompanies = useCompanyStore((s) => s.isLoading);
  const selectedCompany = useSelectedCompany();
  const [query, setQuery] = useState("");
  const [workspaceView, setWorkspaceView] = useState<"chat" | "ingest">("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Suppressed voice appends on company switch: partial utterances from the
  // previous company must never land in the new company's thread.
  const discardVoiceRef = useRef(false);

  const {
    messages,
    isStreaming,
    activeEvidence,
    sendMessage,
    clearMessages,
    appendVoiceTranscript,
    isDrawerOpen,
    selectedEvidence,
    openDrawerWithEvidence,
    closeDrawer,
  } = useCompanyChat();

  // Resolve companies from the backend API into the shared store.
  useEffect(() => {
    if (useCompanyStore.getState().companies.length > 0) {
      useCompanyStore.getState().setLoading(false);
      return;
    }
    async function fetchApiCompanies() {
      useCompanyStore.getState().setLoading(true);
      try {
        const apiList = await apiClient.companies.list();

        if (apiList.length > 0) {
          const dynamicList: CompanyItem[] = apiList.map((apiComp) => {
            const brandColor = apiComp.brand?.tokens?.colors?.primary || "#3b82f6";
            const docCount = apiComp.docCount ?? apiComp.latestSnapshot?.pageCount ?? 0;
            const chunkCount = apiComp.chunkCount ?? 0;
            const factCount = apiComp.factCount ?? 0;
            const status = apiComp.status || apiComp.latestSnapshot?.status || "READY";

            return {
              id: apiComp.id,
              name: apiComp.name,
              domain: apiComp.domain,
              description: `Indexed knowledge base for ${apiComp.name} (${apiComp.domain}).`,
              brandColor,
              badge: `${docCount} Docs • Indexed`,
              docCount,
              chunkCount,
              factCount,
              status,
              suggestedQueries: [
                `What are the core products and APIs provided by ${apiComp.name}?`,
                `What are the pricing tiers, limits, and plan options?`,
                `Where are ${apiComp.name} headquarters and contact options?`,
                `What compliance certifications and security features exist?`,
              ],
            };
          });

          useCompanyStore.getState().setCompanies(dynamicList);
        }
      } catch {
        // No fallback: empty state below handles API failure / zero companies.
      } finally {
        useCompanyStore.getState().setLoading(false);
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
    discardVoiceRef.current = true;
    useCompanyStore.getState().select(company.id);
    clearMessages();
    setQuery("");
  };

  const handleCompanyIndexed = (newCompany: CompanyItem) => {
    discardVoiceRef.current = true;
    useCompanyStore.getState().upsertAndSelect(newCompany);
    clearMessages();
    setQuery("");
    setWorkspaceView("chat");
  };

  const handleQuerySubmit = async (submittedText: string) => {
    if (!submittedText.trim() || isStreaming || !selectedCompany) return;
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
            "--brand-primary": selectedCompany?.brandColor ?? "#3b82f6",
          } as React.CSSProperties
        }
      >
        {/* Collapsible Enterprise App Sidebar */}
        {selectedCompany && (
          <AppSidebar
            companies={companies}
            selectedCompany={selectedCompany}
            onSelectCompany={(comp) => {
              handleSelectCompany(comp);
              setWorkspaceView("chat");
            }}
            onOpenAddCompany={() => router.push("/knowledge/ingest")}
          />
        )}

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
                      {workspaceView === "ingest" ? "New Ingestion" : (selectedCompany?.name ?? "Companies")}
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
          ) : isLoadingCompanies ? (
            <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full">
              <div className="flex flex-col items-center gap-3 text-zinc-500">
                <CircleNotch className="size-6 animate-spin text-zinc-400" />
                <p className="text-xs font-mono">Loading companies…</p>
              </div>
            </main>
          ) : !selectedCompany ? (
            <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 w-full">
              <div className="w-full max-w-md text-center space-y-4">
                <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/60">
                  <Buildings className="size-6 text-zinc-400" />
                </div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-100">
                  No companies yet
                </h1>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Index your first company to start asking questions grounded in its real content.
                </p>
                <button
                  type="button"
                  onClick={() => setWorkspaceView("ingest")}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-100 hover:bg-white text-zinc-950 text-sm font-medium transition-colors"
                >
                  Index a company
                  <ArrowRight className="size-4" />
                </button>
              </div>
            </main>
          ) : (
            <main className="flex-1 flex flex-col items-center justify-between p-4 sm:p-6 w-full max-w-4xl mx-auto transition-all">
              {/* When Empty: Hero & Suggested Inquiries */}
              {!isConversationActive && (
                <div className="w-full flex-1 flex flex-col justify-center items-center my-8 space-y-6">
                  <div className="text-center max-w-2xl mx-auto space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-medium text-zinc-400">
                      <Stack className="size-3.5 text-zinc-400" />
                      <span>Hybrid Retrieval &bull; Fact Extraction &bull; Text Answers</span>
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
                    />
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Bottom Docked PromptInput + Voice Call */}
              <VoiceSession
                key={selectedCompany.id}
                companyId={selectedCompany.id}
                onFinalLines={(lines) => {
                  if (discardVoiceRef.current) {
                    discardVoiceRef.current = false;
                    return;
                  }
                  appendVoiceTranscript(lines);
                }}
              >
                {() => (
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
                      <VoiceErrorChip />
                    </PromptInputTools>

                    <div className="flex items-center gap-2">
                      <VoiceAmplitudeBars />
                      <VoiceChatButton />
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
                )}
              </VoiceSession>
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
