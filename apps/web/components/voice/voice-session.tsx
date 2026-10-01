"use client";

import "@livekit/components-styles";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  isTrackReference,
  useLocalParticipant,
  useRoomContext,
  useVoiceAssistant,
} from "@livekit/components-react";
import {
  Track,
  MediaDeviceFailure,
  createAudioAnalyser,
  type LocalAudioTrack,
  type RemoteAudioTrack,
  type TextStreamReader,
} from "livekit-client";
import { fetchVoiceToken, resolveLivekitUrl } from "@/lib/voice-client";

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

const VoiceSessionContext = createContext<VoiceController | null>(null);

export function useVoiceSession(): VoiceController {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) throw new Error("useVoiceSession must be used within a VoiceSession");
  return ctx;
}

export interface VoiceSessionProps {
  companyId?: string;
  widgetKey?: string;
  apiBase?: string;
  metadata?: { customer?: { name?: string } };
  /** Called once per ended call with finalized utterances (no live transcript UI v1). */
  onFinalLines?: (lines: VoiceLine[]) => void;
  children: (controller: VoiceController) => React.ReactNode;
}

/**
 * Owns one voice call: token fetch -> LiveKit join -> silent
 * `lk.transcription` buffering -> disconnect -> finalized lines out.
 * Render-prop children receive the controller (mic/X button, bars).
 */
export function VoiceSession({
  companyId,
  widgetKey,
  apiBase,
  metadata,
  onFinalLines,
  children,
}: VoiceSessionProps) {
  const [mounted, setMounted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [serverUrl, setServerUrl] = useState("");
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);

  const linesRef = useRef(new Map<string, VoiceLine>());
  const orderRef = useRef<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const finalizedRef = useRef(false);
  const roomRef = useRef<{ disconnect: () => Promise<void> } | null>(null);
  const intentionalStopRef = useRef(false);
  const onFinalLinesRef = useRef(onFinalLines);
  onFinalLinesRef.current = onFinalLines;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Abort any in-flight token fetch on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    const lines = orderRef.current
      .map((id) => linesRef.current.get(id))
      .filter((l): l is VoiceLine => !!l && l.text.trim().length > 0)
      .map((l) => ({ ...l, text: l.text.trim() }));
    linesRef.current.clear();
    orderRef.current = [];
    setToken(null);
    setLevel(0);
    setAgentSpeaking(false);
    setError(null);
    setStatus("idle");
    if (lines.length > 0) onFinalLinesRef.current?.(lines);
  }, []);

  const stop = useCallback(() => {
    // Mark intentional so late LiveKit onError events (e.g. DATA_TRACK_LOSSY
    // close during teardown) are ignored instead of surfacing as errors.
    intentionalStopRef.current = true;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (status === "fetching") {
      setStatus("idle");
      setError(null);
      return;
    }
    // Explicit disconnect first: unmounting LiveKitRoom by nulling the token
    // does not reliably fire onDisconnected, which previously left status
    // stuck at "live" with the X button dead.
    try {
      const room = roomRef.current as unknown as {
        disconnect?: (stopLocal?: boolean) => Promise<void> | void;
      } | null;
      if (room && typeof room.disconnect === "function") {
        Promise.resolve(room.disconnect()).catch(() => undefined);
      }
    } catch {
      // Disconnect is best-effort; finalize below still resets state.
    }
    roomRef.current = null;
    if (token) setToken(null);
    // finalize is idempotent: onDisconnected firing later is a no-op.
    // Live + connecting + error all finalize here so X always returns to mic.
    if (status === "live" || status === "connecting" || status === "error") finalize();
    else if (!token) setStatus("idle");
  }, [status, token, finalize]);

  const start = useCallback(() => {
    if (status === "fetching" || status === "connecting" || status === "live") return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    linesRef.current.clear();
    orderRef.current = [];
    finalizedRef.current = false;
    intentionalStopRef.current = false;
    roomRef.current = null;
    setError(null);
    setStatus("fetching");

    fetchVoiceToken({ companyId, widgetKey, apiBase, metadata }, controller.signal)
      .then((minted) => {
        if (controller.signal.aborted) return;
        const url = resolveLivekitUrl(minted);
        if (!url) throw new Error("Voice is not available right now");
        abortRef.current = null;
        setToken(minted.token);
        setServerUrl(url);
        setStatus("connecting");
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        abortRef.current = null;
        setError(err instanceof Error ? err.message : "Could not start the voice call");
        setStatus("error");
      });
  }, [status, companyId, widgetKey, apiBase, metadata]);

  const handleLevel = useCallback((next: number, speaking: boolean) => {
    setLevel((prev) => (Math.abs(prev - next) < 0.02 ? prev : next));
    setAgentSpeaking((prev) => (prev === speaking ? prev : speaking));
  }, []);

  const controller = useMemo<VoiceController>(
    () => ({
      status,
      error,
      level,
      agentSpeaking,
      isLive: status === "live",
      start,
      stop,
    }),
    [status, error, level, agentSpeaking, start, stop]
  );

  return (
    <VoiceSessionContext.Provider value={controller}>
      {children(controller)}
      {mounted && token ? (
        <LiveKitRoom
          serverUrl={serverUrl}
          token={token}
          connect
          audio
          video={false}
          onConnected={() => {
            // Fresh connect clears any prior intentional-stop flag.
            intentionalStopRef.current = false;
            setStatus("live");
          }}
          onDisconnected={finalize}
          onError={(err: Error) => {
            // Ignore teardown noise: intentional stop or already finalized
            // (e.g. publisher DATA_TRACK_LOSSY close, empty {} errors).
            if (intentionalStopRef.current || finalizedRef.current) {
              console.debug("[VOICE] Ignored LiveKit error after intentional stop:", err);
              return;
            }
            console.error("[VOICE] LiveKit room error:", err);
            const msg =
              err && typeof (err as Error).message === "string" && (err as Error).message
                ? (err as Error).message
                : "Voice connection failed";
            setError(msg);
            setStatus("error");
          }}
          onMediaDeviceFailure={(failure?: MediaDeviceFailure) => {
            const micBlocked =
              failure === MediaDeviceFailure.PermissionDenied ||
              failure === MediaDeviceFailure.NotFound;
            setError(
              micBlocked
                ? "Microphone blocked — allow access and use HTTPS"
                : "Microphone unavailable — try again"
            );
            setStatus("error");
          }}
        >
          <RoomAudioRenderer />
          <RoomCapture roomRef={roomRef} />
          <TranscriptCollector linesRef={linesRef} orderRef={orderRef} />
          <VoiceLevelPublisher onLevel={handleLevel} />
        </LiveKitRoom>
      ) : null}
    </VoiceSessionContext.Provider>
  );
}

/** Captures the LiveKit Room so stop() can explicitly disconnect before unmount. */
function RoomCapture({
  roomRef,
}: {
  roomRef: React.MutableRefObject<{ disconnect: () => Promise<void> } | null>;
}) {
  const room = useRoomContext();
  useEffect(() => {
    roomRef.current = room as unknown as { disconnect: () => Promise<void> };
    return () => {
      // Only clear if it still points at this room (avoids StrictMode races).
      if (roomRef.current === (room as unknown as { disconnect: () => Promise<void> })) {
        roomRef.current = null;
      }
    };
  }, [room, roomRef]);
  return null;
}

/** Silently buffers both sides of the call from lk.transcription (no UI v1). */
function TranscriptCollector({
  linesRef,
  orderRef,
}: {
  linesRef: React.RefObject<Map<string, VoiceLine>>;
  orderRef: React.RefObject<string[]>;
}) {
  const room = useRoomContext();

  useEffect(() => {
    const handler = async (reader: TextStreamReader, from: { identity: string }) => {
      const id = reader.info.id;
      const speaker = from.identity === room.localParticipant.identity ? "you" : "agent";
      if (!linesRef.current.has(id)) {
        linesRef.current.set(id, { id, speaker, text: "" });
        orderRef.current.push(id);
      }
      let text = linesRef.current.get(id)?.text ?? "";
      for await (const chunk of reader) {
        text += chunk;
        linesRef.current.set(id, { id, speaker, text });
      }
    };

    room.registerTextStreamHandler("lk.transcription", handler);
    return () => {
      room.unregisterTextStreamHandler("lk.transcription");
    };
  }, [room, linesRef, orderRef]);

  return null;
}

function audioTrackOf(
  track: unknown
): LocalAudioTrack | RemoteAudioTrack | undefined {
  const t = track as { kind?: unknown } | undefined;
  if (!t || t.kind !== Track.Kind.Audio) return undefined;
  return t as LocalAudioTrack | RemoteAudioTrack;
}

/** Publishes combined mic/agent volume (~10Hz) for the amplitude bars. */
function VoiceLevelPublisher({
  onLevel,
}: {
  onLevel: (level: number, agentSpeaking: boolean) => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const voice = useVoiceAssistant();
  const onLevelRef = useRef(onLevel);
  onLevelRef.current = onLevel;

  const micTrack = audioTrackOf(
    localParticipant.getTrackPublication(Track.Source.Microphone)?.track
  );
  const agentRef = voice.audioTrack;
  const agentTrack = audioTrackOf(
    agentRef && isTrackReference(agentRef) ? agentRef.publication?.track : undefined
  );

  useEffect(() => {
    const analysers: Array<{
      role: "mic" | "agent";
      calculateVolume: () => number;
      cleanup: () => Promise<void>;
    }> = [];
    try {
      if (micTrack) {
        const a = createAudioAnalyser(micTrack);
        analysers.push({ role: "mic", calculateVolume: a.calculateVolume, cleanup: a.cleanup });
      }
      if (agentTrack && agentTrack !== micTrack) {
        const a = createAudioAnalyser(agentTrack);
        analysers.push({ role: "agent", calculateVolume: a.calculateVolume, cleanup: a.cleanup });
      }
    } catch {
      // Analyser unavailable — bars fall back to idle animation.
    }
    if (analysers.length === 0) return;

    let raf = 0;
    let last = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (now - last < 100) return;
      last = now;
      let mic = 0;
      let agent = 0;
      for (const a of analysers) {
        try {
          const v = a.calculateVolume();
          if (a.role === "mic") mic = Math.max(mic, v);
          else agent = Math.max(agent, v);
        } catch {
          // Ignore transient read failures.
        }
      }
      onLevelRef.current(Math.min(1, Math.max(mic, agent)), agent > 0.04);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      for (const a of analysers) {
        a.cleanup().catch(() => undefined);
      }
    };
  }, [micTrack, agentTrack]);

  return null;
}
