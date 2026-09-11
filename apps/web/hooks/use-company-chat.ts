"use client";

import { useState, useCallback, useRef } from "react";

import { apiClient } from "@/lib/api-client";

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
  visualSpec?: any;
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

  const sendMessage = useCallback(
    async (text: string, companyId: string) => {
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

      try {
        await apiClient.chat.stream(
          companyId,
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
              if (data.tokens?.colors?.primary) {
                document.documentElement.style.setProperty(
                  "--brand-primary",
                  data.tokens.colors.primary
                );
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
            onVisual: (data) => {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMessageId ? { ...m, visualSpec: data } : m
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
    isDrawerOpen,
    selectedEvidence,
    openDrawerWithEvidence,
    closeDrawer,
  };
}
