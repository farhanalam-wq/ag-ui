"use client";

import { useState, useCallback, useRef } from "react";

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
        const res = await fetch(`http://localhost:3001/api/companies/${companyId}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: text.trim(),
            conversationId: activeConversationId || undefined,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Chat API error (${res.status}): ${errText}`);
        }

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error("No readable stream received from chat API");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() || "";

          for (const block of blocks) {
            const trimmed = block.trim();
            if (!trimmed) continue;

            let eventType = "message";
            let eventDataString = "";

            const lines = trimmed.split("\n");
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.replace("event:", "").trim();
              } else if (line.startsWith("data:")) {
                eventDataString = line.replace("data:", "").trim();
              }
            }

            if (!eventDataString) continue;

            try {
              let parsed = JSON.parse(eventDataString);
              let payload = parsed;

              // If Elysia enveloped generator yield: { event: string, data: any }
              if (parsed && typeof parsed === "object" && "event" in parsed && "data" in parsed) {
                eventType = parsed.event;
                payload = parsed.data;
              }

              if (eventType === "status") {
                setCurrentStage(payload.stage);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, stage: payload.stage, stageMessage: payload.message }
                      : m
                  )
                );
              } else if (eventType === "brand") {
                setActiveBrand(payload);
                if (payload.tokens?.colors?.primary) {
                  document.documentElement.style.setProperty(
                    "--brand-primary",
                    payload.tokens.colors.primary
                  );
                }
              } else if (eventType === "evidence") {
                const evidenceList = Array.isArray(payload) ? payload : [];
                setActiveEvidence(evidenceList);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId ? { ...m, evidence: evidenceList } : m
                  )
                );
              } else if (eventType === "delta") {
                const deltaText = payload.text || "";
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
              } else if (eventType === "visual") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId ? { ...m, visualSpec: payload } : m
                  )
                );
              } else if (eventType === "done") {
                setCurrentStage("done");
                if (payload?.conversationId) {
                  setActiveConversationId(payload.conversationId);
                }
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId ? { ...m, stage: "done" } : m
                  )
                );
              } else if (eventType === "error") {
                setCurrentStage("error");
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? {
                          ...m,
                          stage: "error",
                          stageMessage: payload?.message || "An error occurred",
                        }
                      : m
                  )
                );
              }
            } catch {
              // Ignore non-JSON or partial frames
            }
          }
        }
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
