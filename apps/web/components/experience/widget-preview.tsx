"use client";

import { PaperPlaneTilt } from "@phosphor-icons/react";
import {
  widgetThemeVars,
  type WidgetTheme,
} from "@ag-ui/shared/client";

interface WidgetPreviewProps {
  theme: WidgetTheme;
  displayName?: string;
  domain?: string;
}

/**
 * Static demo thread styled only by WidgetTheme vars. No network, no keys,
 * no chat send. The embed route renders its live chat from the same vars,
 * so design changes land here once and stay in sync.
 */
export function WidgetPreview({
  theme,
  displayName = "Assistant",
  domain = "Company assistant",
}: WidgetPreviewProps) {
  const initials = displayName.slice(0, 2).toUpperCase();
  const shellStyle = theme.fullSurface
    ? {
        backgroundColor: theme.surface,
        borderColor: theme.secondary,
        color: theme.text,
      }
    : undefined;
  const assistantStyle = theme.fullSurface
    ? {
        backgroundColor: theme.surface,
        color: theme.text,
        borderColor: theme.secondary,
        borderRadius: "var(--brand-radius)",
      }
    : { borderRadius: "var(--brand-radius)" };

  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={`Widget preview for ${displayName}`}
        className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-background"
        style={widgetThemeVars(theme)}
      >
        {/* Header, mirrors the embed header */}
        <div
          className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-muted/40 px-3"
          style={shellStyle}
        >
          {theme.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={theme.logoUrl}
              alt=""
              aria-hidden="true"
              className="h-7 w-7 shrink-0 rounded-lg border border-border bg-white object-contain"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold"
              style={{
                backgroundColor: `${theme.primary}20`,
                color: theme.primary,
                borderColor: theme.secondary,
                borderRadius: "var(--brand-radius)",
              }}
            >
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">{displayName}</div>
            <div className="truncate font-mono text-[10px] opacity-60">
              {domain}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-emerald-500"
            />
            Ready
          </span>
        </div>

        {/* Sample thread */}
        <div className="min-w-0 space-y-3 p-3">
          <div
            className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-muted/60 px-3 py-2 text-[13px] leading-relaxed"
            style={assistantStyle}
          >
            Hi, ask me anything about {displayName} pricing, products, and
            docs.
          </div>
          <div className="flex justify-end">
            <div
              className="max-w-[85%] px-3 py-2 text-[13px] leading-relaxed text-white"
              style={{
                backgroundColor: theme.primary,
                borderRadius: "var(--brand-radius)",
              }}
            >
              What are the pricing tiers?
            </div>
          </div>
          <div
            className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-muted/60 px-3 py-2 text-[13px] leading-relaxed"
            style={assistantStyle}
          >
            Three tiers with usage limits on each. Full breakdown with links
            in the live widget.
          </div>
          <div className="space-y-1.5 pt-1">
            {[
              `Compare plans for ${displayName}`,
              "Where are the API docs?",
            ].map((q) => (
              <div
                key={q}
                className="block w-full truncate border border-border bg-transparent px-3 py-2 text-left text-xs text-muted-foreground"
                style={{ borderRadius: "var(--brand-radius)" }}
              >
                {q}
              </div>
            ))}
          </div>
        </div>

        {/* Prompt bar, static */}
        <div className="shrink-0 border-t border-border p-2">
          <div
            className="flex items-center gap-2 border border-border bg-muted/40 px-3 py-2"
            style={{ borderRadius: "var(--brand-radius)" }}
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
              Ask about {displayName}...
            </span>
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center text-white"
              style={{
                backgroundColor: theme.primary,
                borderRadius: "var(--brand-radius)",
              }}
            >
              <PaperPlaneTilt className="size-3.5" />
            </span>
          </div>
        </div>
      </div>
      {!theme.fullSurface && (
        <p className="mt-2 text-xs text-muted-foreground">
          Neutral shell. Brand colors apply to the header mark, user messages,
          and actions only.
        </p>
      )}
    </div>
  );
}
