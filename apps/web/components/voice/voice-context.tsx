"use client";

import React, { createContext, useContext } from "react";

export interface VoiceLine {
  id: string;
  speaker: "you" | "agent";
  text: string;
}

export type VoiceStatus = "idle" | "fetching" | "connecting" | "live" | "error";

export interface VoiceController {
  status: VoiceStatus;
  /** Display-ready error copy, set only when status === "error". */
  error: string | null;
  /** Combined mic/agent level 0..1, ~10Hz. 0 when idle or analyser unavailable. */
  level: number;
  /** True while the agent's track carries audible audio. */
  agentSpeaking: boolean;
  isLive: boolean;
  start: () => void;
  stop: () => void;
}

export const VoiceSessionContext = createContext<VoiceController | null>(null);

export function useVoiceSession(): VoiceController {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) throw new Error("useVoiceSession must be used within a VoiceSession");
  return ctx;
}
