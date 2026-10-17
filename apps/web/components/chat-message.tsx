"use client";

import React, { useState } from "react";
import {
  Message,
  MessageContent,
  MessageResponse,
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
} from "@phosphor-icons/react";
import { toast } from "sonner";
import type { ChatMessage as ChatMessageType, EvidenceItem } from "@/hooks/use-company-chat";
import { repairListBreaks } from "@/lib/markdown-format";
import type { WidgetTheme } from "@ag-ui/shared/client";

export interface ChatThemeSlice {
  userBg: WidgetTheme["userBg"];
  userText: WidgetTheme["userText"];
  userRadius: WidgetTheme["userRadius"];
  aiBg: WidgetTheme["aiBg"];
  aiText: WidgetTheme["aiText"];
  aiBorder: WidgetTheme["aiBorder"];
  aiRadius: WidgetTheme["aiRadius"];
  avatarMode: WidgetTheme["avatarMode"];
  avatarBg: WidgetTheme["avatarBg"];
  avatarText: WidgetTheme["avatarText"];
  customAvatarUrl: WidgetTheme["customAvatarUrl"];
  logoUrl: WidgetTheme["logoUrl"];
  linkColor: WidgetTheme["linkColor"];
}

interface ChatMessageProps {
  message: ChatMessageType;
  companyName: string;
  brandColor?: string;
  compact?: boolean;
  theme?: ChatThemeSlice;
  /** Open the evidence sheet, preselecting the given citation. */
  onInspectEvidence: (item?: EvidenceItem) => void;
  /** Answer-only surfaces: hide the citation affordance, keep the copy action. */
  hideEvidence?: boolean;
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
  theme,
  onInspectEvidence,
  hideEvidence = false,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";

  const linkStyle = theme?.linkColor ? { color: theme.linkColor } : undefined;

  // Themed links ride on a per-message component map so the shared static
  // map stays untouched for unthemed surfaces.
  const components = linkStyle
    ? {
        ...markdownComponents,
        a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
            style={linkStyle}
          >
            {children}
          </a>
        ),
      }
    : markdownComponents;

  if (isUser) {
    const bubbleStyle: React.CSSProperties | undefined = theme
      ? {
          ...(theme.userBg ? { backgroundColor: theme.userBg } : null),
          ...(theme.userText ? { color: theme.userText } : null),
          borderRadius: theme.userRadius,
        }
      : undefined;
    return (
      <Message from="user" className={compact ? "max-w-full" : undefined}>
        <MessageContent style={bubbleStyle}>
          <p className="whitespace-pre-wrap">{message.content}</p>
        </MessageContent>
      </Message>
    );
  }
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

  const isRetrieving = message.stage === "retrieving";
  const isSynthesizing = message.stage === "synthesizing";
  const isError = message.stage === "error";

  const textContentWithoutOpenUI = repairListBreaks(extractTextWithoutOpenUI(message.content));

  // Avatar resolution: auto = company logo, else initials; explicit modes
  // override; none hides the tile entirely.
  const avatarMode = theme?.avatarMode ?? "auto";
  const avatarSrc =
    avatarMode === "custom"
      ? theme?.customAvatarUrl ?? null
      : avatarMode === "logo"
        ? (theme?.logoUrl ?? null)
        : avatarMode === "initials"
          ? null
          : (theme?.logoUrl ?? null);
  const showAvatar = avatarMode !== "none";
  const showAvatarImg = showAvatar && !!avatarSrc;

  const aiBubbleStyle: React.CSSProperties | undefined = theme
    ? {
        ...(theme.aiBg ? { backgroundColor: theme.aiBg } : null),
        ...(theme.aiText ? { color: theme.aiText } : null),
        ...(theme.aiBorder ? { borderColor: theme.aiBorder } : null),
        borderRadius: theme.aiRadius,
      }
    : undefined;

  return (
    <Message from="assistant" className={compact ? "max-w-full" : undefined}>
      <div className="flex items-start gap-2.5">
        {/* Company Avatar */}
        {showAvatar &&
          (showAvatarImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarSrc as string}
              alt=""
              aria-hidden="true"
              className={`shrink-0 rounded-lg border border-border object-contain bg-white ${
                compact ? "size-6" : "size-8"
              }`}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className={`flex shrink-0 items-center justify-center rounded-lg border border-border text-xs font-bold ${
                compact ? "size-6 text-[10px]" : "size-8"
              }`}
              style={{
                backgroundColor: theme?.avatarBg ?? `${brandColor}20`,
                color: theme?.avatarText ?? brandColor,
              }}
              aria-hidden="true"
            >
              {companyName.slice(0, 2).toUpperCase()}
            </div>
          ))}

        {/* Message Container */}
        <MessageContent className="min-w-0 flex-1" style={aiBubbleStyle}>
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
            <div
              className={compact ? "text-[13px]" : undefined}
              style={theme?.aiText ? { color: theme.aiText } : undefined}
            >
              <MessageResponse
                isAnimating={isSynthesizing}
                components={components}
              >
                {textContentWithoutOpenUI || message.content}
              </MessageResponse>

              {/* Streaming cursor (static — no pulse loops) */}
              {isSynthesizing && (
                <span className="ml-0.5 inline-block h-4 w-1.5 bg-primary align-middle" />
              )}
            </div>
          )}

          {/* Footer: citations + copy. Answer-only surfaces (hideEvidence)
              keep the copy action but render no citation affordance. */}
          {message.evidence && message.evidence.length > 0 && (
            <div
              className={`flex items-center gap-2 border-t border-border pt-3 ${
                hideEvidence ? "justify-end" : "justify-between"
              }`}
            >
              {!hideEvidence && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onInspectEvidence(message.evidence?.[0])}
                  className="gap-1.5 text-xs text-muted-foreground"
                >
                  <Stack data-icon="inline-start" />
                  <span className="tabular-nums">
                    Sources ({message.evidence.length})
                  </span>
                </Button>
              )}
              <MessageAction
                tooltip="Copy response"
                label="Copy response"
                onClick={handleCopy}
              >
                {copied ? <Check /> : <Copy />}
              </MessageAction>
            </div>
          )}
        </MessageContent>
      </div>
    </Message>
  );
}
