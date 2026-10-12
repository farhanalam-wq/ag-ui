"use client";

import React, { useState } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  MagnifyingGlass,
  Sparkle,
  Copy,
  Check,
  Stack,
  WarningCircle,
  Eye,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { ChatMessage as ChatMessageType, EvidenceItem } from "@/hooks/use-company-chat";
import { repairListBreaks } from "@/lib/markdown-format";

interface ChatMessageProps {
  message: ChatMessageType;
  companyName: string;
  brandColor?: string;
  compact?: boolean;
  onOpenEvidence: (item?: EvidenceItem) => void;
}

function extractTextWithoutOpenUI(content: string): string {
  return content.replace(/```openui[\s\S]*?(?:```|$)/g, "").trim();
}

// Markdown element styling on semantic tokens (mono confined to code roles).
const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mt-4 mb-2 text-lg font-bold text-foreground">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mt-3 mb-1.5 text-base font-semibold text-foreground">
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mt-2 mb-1 text-sm font-semibold text-foreground">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1.5 text-sm leading-relaxed text-muted-foreground">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-2 list-inside list-disc text-sm text-muted-foreground">
      {children}
    </ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-2 list-inside list-decimal text-sm text-muted-foreground">
      {children}
    </ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-muted-foreground [&>p]:m-0 [&>p]:inline">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  code: ({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) => {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : "";
    // Suppress any legacy OpenUI code blocks (text-only mode)
    if (language === "openui" || className === "openui") {
      return null;
    }

    const isBlock = Boolean(className);
    return isBlock ? (
      <pre className="my-2 overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs text-foreground">
        <code>{children}</code>
      </pre>
    ) : (
      <code className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
        {children}
      </code>
    );
  },
};

export function ChatMessageItem({
  message,
  companyName,
  brandColor = "#3b82f6",
  compact = false,
  onOpenEvidence,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // Clipboard unavailable — still confirm the intent.
    }
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (isUser) {
    return (
      <Message from="user" className={compact ? "max-w-full" : undefined}>
        <MessageContent>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </MessageContent>
      </Message>
    );
  }

  const isRetrieving = message.stage === "retrieving";
  const isSynthesizing = message.stage === "synthesizing";
  const isError = message.stage === "error";

  const textContentWithoutOpenUI = repairListBreaks(extractTextWithoutOpenUI(message.content));

  return (
    <Message from="assistant" className={compact ? "max-w-full" : undefined}>
      <div className="flex items-start gap-2.5">
        {/* Company Avatar */}
        <div
          className={`flex shrink-0 items-center justify-center rounded-lg border border-border text-xs font-bold ${
            compact ? "size-6 text-[10px]" : "size-8"
          }`}
          style={{
            backgroundColor: `${brandColor}20`,
            color: brandColor,
          }}
          aria-hidden="true"
        >
          {companyName.slice(0, 2).toUpperCase()}
        </div>

        {/* Message Container */}
        <MessageContent className="min-w-0 flex-1">
          {/* Reasoning stages (transient — unmounts when done) */}
          {(isRetrieving || (isSynthesizing && !message.content)) && (
            <ChainOfThought defaultOpen>
              <ChainOfThoughtHeader>
                {isRetrieving ? "Searching snapshot…" : "Composing answer…"}
              </ChainOfThoughtHeader>
              <ChainOfThoughtContent>
                <ChainOfThoughtStep
                  icon={MagnifyingGlass}
                  label={
                    isRetrieving
                      ? message.stageMessage || "Searching snapshot…"
                      : "Searched snapshot"
                  }
                  status={isRetrieving ? "active" : "complete"}
                />
                {!isRetrieving && (
                  <ChainOfThoughtStep
                    icon={Sparkle}
                    label={message.stageMessage || "Composing grounded answer…"}
                    status="active"
                  />
                )}
              </ChainOfThoughtContent>
            </ChainOfThought>
          )}

          {/* Error Banner */}
          {isError && (
            <Alert variant="destructive">
              <WarningCircle className="size-4" />
              <AlertTitle>Response failed</AlertTitle>
              <AlertDescription>
                {message.stageMessage || "Failed to generate response."}
              </AlertDescription>
            </Alert>
          )}

          {/* Assistant Answer Body */}
          {message.content && (
            <div className={compact ? "text-[13px]" : undefined}>
              <MessageResponse
                isAnimating={isSynthesizing}
                components={markdownComponents}
              >
                {textContentWithoutOpenUI || message.content}
              </MessageResponse>

              {/* Streaming cursor (static — no pulse loops) */}
              {isSynthesizing && (
                <span className="ml-0.5 inline-block h-4 w-1.5 bg-primary align-middle" />
              )}
            </div>
          )}

          {/* Citations Footer */}
          {message.evidence && message.evidence.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Stack className="size-3" />
                  Sources:
                </span>
                {message.evidence.slice(0, 4).map((ev, idx) => (
                  <button
                    key={ev.id || idx}
                    type="button"
                    onClick={() => onOpenEvidence(ev)}
                    className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <span>[{idx + 1}]</span>
                    <span className="max-w-[120px] truncate">{ev.title || "Doc"}</span>
                  </button>
                ))}
                {message.evidence.length > 4 && (
                  <button
                    type="button"
                    onClick={() => onOpenEvidence()}
                    className="ml-1 font-mono text-[11px] text-muted-foreground underline hover:text-foreground"
                  >
                    +{message.evidence.length - 4} more
                  </button>
                )}
              </div>

              <MessageActions>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenEvidence()}
                  className="gap-1 text-xs text-muted-foreground"
                >
                  <Eye data-icon="inline-start" />
                  <span>Inspect Evidence ({message.evidence.length})</span>
                </Button>
                <MessageAction
                  tooltip="Copy response"
                  label="Copy response"
                  onClick={handleCopy}
                >
                  {copied ? <Check /> : <Copy />}
                </MessageAction>
              </MessageActions>
            </div>
          )}
        </MessageContent>
      </div>
    </Message>
  );
}
