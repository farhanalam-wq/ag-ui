"use client";

import { useState, useCallback, useRef } from "react";

import { apiClient } from "@/lib/api-client";
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
  tokens?: {
    colors?: {
      primary?: string;
      secondary?: string;
      background?: string;
      foreground?: string;
      muted?: string;
      border?: string;
      card?: string;
      accent?: string;
    };
    typography?: {
      headingFont?: string;
      bodyFont?: string;
    };
    radius?: string;
    style?: string;
    theme?: "light" | "dark" | "auto";
    cssVariables?: Record<string, string>;
    stylesheet?: string;
  };
}

export type NestedBrandTokens = NonNullable<BrandTokens["tokens"]>;

/**
 * The SSE onBrand payload is usually { ..., tokens: {...} }, but older
 * snapshots stream the tokens object itself. Normalize both shapes to the
 * nested tokens — without `any`, so future shape drift is a type error
 * instead of a silent runtime break.
 */
function normalizeTokens(data: BrandTokens): NestedBrandTokens | undefined {
  if (data.tokens && typeof data.tokens === "object") return data.tokens;
  const flat = data as unknown as Partial<NestedBrandTokens>;
  if (flat && typeof flat === "object" && (flat.colors || flat.cssVariables || flat.stylesheet)) {
    return flat as NestedBrandTokens;
  }
  return undefined;
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
              const tokens = normalizeTokens(data);

              // Inject dynamic compiled stylesheet into DOM.
              // Defense in depth: our compiled template never contains these
              // substrings, so their presence means tampered/foreign data.
              if (tokens?.stylesheet && typeof document !== "undefined") {
                const css = String(tokens.stylesheet);
                const looksDangerous = /@import|url\(|expression|behavior\s*:|javascript:/i.test(css);
                if (!looksDangerous && css.length <= 20000) {
                  let styleEl = document.getElementById("ag-brand-dynamic-theme");
                  if (!styleEl) {
                    styleEl = document.createElement("style");
                    styleEl.id = "ag-brand-dynamic-theme";
                    document.head.appendChild(styleEl);
                  }
                  styleEl.textContent = css;
                }
              }

              // Apply namespaced brand CSS custom properties only, so a crawled
              // site can never override arbitrary host-page variables.
              if (tokens?.cssVariables && typeof document !== "undefined") {
                const entries = Object.entries(tokens.cssVariables).slice(0, 30);
                for (const [key, val] of entries) {
                  if (
                    typeof val === "string" &&
                    val.length <= 200 &&
                    /^--brand-[a-z-]+$/.test(key)
                  ) {
                    document.documentElement.style.setProperty(key, val);
                  }
                }
              } else if (tokens?.colors?.primary && typeof document !== "undefined") {
                document.documentElement.style.setProperty(
                  "--brand-primary",
                  tokens.colors.primary
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
    const stamp = Date.now();
    const mapped: ChatMessage[] = lines
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
