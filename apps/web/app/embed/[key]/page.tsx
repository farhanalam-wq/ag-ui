"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputBadge,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import { Buildings, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { useCompanyChat } from "@/hooks/use-company-chat";
import { ChatMessageItem } from "@/components/chat-message";
import { apiClient, type EmbedConfig } from "@/lib/api-client";
import {
  applyWidgetTheme,
  mapBrandToWidgetTheme,
  widgetThemeVars,
  type WidgetTheme,
} from "@ag-ui/shared";
import { VoiceSession } from "@/components/voice/voice-session";
import {
  VoiceAmplitudeBars,
  VoiceChatButton,
  VoiceErrorChip,
} from "@/components/voice/voice-chat-button";

export const dynamic = "force-dynamic";

const CONFIG_POLL_MS = 5000;
const CONFIG_POLL_MAX = 40;

function suggestedQueriesFor(name: string): string[] {
  return [
    `What are the core products and APIs provided by ${name}?`,
    `What are the pricing tiers, limits, and plan options?`,
    `Where are ${name} headquarters and contact options?`,
  ];
}

export default function EmbedChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawKey = params?.key;
  const widgetKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;

  const apiBase = searchParams.get("api") || undefined;
  const titleOverride = searchParams.get("title") || undefined;
  const colorOverride = searchParams.get("color") || undefined;

  const [phase, setPhase] = useState<"loading" | "indexing" | "chat" | "error">("loading");
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    isStreaming,
    sendMessage,
    appendVoiceTranscript,
    openDrawerWithEvidence,
  } = useCompanyChat();

  const brandColor =
    config?.brand?.tokens?.colors?.primary || colorOverride || "#2563eb";
  const displayName = titleOverride || config?.name || "Assistant";

  // Full per-company theme (sanitized). Server `theme` wins when present;
  // otherwise map locally. colorOverride wins for primary only.
  const appliedThemeVersion = React.useRef<string | null>(null);
  const theme: WidgetTheme = React.useMemo(() => {
    const server = config?.theme;
    const base: WidgetTheme =
      server && typeof server.primary === "string"
        ? {
            primary: server.primary,
            secondary: server.secondary,
            radius: server.radius,
            surface: server.surface,
            text: server.text,
            logoUrl: server.logoUrl,
            fullSurface: server.fullSurface,
          }
        : mapBrandToWidgetTheme(config?.brand?.tokens, config?.brand?.logoUrl);
    if (colorOverride && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorOverride.trim())) {
      return { ...base, primary: colorOverride.trim().toLowerCase() };
    }
    return base;
  }, [config?.brand, config?.theme, colorOverride]);

  const loadConfig = useCallback(async () => {
    if (!widgetKey) {
      setPhase("error");
      setError("Missing widget key");
      return null;
    }
    try {
      const cfg = await apiClient.embed.getConfig(widgetKey, apiBase);
      setConfig(cfg);
      setPhase(cfg.ready ? "chat" : "indexing");
      return cfg;
    } catch (err: any) {
      setPhase("error");
      setError(err.message || "Failed to load assistant");
      return null;
    }
  }, [widgetKey, apiBase]);

  // Apply the full theme (document root for var consumers + local override).
  // Skips re-apply when neither vars nor themeVersion moved (config polls
  // every 5s while indexing; setProperty churn is pointless there).
  useEffect(() => {
    try {
      const fingerprint = JSON.stringify({
        v: widgetThemeVars(theme),
        tv: config?.themeVersion ?? null,
      });
      if (appliedThemeVersion.current === fingerprint) return;
      appliedThemeVersion.current = fingerprint;
      applyWidgetTheme(document.documentElement, theme);
    } catch {
      // non-DOM environment — no-op
    }
  }, [theme, config?.themeVersion]);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      const cfg = await loadConfig();
      if (cancelled) return;
      if (cfg && !cfg.ready && attempts < CONFIG_POLL_MAX) {
        attempts += 1;
        timer = setTimeout(poll, CONFIG_POLL_MS);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loadConfig]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const handleSubmit = useCallback(
    async (text: string) => {
      if (!widgetKey || !text.trim() || isStreaming || phase !== "chat") return;
      await sendMessage(text, widgetKey, { apiBase, channel: "embed" });
    },
    [widgetKey, isStreaming, phase, sendMessage, apiBase]
  );

  const handleOpenEvidence = useCallback(
    (item?: { url?: string }) => {
      if (item?.url) window.open(item.url, "_blank", "noopener,noreferrer");
      else openDrawerWithEvidence();
    },
    [openDrawerWithEvidence]
  );

  return (
    <div
      className="flex flex-col h-[100dvh] w-full bg-background text-foreground antialiased"
      style={{ ...widgetThemeVars(theme), "--brand-primary": brandColor } as React.CSSProperties}
    >
      {/* Header */}
      <header
        className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-800 bg-zinc-950/90 px-3"
        style={
          theme.fullSurface
            ? { backgroundColor: theme.surface, borderColor: theme.secondary, color: theme.text }
            : undefined
        }
      >
        {theme.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={theme.logoUrl}
            alt={`${displayName} logo`}
            className="w-7 h-7 rounded-lg object-contain shrink-0 border border-zinc-800 bg-white"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg font-bold text-[11px] shrink-0 border"
            style={{
              backgroundColor: `${brandColor}20`,
              color: brandColor,
              borderColor: theme.secondary,
              borderRadius: "var(--brand-radius)",
            }}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-zinc-100 truncate">{displayName}</div>
          <div className="text-[10px] font-mono text-zinc-500 truncate">
            {config?.domain || "Company assistant"}
          </div>
        </div>
        {phase === "chat" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Ready
          </span>
        )}
        {phase === "indexing" && (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
            <CircleNotch className="size-3 animate-spin" />
            Indexing
          </span>
        )}
      </header>

      {/* Body */}
      {phase === "loading" && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono animate-pulse">
            <CircleNotch className="size-4 animate-spin" />
            <span>Loading assistant…</span>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300 max-w-sm">
            <WarningCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Assistant unavailable</div>
              <div className="font-mono text-[11px] mt-0.5">{error}</div>
              <button
                type="button"
                onClick={() => {
                  setPhase("loading");
                  setError(null);
                  loadConfig();
                }}
                className="mt-2 px-2.5 py-1 rounded-md border border-red-500/40 hover:bg-red-500/20 text-xs transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "indexing" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center space-y-2 max-w-xs">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-300 animate-pulse font-mono">
              <CircleNotch className="size-3.5 animate-spin" />
              <span>Indexing {config?.domain || "company"}…</span>
            </div>
            <p className="text-[11px] text-zinc-500">
              The knowledge base is being built. Chat opens automatically when ready.
            </p>
          </div>
        </div>
      )}

      {phase === "chat" && (
        <>
          <main className="flex-1 overflow-y-auto p-3 space-y-4">
            {messages.length === 0 && config && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-zinc-400">
                  Ask anything about {config.name}:
                </p>
                {suggestedQueriesFor(config.name).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => {
                      setInput(q);
                      handleSubmit(q);
                    }}
                    className="block w-full text-left text-xs rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 px-3 py-2 text-zinc-300 transition-colors hover:border-[var(--brand-secondary)]"
                    style={{ borderRadius: "var(--brand-radius)" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((msg) => (
              <ChatMessageItem
                key={msg.id}
                message={msg}
                companyName={config?.name || displayName}
                brandColor={brandColor}
                compact
                onOpenEvidence={handleOpenEvidence}
              />
            ))}
            <div ref={messagesEndRef} />
          </main>

          <div className="shrink-0 p-2 border-t border-zinc-800 bg-zinc-950/90">
            <VoiceSession
              key={widgetKey}
              widgetKey={widgetKey}
              apiBase={apiBase}
              onFinalLines={appendVoiceTranscript}
            >
              {() => (
              <PromptInput
              value={input}
              onValueChange={setInput}
              onSubmit={handleSubmit}
              isSubmitting={isStreaming}
              className="w-full border-zinc-800 bg-zinc-900/90 focus-within:border-[var(--brand-primary)]"
            >
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder={`Ask about ${config?.name || "this company"}…`}
                  className="text-[13px] text-zinc-100 placeholder-zinc-500 py-1"
                  minHeight={40}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputBadge
                    icon={Buildings}
                    label={config?.domain || "assistant"}
                    className="bg-zinc-800/80 border-zinc-700/60 text-zinc-300"
                  />
                  <VoiceErrorChip />
                </PromptInputTools>
                <div className="flex items-center gap-1.5">
                  <VoiceAmplitudeBars />
                  <VoiceChatButton
                    disabled={phase !== "chat"}
                    title={phase !== "chat" ? "Available when Ready" : undefined}
                  />
                <PromptInputSubmit
                  className="bg-zinc-100 hover:bg-white text-zinc-950 cursor-pointer"
                  aria-label="Submit prompt"
                />
                </div>
              </PromptInputFooter>
              </PromptInput>
              )}
            </VoiceSession>
          </div>
        </>
      )}
    </div>
  );
}
