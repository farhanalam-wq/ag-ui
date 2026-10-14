"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WidgetTheme } from "@ag-ui/shared/client";

interface StudioControlsProps {
  draft: WidgetTheme;
  contrast: number | null;
  canPublish: boolean;
  onPatch: (patch: Partial<WidgetTheme>) => void;
  onReset: () => void;
}

function ColorRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (hex: string) => void;
}) {
  return (
    <label className="flex items-center gap-3 text-[13px]">
      <input
        type="color"
        value={value}
        onChange={(e) => onPick(e.target.value)}
        className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        aria-label={label}
      />
      <span className="min-w-0 flex-1 text-muted-foreground">{label}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {value}
      </span>
    </label>
  );
}

/**
 * First-pass controls for the live preview. Color + radius only — the full
 * control groups (bubbles, header, input, orb icons, shape scale) build on
 * these same patch/reset props next.
 */
export function StudioControls({
  draft,
  contrast,
  canPublish,
  onPatch,
  onReset,
}: StudioControlsProps) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-[15px] font-semibold">Theme</CardTitle>
            <CardDescription className="text-[13px]">
              Edits apply to the preview instantly, nothing saves yet.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onReset}>
            Reset to brand
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground">Accents</p>
          <ColorRow
            label="Primary"
            value={draft.primary}
            onPick={(hex) => onPatch({ primary: hex })}
          />
          <ColorRow
            label="Secondary (hover)"
            value={draft.secondary}
            onPick={(hex) => onPatch({ secondary: hex })}
          />
        </div>
        <div className="space-y-2.5">
          <p className="text-xs text-muted-foreground">Shell</p>
          <ColorRow
            label="Surface"
            value={draft.surface}
            onPick={(hex) => onPatch({ surface: hex })}
          />
          <ColorRow
            label="Text on surface"
            value={draft.text}
            onPick={(hex) => onPatch({ text: hex })}
          />
          <p className="font-mono text-[11px] text-muted-foreground">
            Contrast {contrast == null ? "-" : contrast.toFixed(2)}
            {!canPublish && " — below 4.5, publish stays disabled"}
          </p>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Corners</p>
          <div className="flex flex-wrap gap-1.5">
            {["0px", "4px", "8px", "12px", "9999px"].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => onPatch({ radius: r })}
                aria-pressed={draft.radius === r}
                className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                  draft.radius === r
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
