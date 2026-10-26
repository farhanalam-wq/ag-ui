"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputBadge,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  ArrowRight,
  ArrowUp,
  Buildings,
  Check,
  CircleNotch,
  Microphone,
  MicrophoneSlash,
  PaperPlaneTilt,
  WarningCircle,
  Waveform,
} from "@phosphor-icons/react";
import { useCompanyChat, type ChatMessage } from "@/hooks/use-company-chat";
import { ChatMessageItem } from "@/components/chat-message";
import { apiClient } from "@/lib/api-client";
import {
  applyWidgetTheme,
  cleanHexValue,
  cleanLogoUrlValue,
  cleanRadiusValue,
  contrastRatio,
  isLightSurface,
  isValidOverride,
  mapBrandToWidgetTheme,
  mergeThemeOverride,
  widgetThemeVars,
  type WidgetTheme,
  type WidgetThemeOverride,
} from "@ag-ui/shared/client";
// Heavy LiveKit session loads on demand (client-only) so the initial chat
// chunk stays light.
const VoiceSession = nextDynamic(
  () => import("@/components/voice/voice-session").then((m) => m.VoiceSession),
  { ssr: false }
);
import {
  VoiceAmplitudeBars,
  VoiceChatButton,
  VoiceErrorChip,
} from "@/components/voice/voice-chat-button";

// No `force-dynamic` — the indexing poll is client-side fetch and the
// search-params subtree already sits behind Suspense, so the route prerenders
// a static shell and hydrates per conversation.
const CONFIG_POLL_MS = 5000;
const CONFIG_POLL_MAX = 40;

/**
 * Tell the host page about an agent event.
 *
 * The iframe never emits analytics itself: the parent owns the page context
 * (path, referrer, timezone) and validates the message source before trusting
 * it. Only counts cross this boundary — never a transcript line (O-3).
 *
 * `targetOrigin` must be `"*"`: the host page is a different origin, so a
 * concrete origin would silently drop every message. The security boundary is
 * the parent's `event.source === frame.contentWindow` check, not this value.
 */
function postAgentEvent(
  event: "voice_start" | "voice_end" | "chat_message",
  payload?: Record<string, unknown>
) {
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(
        { type: "ag-ui/agent-event", event, ...(payload ?? {}) },
        "*"
      );
    }
  } catch {
    // No parent, or a sandbox that forbids it — analytics is best-effort.
  }
}

/**
 * The host page path forwarded by the loader, or null.
 *
 * Untrusted: it arrives over postMessage from a cross-origin parent, so it is
 * only accepted as a same-site path (leading `/`, no control characters, no
 * query or hash) and truncated. The API normalises it again before it reaches
 * the database — this check keeps junk out of the request, not out of the DB.
 */
function sanitizeHostPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return null;
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  return trimmed.split(/[?#]/)[0]!.slice(0, 1024) || "/";
}

/**
 * How the chat UI identifies its company. Raw-key identity serves the public
 * widget; company identity serves first-party surfaces (playground-style
 * chat, studio preview) with no key in the URL. Both render the same UI from
 * the same bundle.
 */
export type ChatIdentity =
  | { kind: "key"; widgetKey: string }
  | { kind: "company"; companyId: string };

interface LoadedChatConfig {
  name: string;
  domain: string;
  ready: boolean;
  theme?: Partial<WidgetTheme> | null;
  themeVersion?: string | null;
  brand?: { logoUrl: string | null; tokens: any } | null;
}

function suggestedQueriesFor(name: string): string[] {
  return [
    `What are the core products and APIs provided by ${name}?`,
    `What are the pricing tiers, limits, and plan options?`,
    `Where are ${name} headquarters and contact options?`,
  ];
}

// Validates a full theme object arriving over the preview message channel.
// Base colors are required; every other slot rides through the shared
// override validators, so new control groups need no channel changes.
function sanitizeIncomingTheme(t: unknown): WidgetTheme | null {
  try {
    if (!t || typeof t !== "object") return null;
    const r = t as Record<string, unknown>;
    const primary = cleanHexValue(r.primary);
    const secondary = cleanHexValue(r.secondary);
    const surface = cleanHexValue(r.surface);
    const text = cleanHexValue(r.text);
    if (!primary || !secondary || !surface || !text) return null;
    if (!isValidOverride(t)) return null;
    const base = mapBrandToWidgetTheme(null);
    base.primary = primary;
    base.secondary = secondary;
    base.surface = surface;
    base.text = text;
    const radius = cleanRadiusValue(r.radius);
    if (radius) {
      base.radius = radius;
      base.panelRadius = radius;
      base.userRadius = radius;
      base.aiRadius = radius;
      base.inputRadius = radius;
    }
    const logoRaw = typeof r.logoUrl === "string" && r.logoUrl.trim() ? r.logoUrl : null;
    base.logoUrl = logoRaw ? cleanLogoUrlValue(logoRaw) : null;
    return mergeThemeOverride(base, t as WidgetThemeOverride);
  } catch {
    return null;
  }
}

export function EmbedChat({
  identity,
  apiBase: apiBaseProp,
  noCitations = false,
}: {
  identity: ChatIdentity;
  apiBase?: string;
  /** Answer-only: suppress all citation/evidence UI. Streaming is unchanged. */
  noCitations?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-[100dvh] w-full items-center justify-center bg-background text-foreground antialiased">
          <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono animate-pulse">
            <CircleNotch className="size-4 animate-spin" />
            <span>Loading assistant…</span>
          </div>
        </div>
      }
    >
      <EmbedChatInner identity={identity} apiBase={apiBaseProp} noCitations={noCitations} />
    </Suspense>
  );
}

// Named (not exported from any route file — route files only allow route
// exports) for clarity. Preview tooling mounts the production route in an
// iframe only.
function EmbedChatInner({
  identity,
  apiBase: apiBaseProp,
  noCitations = false,
}: {
  identity: ChatIdentity;
  apiBase?: string;
  noCitations?: boolean;
}) {
  const searchParams = useSearchParams();
  const sessionKey =
    identity.kind === "key" ? identity.widgetKey : identity.companyId;

  const apiBaseFromQuery = searchParams.get("api") || undefined;
  const apiBase = apiBaseProp ?? apiBaseFromQuery;
  const titleOverride = searchParams.get("title") || undefined;
  const colorOverride = searchParams.get("color") || undefined;
  // First-paint surface forwarded by the loader (?surface=&text=, mirrored
  // from the last /config theme so a light brand doesn't flash dark).
  const surfaceParam = searchParams.get("surface") || undefined;
  const textParam = searchParams.get("text") || undefined;
  // Visit identity threaded by the loader (?sh=&vh=): random opaque ids.
  // The conversation row stores them so the studio can later resolve the
  // visit context (device, pages seen, conversion). Absent in the studio
  // preview and on handcrafted URLs — chat still works without them.
  const sessionHashParam = sanitizeIdentityParam(searchParams.get("sh"));
  const visitorHashParam = sanitizeIdentityParam(searchParams.get("vh"));

  const [phase, setPhase] = useState<"loading" | "indexing" | "chat" | "error">("loading");
  const [config, setConfig] = useState<LoadedChatConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // Live preview override, set only via the parent-tooling message channel
  // below. Null in production; a full sanitized theme while previewing.
  const [liveTheme, setLiveTheme] = useState<WidgetTheme | null>(null);
  const [liveVersion, setLiveVersion] = useState<string | null>(null);
  // Host light/dark context (from the studio preview channel). null = no host
  // tooling, i.e. the standalone widget, which defaults to dark chrome.
  const [contextDark, setContextDark] = useState<boolean | null>(null);
  // Host page path, forwarded by the loader. A conversation records it once,
  // so the quality report can say which pages the agent can answer from.
  const hostPathRef = useRef<string | null>(null);
  // Explicit preview mode from host tooling: "auto" follows the brand surface
  // then the context; "light"/"dark" force the neutral chrome (brand colours
  // still win inline, so an override is an inspection mode).
  const [modeOverride, setModeOverride] = useState<"auto" | "light" | "dark">(
    "auto"
  );

  const {
    messages,
    isStreaming,
    sendMessage,
    appendVoiceTranscript,
    openDrawerWithEvidence,
    activeBrand,
    activeConversationId,
  } = useCompanyChat();

  const displayName = titleOverride || config?.name || "Assistant";

  // Full per-company theme (sanitized). Server `theme` wins when present;
  // otherwise map locally. colorOverride wins for primary only (and re-gates
  // accents so an unreadable host override can't claim fullSurface).
  const appliedThemeVersion = React.useRef<string | null>(null);
  const theme: WidgetTheme = React.useMemo(() => {
    // Studio preview channel wins outright (live draft edits).
    if (liveTheme) return liveTheme;
    // Published theme streamed over the chat SSE brand event (already merged
    // + sanitized server-side): repaints open embeds when the studio
    // publishes — no reload required.
    const sseTheme = activeBrand?.theme;
    if (sseTheme && typeof sseTheme.primary === "string") {
      return sseTheme as WidgetTheme;
    }
    const server = config?.theme;
    let base: WidgetTheme =
      server && typeof server.primary === "string"
        ? {
            ...mapBrandToWidgetTheme(null),
            ...server,
            primary: server.primary,
            secondary: server.secondary ?? mapBrandToWidgetTheme(null).secondary,
            radius: server.radius ?? mapBrandToWidgetTheme(null).radius,
            surface: server.surface ?? mapBrandToWidgetTheme(null).surface,
            text: server.text ?? mapBrandToWidgetTheme(null).text,
            logoUrl: server.logoUrl ?? null,
            fullSurface: server.fullSurface ?? false,
            bodySurface: server.bodySurface ?? server.fullSurface ?? false,
            accentOnSurface: server.accentOnSurface ?? server.fullSurface ?? false,
            surfaceSource: (server.surfaceSource as WidgetTheme["surfaceSource"]) ?? "tokens",
          }
        : mapBrandToWidgetTheme(config?.brand?.tokens, config?.brand?.logoUrl);
    // First paint (config not yet loaded): trust the loader-forwarded pair
    // only when the pair passes body contrast on its own — a crafted URL
    // can never paint unreadable text.
    if (!config && isHexParam(surfaceParam) && isHexParam(textParam)) {
      const s = surfaceParam.trim().toLowerCase();
      const tx = textParam.trim().toLowerCase();
      if (contrastRatio(tx, s) >= 4.5) {
        const accent = contrastRatio(base.primary, s) >= 3;
        base = {
          ...base,
          surface: s,
          text: tx,
          bodySurface: true,
          accentOnSurface: accent,
          fullSurface: accent,
          surfaceSource: "embed-query",
        };
      }
    }
    if (colorOverride && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(colorOverride.trim())) {
      const primary = colorOverride.trim().toLowerCase();
      const accentOnSurface = contrastRatio(primary, base.surface) >= 3;
      return { ...base, primary, accentOnSurface, fullSurface: base.bodySurface && accentOnSurface };
    }
    return base;
  }, [config, colorOverride, surfaceParam, textParam, liveTheme, activeBrand]);

  /** Identity params are random ids the loader minted; trim junk URLs down. */
  function sanitizeIdentityParam(raw: string | null): string | undefined {
    if (!raw) return undefined;
    const v = raw.trim();
    // Server caps at 64; anything shorter than 8 is not one of our ids.
    return v.length >= 8 && v.length <= 64 ? v : undefined;
  }

  function isHexParam(v: unknown): v is string {
    return typeof v === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim());
  }

  const brandColor = theme.primary;
  // Light brand shell: dark-designed pills/badges need readable text treatment.
  const lightShell = theme.bodySurface && isLightSurface(theme.surface);

  // Render mode for the neutral chrome + `.dark`. An explicit host override
  // wins (inspection); otherwise a readable brand surface decides its own mode;
  // otherwise the host context wins, defaulting to dark (the standalone
  // widget's designed look).
  const renderMode: "light" | "dark" =
    modeOverride === "light" || modeOverride === "dark"
      ? modeOverride
      : theme.bodySurface
        ? isLightSurface(theme.surface)
          ? "light"
          : "dark"
        : contextDark === null
          ? "dark"
          : contextDark
            ? "dark"
            : "light";
  useEffect(() => {
    try {
      document.documentElement.classList.toggle("dark", renderMode === "dark");
    } catch {
      // non-DOM environment — no-op
    }
  }, [renderMode]);

  const SendGlyph =
    theme.sendGlyph === "paper-plane"
      ? PaperPlaneTilt
      : theme.sendGlyph === "arrow-right"
        ? ArrowRight
        : theme.sendGlyph === "check"
          ? Check
          : ArrowUp;
  const MicGlyph =
    theme.micGlyph === "mic-slash"
      ? MicrophoneSlash
      : theme.micGlyph === "wave"
        ? Waveform
        : Microphone;

  const headerTitle = theme.headerTitle ?? displayName;

  const loadConfig = useCallback(async () => {
    if (identity.kind === "key") {
      const widgetKey = identity.widgetKey;
      if (!widgetKey) {
        setPhase("error");
        setError("Missing widget key");
        return null;
      }
      try {
        const cfg = await apiClient.embed.getConfig(widgetKey, apiBase);
        const loaded: LoadedChatConfig = {
          name: cfg.name,
          domain: cfg.domain,
          ready: cfg.ready,
          theme: cfg.theme,
          themeVersion: cfg.themeVersion,
          brand: cfg.brand,
        };
        setConfig(loaded);
        setPhase(loaded.ready ? "chat" : "indexing");
        return loaded;
      } catch (err: any) {
        setPhase("error");
        setError(err.message || "Failed to load assistant");
        return null;
      }
    }
    try {
      const detail = await apiClient.companies.get(identity.companyId);
      const loaded: LoadedChatConfig = {
        name: detail.company.name,
        domain: detail.company.domain,
        ready: detail.latestSnapshot?.status === "READY",
        theme: detail.theme ?? null,
        themeVersion: detail.themeVersion ?? null,
        brand: detail.brand
          ? { logoUrl: detail.brand.logoUrl ?? null, tokens: detail.brand.tokens }
          : null,
      };
      setConfig(loaded);
      setPhase(loaded.ready ? "chat" : "indexing");
      return loaded;
    } catch (err: any) {
      setPhase("error");
      setError(err.message || "Failed to load assistant");
      return null;
    }
  }, [identity, apiBase]);

  // Apply the full theme (document root for var consumers + local override).
  // Skips re-apply when neither vars nor themeVersion moved (config polls
  // every 5s while indexing; setProperty churn is pointless there).
  useEffect(() => {
    try {
      const fingerprint = JSON.stringify({
        v: widgetThemeVars(theme),
        tv: liveVersion ?? config?.themeVersion ?? null,
      });
      if (appliedThemeVersion.current === fingerprint) return;
      appliedThemeVersion.current = fingerprint;
      applyWidgetTheme(document.documentElement, theme);
    } catch {
      // non-DOM environment — no-op
    }
  }, [theme, config?.themeVersion, liveVersion]);

  // Live preview channel: the studio page posts full themes here while
  // dragging controls. Every field is re-validated (page URL content is
  // untrusted) and contrast gates are recomputed before applying.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      try {
        const data = e.data as any;
        if (!data) return;
        // Mode-only message from the studio: sync light/dark without a repaint.
        if (data.type === "ag-ui/mode") {
          if (typeof data.dark === "boolean") setContextDark(data.dark);
          if (data.mode === "auto" || data.mode === "light" || data.mode === "dark") {
            setModeOverride(data.mode);
          }
          return;
        }
        if (data.type !== "ag-ui/theme" || !data.theme) return;
        const next = sanitizeIncomingTheme(data.theme);
        if (!next) return;
        setLiveTheme(next);
        setLiveVersion(
          typeof data.themeVersion === "string" ? data.themeVersion : "live"
        );
        if (typeof data.dark === "boolean") setContextDark(data.dark);
        if (data.mode === "auto" || data.mode === "light" || data.mode === "dark") {
          setModeOverride(data.mode);
        }
      } catch {
        // malformed preview message — ignore
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Host page context: the loader answers `ag-ui/context-request` and pushes a
  // fresh path on load and on route changes. Only the parent may send it.
  useEffect(() => {
    const onContext = (e: MessageEvent) => {
      try {
        if (e.source !== window.parent) return;
        const data = e.data as { type?: unknown; path?: unknown } | null;
        if (!data || data.type !== "ag-ui/context") return;
        hostPathRef.current = sanitizeHostPath(data.path);
      } catch {
        // malformed host message — ignore
      }
    };
    window.addEventListener("message", onContext);
    return () => window.removeEventListener("message", onContext);
  }, []);

  // Announce readiness so preview tooling (the studio) can (re)send the theme +
  // mode without racing this listener's mount. A no-op in production: no parent
  // tooling listens, and only same-origin parents receive it.
  useEffect(() => {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "ag-ui/ready" },
          window.location.origin
        );
        // Cross-origin parent: the request carries no data, so the wildcard
        // target reveals nothing. The reply is validated above.
        window.parent.postMessage({ type: "ag-ui/context-request" }, "*");
      }
    } catch {
      // non-frame context — nothing to signal
    }
  }, []);

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
      if (!sessionKey || !text.trim() || isStreaming || phase !== "chat") return;
      // The visitor pressed send: that is one question. The parent owns the
      // turn count and the host path, so this is a notification, not an event.
      postAgentEvent("chat_message");
      if (identity.kind === "key") {
        await sendMessage(text, sessionKey, {
          apiBase,
          channel: "embed",
          path: hostPathRef.current ?? undefined,
          sessionHash: sessionHashParam,
          visitorHash: visitorHashParam,
        });
      } else {
        await sendMessage(text, sessionKey, { apiBase, channel: "chat" });
      }
    },
    [sessionKey, identity.kind, isStreaming, phase, sendMessage, apiBase, sessionHashParam, visitorHashParam]
  );

  // Optimistic thumbs state, keyed by the client render id. The persisted
  // rating keys on the server message id (`messageId`), resolved on submit.
  const [ratings, setRatings] = useState<Record<string, 1 | -1>>({});

  /**
   * Persist a thumbs rating for one assistant message. The endpoint is
   * key-scoped public: no credentials, the widget key in the path is the
   * whole authority. Failures stay quiet in the UI (the network request is
   * still logged by the browser console) and the optimistic state holds —
   * a lost thumb is not worth an error banner in the visitor's chat.
   */
  const identityWidgetKey = identity.kind === "key" ? identity.widgetKey : null;

  const handleRate = useCallback(
    (msg: ChatMessage, rating: 1 | -1) => {
      const widgetKey = identityWidgetKey;
      const conversationId = activeConversationId;
      const messageId = msg.messageId;
      if (!widgetKey || !conversationId || !messageId) return;
      setRatings((prev) => ({ ...prev, [msg.id]: rating }));
      void apiClient.embed
        .rateMessage(
          widgetKey,
          { conversation_id: conversationId, message_id: messageId, rating },
          apiBase
        )
        .catch(() => {
          // Quiet: the studio transcript simply won't show the rating.
        });
    },
    [identityWidgetKey, activeConversationId, apiBase]
  );

  const handleOpenEvidence = useCallback(
    (item?: { url?: string }) => {
      // Answer-only surfaces never surface evidence: no drawer, no external
      // jump. The evidence callbacks still fire upstream (unused for UI).
      if (noCitations) return;
      if (item?.url) window.open(item.url, "_blank", "noopener,noreferrer");
      else openDrawerWithEvidence();
    },
    [openDrawerWithEvidence, noCitations]
  );

  return (
    <div
      className="flex flex-col h-[100dvh] w-full bg-background text-foreground antialiased"
      style={
        {
          ...widgetThemeVars(theme),
          "--brand-primary": brandColor,
          ...(theme.bodySurface ? { backgroundColor: theme.surface, color: theme.text } : null),
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-3"
        style={{
          ...(theme.bodySurface
            ? { backgroundColor: theme.surface, borderColor: theme.secondary, color: theme.text }
            : null),
          ...(theme.headerBg ? { backgroundColor: theme.headerBg } : null),
          ...(theme.headerBorder ? { borderColor: theme.headerBorder } : null),
          ...(theme.headerText ? { color: theme.headerText } : null),
        }}
      >
        {theme.showLogo &&
          (theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logoUrl}
              alt={`${displayName} logo`}
              className="w-7 h-7 rounded-lg object-contain shrink-0 border border-border bg-white"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className="flex items-center justify-center w-7 h-7 rounded-lg font-bold text-[11px] shrink-0 border"
              style={{
                backgroundColor: `${brandColor}20`,
                color: theme.headerText ?? brandColor,
                borderColor: theme.headerBorder ?? theme.secondary,
                borderRadius: "var(--brand-radius)",
              }}
            >
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          ))}
        <div className="min-w-0 flex-1">
          <div
            className="text-xs font-semibold text-foreground truncate"
            style={{ color: theme.headerText ?? (theme.bodySurface ? theme.text : undefined) }}
          >
            {headerTitle}
          </div>
          <div
            className="text-[10px] font-mono text-muted-foreground truncate"
            style={{
              color: theme.headerText ?? (theme.bodySurface ? theme.text : undefined),
              opacity: theme.headerText ? 0.75 : theme.bodySurface ? 0.65 : undefined,
            }}
          >
            {theme.headerDomain ?? config?.domain ?? "Company assistant"}
          </div>
        </div>
        {theme.showReady && phase === "chat" && (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400"
            style={lightShell ? { color: theme.text } : undefined}
          >
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
          <div
            className="flex items-center gap-2 text-xs text-muted-foreground font-mono animate-pulse"
            style={lightShell ? { color: theme.text } : undefined}
          >
            <CircleNotch className="size-4 animate-spin" />
            <span>Loading assistant…</span>
          </div>
        </div>
      )}

      {phase === "error" && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div
            className="flex items-start gap-2 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-600 dark:text-red-400 max-w-sm"
            style={lightShell ? { color: theme.text } : undefined}
          >
            <WarningCircle
              className="size-4 shrink-0 mt-0.5"
              style={lightShell ? { color: "#dc2626" } : undefined}
            />
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
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400 animate-pulse font-mono"
              style={lightShell ? { color: theme.text } : undefined}
            >
              <CircleNotch className="size-3.5 animate-spin" />
              <span>Indexing {config?.domain || "company"}…</span>
            </div>
            <p
              className="text-[11px] text-muted-foreground"
              style={lightShell ? { color: theme.text, opacity: 0.75 } : undefined}
            >
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
                <p
                  className="text-xs text-muted-foreground"
                  style={theme.bodySurface ? { color: theme.text, opacity: 0.75 } : undefined}
                >
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
                    className="block w-full text-left text-xs rounded-lg border border-border bg-muted/40 hover:bg-muted px-3 py-2 text-foreground/80 transition-colors hover:border-[var(--brand-secondary)]"
                    style={{
                      borderRadius: theme.panelRadius,
                      ...(theme.chipBorder ? { borderColor: theme.chipBorder } : null),
                      ...(theme.chipBg ? { backgroundColor: theme.chipBg } : null),
                      ...(theme.linkColor ? { color: theme.linkColor } : null),
                    }}
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
                theme={{
                  userBg: theme.userBg,
                  userText: theme.userText,
                  userRadius: theme.userRadius,
                  aiBg: theme.aiBg,
                  aiText: theme.aiText,
                  aiBorder: theme.aiBorder,
                  aiRadius: theme.aiRadius,
                  avatarMode: theme.avatarMode,
                  avatarBg: theme.avatarBg,
                  avatarText: theme.avatarText,
                  customAvatarUrl: theme.customAvatarUrl,
                  logoUrl: theme.logoUrl,
                  linkColor: theme.linkColor,
                }}
                onInspectEvidence={handleOpenEvidence}
                hideEvidence={noCitations}
                rating={ratings[msg.id] ?? null}
                onRate={
                  identity.kind === "key"
                    ? (r) => handleRate(msg, r)
                    : undefined
                }
              />
            ))}
            <div ref={messagesEndRef} />
          </main>

          <div
            className="shrink-0 p-2 border-t border-border bg-card/90"
            style={{
              ...(theme.bodySurface
                ? { backgroundColor: theme.surface, borderColor: theme.secondary }
                : null),
              ...(theme.inputBg ? { backgroundColor: theme.inputBg } : null),
              ...(theme.inputBorder ? { borderColor: theme.inputBorder } : null),
            }}
          >
            <VoiceSession
              key={sessionKey}
              widgetKey={identity.kind === "key" ? identity.widgetKey : undefined}
              companyId={identity.kind === "company" ? identity.companyId : undefined}
              apiBase={apiBase}
              path={hostPathRef.current ?? undefined}
              visitIdentity={
                identity.kind === "key"
                  ? { sessionHash: sessionHashParam, visitorHash: visitorHashParam }
                  : undefined
              }
              onFinalLines={appendVoiceTranscript}
              onCallStart={() => postAgentEvent("voice_start")}
              onCallEnd={({ durationSec, turns }) =>
                // Abandonment is derived at the collector from turns; the
                // iframe sends counts only.
                postAgentEvent("voice_end", { durationSec, turns })
              }
            >
              {() => (
              <PromptInput
              value={input}
              onValueChange={setInput}
              onSubmit={handleSubmit}
              isSubmitting={isStreaming}
              className="w-full border-border bg-card focus-within:border-[var(--brand-primary)]"
              style={{
                ...(theme.inputBg ? { backgroundColor: theme.inputBg } : null),
                ...(theme.inputBorder ? { borderColor: theme.inputBorder } : null),
                borderRadius: theme.inputRadius,
                ...(theme.focusRing ? ({ "--tw-ring-color": theme.focusRing } as React.CSSProperties) : null),
              }}
            >
              <PromptInputBody>
                <PromptInputTextarea
                  placeholder={theme.placeholderText ?? `Ask about ${config?.name || "this company"}…`}
                  className="text-[13px] text-foreground placeholder:text-muted-foreground py-1"
                  style={theme.inputText ? { color: theme.inputText } : undefined}
                  minHeight={40}
                />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputBadge
                    icon={Buildings}
                    label={config?.domain || "assistant"}
                    className="bg-muted/60 border-border text-muted-foreground"
                  />
                  <VoiceErrorChip />
                </PromptInputTools>
                <div className="flex items-center gap-1.5">
                  <VoiceAmplitudeBars />
                  <VoiceChatButton
                    disabled={phase !== "chat"}
                    title={phase !== "chat" ? "Available when Ready" : undefined}
                    style={{
                      ...(theme.micBg ? { backgroundColor: theme.micBg } : null),
                      ...(theme.micText ? { color: theme.micText } : null),
                    }}
                    idleIcon={<MicGlyph className="h-4 w-4" weight="bold" />}
                  />
                <PromptInputSubmit
                  className="bg-foreground hover:bg-foreground/90 text-background cursor-pointer"
                  style={{
                    ...(theme.sendBg ? { backgroundColor: theme.sendBg } : null),
                    ...(theme.sendText ? { color: theme.sendText } : null),
                  }}
                  aria-label="Submit prompt"
                >
                  <SendGlyph className="h-4 w-4" weight="bold" />
                </PromptInputSubmit>
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
