"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  User,
  CircleNotch,
  MagnifyingGlass,
  Copy,
  Check,
  Stack,
  WarningCircle,
  Eye,
} from "@phosphor-icons/react";
import type { ChatMessage as ChatMessageType, EvidenceItem } from "@/hooks/use-company-chat";
import { OpenUIRenderer } from "./openui-renderer";

interface ChatMessageProps {
  message: ChatMessageType;
  companyName: string;
  brandColor?: string;
  onOpenEvidence: (item?: EvidenceItem) => void;
  viewMode?: "visual" | "text";
}

function extractOpenUISource(content: string, visualSpec?: any): string | null {
  if (visualSpec?.openui) {
    return visualSpec.openui;
  }
  const match = /```openui\s*([\s\S]*?)(?:```|$)/.exec(content);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

function extractTextWithoutOpenUI(content: string): string {
  return content.replace(/```openui[\s\S]*?(?:```|$)/g, "").trim();
}

export function ChatMessageItem({
  message,
  companyName,
  brandColor = "#3b82f6",
  onOpenEvidence,
  viewMode = "visual",
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <div className="flex justify-end w-full">
        <div className="flex items-start gap-3 max-w-2xl">
          <div className="rounded-2xl rounded-tr-sm bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 shadow-sm">
            <p className="leading-relaxed whitespace-pre-wrap">{message.content}</p>
          </div>
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 shrink-0 mt-0.5">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    );
  }

  const isRetrieving = message.stage === "retrieving";
  const isSynthesizing = message.stage === "synthesizing";
  const isError = message.stage === "error";

  const openuiSource = extractOpenUISource(message.content, message.visualSpec);
  const textContentWithoutOpenUI = extractTextWithoutOpenUI(message.content);
  const hasOpenUI = Boolean(openuiSource);

  // Pure Visual Mode: When in visual view and message has OpenUI, render PURELY the component
  if (viewMode === "visual" && hasOpenUI) {
    return (
      <div className="w-full my-2">
        <OpenUIRenderer source={openuiSource!} isStreaming={isSynthesizing} />
      </div>
    );
  }

  // Text Mode (or fallback when message has no OpenUI component)
  return (
    <div className="flex justify-start w-full">
      <div className="flex items-start gap-3 max-w-3xl w-full">
        {/* Company Avatar */}
        <div
          className="flex items-center justify-center w-8 h-8 rounded-xl font-bold text-xs shrink-0 mt-1 shadow-inner border border-zinc-300 dark:border-zinc-700/60 transition-colors"
          style={{
            backgroundColor: `${brandColor}20`,
            color: brandColor,
          }}
        >
          {companyName.slice(0, 2).toUpperCase()}
        </div>

        {/* Message Container */}
        <div className="flex-1 min-w-0 space-y-3">
          {/* Status Stage Indicator Banner */}
          {(isRetrieving || (isSynthesizing && !message.content)) && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/90 dark:bg-zinc-900/80 text-xs text-zinc-700 dark:text-zinc-300 animate-pulse">
              {isRetrieving ? (
                <>
                  <MagnifyingGlass className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 animate-spin" />
                  <span>{message.stageMessage || "Searching pgvector knowledge base..."}</span>
                </>
              ) : (
                <>
                  <CircleNotch className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 animate-spin" />
                  <span>{message.stageMessage || "Synthesizing answer..."}</span>
                </>
              )}
            </div>
          )}

          {/* Error Banner */}
          {isError && (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
              <WarningCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0" />
              <span>{message.stageMessage || "Failed to generate response."}</span>
            </div>
          )}

          {/* Assistant Answer Body */}
          {message.content && (
            <div className="rounded-2xl rounded-tl-sm border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-5 text-zinc-900 dark:text-zinc-100 shadow-xl backdrop-blur-sm space-y-3">
              <div className="prose dark:prose-invert prose-zinc max-w-none text-sm leading-relaxed space-y-2">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-4 mb-2">{children}</h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mt-3 mb-1.5">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 mt-2 mb-1">{children}</h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed my-1.5">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc list-inside space-y-1 my-2 text-zinc-700 dark:text-zinc-300 text-sm">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal list-inside space-y-1 my-2 text-zinc-700 dark:text-zinc-300 text-sm">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => <li className="text-zinc-700 dark:text-zinc-300">{children}</li>,
                    strong: ({ children }) => (
                      <strong className="font-semibold text-zinc-900 dark:text-zinc-100">{children}</strong>
                    ),
                    code: ({ children, className }) => {
                      const match = /language-(\w+)/.exec(className || "");
                      const language = match ? match[1] : "";
                      // In text mode, completely suppress OpenUI code blocks
                      if (language === "openui" || className === "openui") {
                        return null;
                      }

                      const isBlock = Boolean(className);
                      return isBlock ? (
                        <pre className="p-3 my-2 rounded-lg bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto">
                          <code>{children}</code>
                        </pre>
                      ) : (
                        <code className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 text-xs font-mono border border-zinc-200 dark:border-zinc-700/60">
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {textContentWithoutOpenUI || message.content}
                </ReactMarkdown>

                {/* Streaming blinking cursor */}
                {isSynthesizing && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-brand-primary animate-pulse align-middle" />
                )}
              </div>

              {/* Citations Footer */}
              {message.evidence && message.evidence.length > 0 && (
                <div className="mt-4 pt-3 border-t border-zinc-200 dark:border-zinc-800/60 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-mono text-zinc-500 mr-1 flex items-center gap-1">
                      <Stack className="w-3 h-3 text-zinc-400 dark:text-zinc-500" />
                      Sources:
                    </span>
                    {message.evidence.slice(0, 4).map((ev, idx) => (
                      <button
                        key={ev.id || idx}
                        type="button"
                        onClick={() => onOpenEvidence(ev)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 transition-colors"
                      >
                        <span>[{idx + 1}]</span>
                        <span className="max-w-[120px] truncate">{ev.title || "Doc"}</span>
                      </button>
                    ))}
                    {message.evidence.length > 4 && (
                      <button
                        type="button"
                        onClick={() => onOpenEvidence()}
                        className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 underline ml-1"
                      >
                        +{message.evidence.length - 4} more
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenEvidence()}
                      className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Evidence ({message.evidence.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="p-1.5 rounded text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                      title="Copy response"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
