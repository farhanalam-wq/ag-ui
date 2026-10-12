"use client";

import React, { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Buildings,
  Sparkle,
  ArrowRight,
  CircleNotch,
  ArrowCounterClockwise,
  Sidebar as SidebarIcon,
} from "@phosphor-icons/react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { useCompanyChat } from "@/hooks/use-company-chat";
import { ChatMessageItem } from "@/components/chat-message";
// Evidence drawer only renders when opened: load on demand. Same props once loaded.
const EvidenceDrawer = dynamic(
  () =>
    import("@/components/evidence-drawer").then((m) => m.EvidenceDrawer),
  { ssr: false }
);
// Heavy LiveKit session loads on demand (client-only) so the initial
// playground chunk stays light. Same props/behavior once loaded.
const VoiceSession = dynamic(
  () => import("@/components/voice/voice-session").then((m) => m.VoiceSession),
  { ssr: false }
);
import {
  VoiceAmplitudeBars,
  VoiceChatButton,
  VoiceErrorChip,
} from "@/components/voice/voice-chat-button";
import { StudioShell } from "@/components/studio-shell";
import { Button } from "@/components/ui/button";
import type { CompanyItem } from "@/components/sidebar/company-switcher";
import { useCompanyStore, useSelectedCompany } from "@/stores/use-company-store";

export default function PlaygroundPage() {
  const router = useRouter();
  const isLoadingCompanies = useCompanyStore((s) => s.isLoading);
  const selectedCompany = useSelectedCompany();
  const [query, setQuery] = useState("");
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
    selectEvidence,
    closeDrawer,
  } = useCompanyChat();

  // Companies resolve through the shared store loader (single fetch path).
  useEffect(() => {
    useCompanyStore.getState().ensureCompanies();
  }, []);

  const handleSelectCompany = (company: CompanyItem) => {
    discardVoiceRef.current = true;
    useCompanyStore.getState().select(company.id);
    clearMessages();
    setQuery("");
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
    <StudioShell
      crumbs={[{ label: "Playground" }]}
      onSelectCompany={handleSelectCompany}
    >
      {/* Fixed-height Lab column: header + scroll region + dock (no page scroll) */}
      <div className="flex h-[calc(100dvh-6.5rem)] min-h-[480px] flex-col gap-4">
      {/* PageHeader: title + sub left, controls right */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-semibold leading-9 tracking-tight">
            {selectedCompany ? `${selectedCompany.name} Playground` : "Playground"}
          </h1>
          <p className="mt-1 max-w-[65ch] text-sm text-muted-foreground">
            Grounded answers from the live snapshot. Cite or inspect every claim.
          </p>
        </div>
        {selectedCompany && (
          <div className="flex items-center gap-2">
            {isConversationActive && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleNewChat}
                title="Reset conversation"
              >
                <ArrowCounterClockwise data-icon="inline-start" />
                <span className="hidden sm:inline">New Chat</span>
              </Button>
            )}
            {activeEvidence.length > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => openDrawerWithEvidence()}
              >
                <SidebarIcon data-icon="inline-start" />
                <span className="tabular-nums">Sources ({activeEvidence.length})</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoadingCompanies ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center p-4 sm:p-6">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <CircleNotch className="size-6 animate-spin" />
            <p className="text-xs">Loading companies…</p>
          </div>
        </div>
      ) : !selectedCompany ? (
        <div className="flex w-full flex-1 flex-col items-center justify-center p-4 sm:p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted">
              <Buildings className="size-6 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">
              No companies yet
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Index your first company to start asking questions grounded in its real content.
            </p>
            <Button
              type="button"
              onClick={() => router.push("/knowledge/ingest")}
            >
              Index a company
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col gap-4">
          {/* When Empty: status + suggestions (left-aligned to PageHeader) */}
          {!isConversationActive && (
            <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 overflow-y-auto py-4 text-center">
              <div className="flex w-full max-w-2xl flex-col items-center gap-2">
                <p className="text-xs tabular-nums text-muted-foreground">
                  Snapshot {selectedCompany.status} &middot; {selectedCompany.docCount} docs
                </p>
              </div>

              {/* Suggested Inquiries */}
              <div className="flex w-full max-w-2xl flex-col gap-2.5">
                <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkle className="size-3.5" />
                  <span>Suggested Inquiries for {selectedCompany.name}:</span>
                </div>

                <div className="flex flex-col gap-2">
                  {selectedCompany.suggestedQueries.map((item, idx) => (
                    <Button
                      key={idx}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery(item);
                        handleQuerySubmit(item);
                      }}
                      className="h-auto w-full justify-between whitespace-normal py-2 text-left text-xs font-normal"
                    >
                      <span>{item}</span>
                      <ArrowRight data-icon="inline-end" />
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* When Active: Conversation Messages Stream (scroll owned by Conversation) */}
          {isConversationActive && (
            <Conversation className="mx-auto min-h-0 w-full max-w-4xl min-w-0 flex-1">
              <ConversationContent className="gap-6 p-0">
                {messages.map((msg) => (
                  <ChatMessageItem
                    key={msg.id}
                    message={msg}
                    companyName={selectedCompany.name}
                    brandColor={selectedCompany.brandColor}
                    onInspectEvidence={(item) => openDrawerWithEvidence(item)}
                  />
                ))}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}

          {/* Bottom Docked PromptInput + Voice Call */}
          <div className="mx-auto w-full max-w-4xl">
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
            <div className="w-full">
            <PromptInput
              value={query}
              onValueChange={setQuery}
              onSubmit={handleQuerySubmit}
              isSubmitting={isStreaming}
              className="rounded-3xl border-border bg-card shadow-none backdrop-blur-none"
            >
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder={`Ask ${selectedCompany.name}…`}
                  minHeight={36}
                />
              </PromptInputBody>

              <PromptInputFooter className="border-t-0 pt-1">
                <PromptInputTools>
                  <VoiceErrorChip />
                </PromptInputTools>

                <div className="flex items-center gap-1.5">
                  <VoiceAmplitudeBars />
                  <VoiceChatButton className="rounded-full border-transparent bg-transparent" />
                  <PromptInputSubmit
                    className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-100 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90"
                    aria-label="Submit prompt"
                  />
                </div>
              </PromptInputFooter>
            </PromptInput>
            </div>
            )}
          </VoiceSession>
          </div>
        </div>
      )}
      </div>

      {/* Collapsible Evidence Drawer */}
      <EvidenceDrawer
        isOpen={isDrawerOpen}
        onClose={closeDrawer}
        evidence={activeEvidence}
        selectedEvidence={selectedEvidence}
        onSelect={selectEvidence}
      />
    </StudioShell>
  );
}
