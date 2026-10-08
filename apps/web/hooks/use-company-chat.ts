"use client";

import { useState, useCallback, useRef } from "react";

import { apiClient } from "@/lib/api-client";
import { applyWidgetTheme, mapBrandToWidgetTheme } from "@ag-ui/shared/client";
import { coalesceVoiceLines } from "@/lib/voice-transcript";
import type { VoiceLine } from "@/components/voice/voice-session";

export interface EvidenceItem {
  id: string;
  title: string;
  url: string;
  snippet: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  stage?: "idle" | "retrieving" | "synthesizing" | "done" | "error";
  stageMessage?: string;
  evidence?: EvidenceItem[];
  createdAt: Date;
}

export interface BrandTokens {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  style?: string;
  radius?: string;
}

export function useCompanyChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStage, setCurrentStage] = useState<
    "idle" | "retrieving" | "synthesizing" | "done" | "error"
  >("idle");
  const [activeEvidence, setActiveEvidence] = useState<EvidenceItem[]>([]);
  const [activeBrand, setActiveBrand] = useState<BrandTokens | null>(null);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const appliedBrandVersionRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (
      text: string,
      companyIdOrKey: string,
      options?: { apiBase?: string; channel?: "chat" | "embed" }
    ) => {
      if (!text.trim() || isStreaming) return;

      const userMessageId = `user-${Date.now()}`;
      const assistantMessageId = `assistant-${Date.now()}`;

      const userMsg: ChatMessage = {
        id: userMessageId,
        role: "user",
        content: text.trim(),
        createdAt: new Date(),
      };

      const assistantMsg: ChatMessage = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        stage: "retrieving",
        stageMessage: "Performing hybrid search across knowledge base...",
        evidence: [],
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);
      setCurrentStage("retrieving");

      // Abort previous if any
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const channel = options?.channel ?? "chat";
      const streamFn =
        channel === "embed"
          ? (
              payload: { message: string; conversationId?: string },
              callbacks: Parameters<typeof apiClient.chat.stream>[2],
              signal?: AbortSignal
            ) =>
              apiClient.embed.streamChat(
                companyIdOrKey,
                payload,
                callbacks,
                signal,
                options?.apiBase
              )
          : (
              payload: { message: string; conversationId?: string },
              callbacks: Parameters<typeof apiClient.chat.stream>[2],
              signal?: AbortSignal
            ) => apiClient.chat.stream(companyIdOrKey, payload, callbacks, signal);

      try {
        await streamFn(
          {
            message: text.trim(),
            conversationId: activeConversationId || undefined,
          },
          {
            onStatus: (data) => {
              setCurrentStage(data.stage);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? { ...m, stage: data.stage, stageMessage: data.message }
                    : m
                )
              );
            },
            onBrand: (data) => {
              setActiveBrand(data);
              try {
                // Skip when the theme version hasn't moved (every chat turn
                // re-yields brand; re-apply only on real theme changes).
                const version =
                  (data as any)?.themeVersion !== undefined
                    ? String((data as any).themeVersion)
                    : `tokens:${JSON.stringify((data as any)?.tokens ?? null)}`;
                if (appliedBrandVersionRef.current === version) return;
                appliedBrandVersionRef.current = version;
                applyWidgetTheme(
                  document.documentElement,
                  mapBrandToWidgetTheme(data?.tokens, (data as any)?.logoUrl)
                );
              } catch {
                // non-DOM environment — no-op
              }
            },
            onEvidence: (evidenceList) => {
              setActiveEvidence(evidenceList);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, evidence: evidenceList } : m
                )
              );
            },
            onDelta: (data) => {
              const deltaText = data.text || "";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        content: m.content + deltaText,
                        stage: "synthesizing",
                      }
                    : m
                )
              );
            },
            onDone: (data) => {
              setCurrentStage("done");
              if (data?.conversationId) {
                setActiveConversationId(data.conversationId);
              }
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, stage: "done" } : m
                )
              );
            },
            onError: (errData) => {
              setCurrentStage("error");
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId
                    ? {
                        ...m,
                        stage: "error",
                        stageMessage: errData?.message || "An error occurred",
                      }
                    : m
                )
              );
            },
          },
          controller.signal
        );
      } catch (err: any) {
        if (err.name === "AbortError") return;
        setCurrentStage("error");
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  stage: "error",
                  stageMessage: err.message || "Failed to connect to chat API",
                }
              : m
          )
        );
      } finally {
        setIsStreaming(false);
      }
    },
    [activeConversationId, isStreaming]
  );

  const clearMessages = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setIsStreaming(false);
    setCurrentStage("idle");
    setActiveEvidence([]);
    setActiveConversationId(null);
  }, []);

  const openDrawerWithEvidence = useCallback((evidenceItem?: EvidenceItem) => {
    setSelectedEvidence(evidenceItem || null);
    setIsDrawerOpen(true);
  }, []);

  /**
   * Append finalized voice-call utterances as plain text messages (v1).
   * Local-only: no network, no SSE, no evidence, no persistence —
   * voice answers never carry citations they were not grounded with.
   */
  const appendVoiceTranscript = useCallback((lines: VoiceLine[]) => {
    const deduped = coalesceVoiceLines(lines);
    const stamp = Date.now();
    const mapped: ChatMessage[] = deduped
      .filter((l) => l.text.trim().length > 0)
      .map((l, i) => ({
        id: `${l.speaker}-voice-${stamp}-${i}`,
        role: l.speaker === "agent" ? ("assistant" as const) : ("user" as const),
        content: l.text.trim(),
        stage: "done" as const,
        evidence: [],
        createdAt: new Date(),
      }));
    if (mapped.length === 0) return;
    setMessages((prev) => [...prev, ...mapped]);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setSelectedEvidence(null);
  }, []);

  return {
    messages,
    isStreaming,
    currentStage,
    activeEvidence,
    activeBrand,
    activeConversationId,
    sendMessage,
    clearMessages,
    appendVoiceTranscript,
    isDrawerOpen,
    selectedEvidence,
    openDrawerWithEvidence,
    closeDrawer,
  };
}
