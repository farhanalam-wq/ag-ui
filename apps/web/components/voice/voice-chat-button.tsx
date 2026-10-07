"use client";

import React from "react";
import { CircleNotch, Microphone, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useVoiceSession } from "./voice-context";

const BAR_WEIGHTS = [0.45, 0.75, 1, 0.75, 0.45];
const BAR_MAX_PX = 18;

/**
 * Mic/X toggle for the PromptInput footer. Idle -> mic, active/fetching ->
 * X (cancel/end). Mirrors PromptInputSubmit sizing and language.
 */
export function VoiceChatButton({
  className,
  disabled,
  title,
}: {
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { status, start, stop } = useVoiceSession();
  const busy = status === "fetching" || status === "connecting";
  const active = busy || status === "live";

  return (
    <button
      type="button"
      onClick={active ? stop : start}
      disabled={disabled}
      aria-label={active ? "End voice call" : "Start voice call"}
      title={title ?? (active ? "End voice call" : "Start voice call")}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-all active:scale-95 disabled:pointer-events-none disabled:opacity-30",
        active
          ? "border-red-500/50 bg-red-500/15 text-red-400 hover:bg-red-500/25"
          : "border-zinc-200 dark:border-zinc-800/80 bg-zinc-100 dark:bg-zinc-900/60 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300 dark:hover:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-200",
        className
      )}
    >
      {busy ? (
        <CircleNotch className="h-4 w-4 animate-spin" />
      ) : active ? (
        <X className="h-4 w-4" weight="bold" />
      ) : (
        <Microphone className="h-4 w-4" weight="bold" />
      )}
      <span className="sr-only">{active ? "End voice call" : "Start voice call"}</span>
    </button>
  );
}

/**
 * Inline amplitude bars for the footer row. Real levels while audio flows;
 * gentle idle pulse while live but silent; hidden when idle.
 */
export function VoiceAmplitudeBars({ className }: { className?: string }) {
  const { status, level, agentSpeaking } = useVoiceSession();
  if (status !== "live" && status !== "connecting") return null;

  const live = level > 0.01;

  return (
    <div
      className={cn("flex h-8 items-center gap-[3px] px-1", className)}
      aria-hidden
      title={agentSpeaking ? "Assistant speaking" : "Listening"}
    >
      {BAR_WEIGHTS.map((w, i) => {
        const height = live
          ? Math.max(3, Math.round(level * w * BAR_MAX_PX))
          : undefined;
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] rounded-full bg-brand-primary",
              !live && "voice-bar-idle"
            )}
            style={
              height !== undefined
                ? { height: `${height}px`, opacity: 0.55 + level * 0.45 }
                : { height: "6px", animationDelay: `${i * 120}ms` }
            }
          />
        );
      })}
      <style>{`
        .voice-bar-idle {
          animation: voice-bar-pulse 1.1s ease-in-out infinite;
          opacity: 0.7;
        }
        @keyframes voice-bar-pulse {
          0%,
          100% {
            transform: scaleY(0.5);
          }
          50% {
            transform: scaleY(1.6);
          }
        }
      `}</style>
    </div>
  );
}

/** One-line inline error chip for the footer row (never a modal). */
export function VoiceErrorChip({ className }: { className?: string }) {
  const { status, error } = useVoiceSession();
  if (status !== "error" || !error) return null;
  return (
    <span
      role="alert"
      className={cn(
        "max-w-full truncate text-[11px] font-mono text-red-400",
        className
      )}
    >
      {error}
    </span>
  );
}
