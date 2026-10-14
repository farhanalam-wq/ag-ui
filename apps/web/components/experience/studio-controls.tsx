"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AVATAR_MODES,
  LAUNCHER_GLYPHS,
  LAUNCHER_MODES,
  MIC_GLYPHS,
  SEND_GLYPHS,
  type AvatarMode,
  type LauncherMode,
  type WidgetTheme,
  type WidgetThemeOverride,
} from "@ag-ui/shared/client";

interface StudioControlsProps {
  draft: WidgetTheme;
  override: WidgetThemeOverride;
  contrast: number | null;
  canPublish: boolean;
  panelW: number;
  panelH: number;
  savedAt: string | null;
  isDirty: boolean;
  onPatch: (patch: WidgetThemeOverride) => void;
  onReset: () => void;
  onResetGroup: (fields: (keyof WidgetThemeOverride)[]) => void;
  onDims: (w: number, h: number) => void;
  onAvatarFile: (file: File) => void;
  onCopy: () => void;
  onPaste: (text: string) => void;
  onSave: () => void;
}

const RADIUS_PRESETS = ["0px", "4px", "8px", "12px", "9999px"];

function Section({
  title,
  hint,
  fields,
  onResetGroup,
  children,
}: {
  title: string;
  hint?: string;
  fields: (keyof WidgetThemeOverride)[];
  onResetGroup: (fields: (keyof WidgetThemeOverride)[]) => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-[14px] font-semibold">{title}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs font-normal text-muted-foreground"
            onClick={() => onResetGroup(fields)}
          >
            Reset
          </Button>
        </div>
        {hint && (
          <CardDescription className="text-[12px]">{hint}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">{children}</CardContent>
    </Card>
  );
}

function ColorField({
  label,
  value,
  fallback,
  onPick,
  onClear,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onPick: (hex: string) => void;
  onClear?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value ?? fallback;
  const customized = value != null;
  return (
    <label className="flex items-center gap-2 text-[13px]">
      <input
        type="color"
        value={/^#(?:[0-9a-f]{6})$/i.test(shown) ? shown : fallback}
        onChange={(e) => {
          setText(null);
          onPick(e.target.value);
        }}
        className="size-8 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
        aria-label={label}
      />
      <span className="min-w-0 flex-1 text-muted-foreground">
        {label}
        {customized && <span className="ml-1 text-[10px]">•</span>}
      </span>
      <input
        type="text"
        value={shown}
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text == null) return;
          const v = text.trim().toLowerCase();
          if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/.test(v)) onPick(v);
          setText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setText(null);
        }}
        className="w-20 shrink-0 rounded-md border border-border bg-muted/40 px-1.5 py-1 font-mono text-[11px] text-muted-foreground"
        aria-label={`${label} hex value`}
      />
      {onClear && customized && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[11px] text-muted-foreground underline underline-offset-2"
        >
          clear
        </button>
      )}
    </label>
  );
}

function RadiusField({
  label,
  value,
  onPick,
}: {
  label: string;
  value: string;
  onPick: (radius: string) => void;
}) {
  const [custom, setCustom] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {RADIUS_PRESETS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onPick(r)}
            aria-pressed={value === r}
            className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              value === r
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {r}
          </button>
        ))}
        <input
          type="text"
          placeholder="custom"
          value={custom ?? (RADIUS_PRESETS.includes(value) ? "" : value)}
          spellCheck={false}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => {
            if (custom == null || custom.trim() === "") {
              setCustom(null);
              return;
            }
            onPick(custom.trim());
            setCustom(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setCustom(null);
          }}
          className="w-20 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-[11px] text-muted-foreground"
          aria-label={`${label} custom radius`}
        />
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  placeholder,
  onCommit,
  onClear,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onCommit: (v: string | null) => void;
  onClear?: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  return (
    <label className="block space-y-1 text-[12px] text-muted-foreground">
      <span className="flex items-center justify-between">
        <span>{label}</span>
        {onClear && value != null && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] underline underline-offset-2"
          >
            clear
          </button>
        )}
      </span>
      <input
        type="text"
        value={text ?? value ?? ""}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text == null) return;
          onCommit(text.trim() === "" ? null : text);
          setText(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setText(null);
        }}
        className="w-full rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[13px] text-foreground"
      />
    </label>
  );
}

function Toggle({
  label,
  checked,
  onFlip,
}: {
  label: string;
  checked: boolean;
  onFlip: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onFlip(!checked)}
      className="flex w-full items-center justify-between gap-2 text-[13px]"
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-foreground" : "bg-muted"
        }`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-background transition-[left] ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * Full M2 control surface. Every group writes override fields, streams
 * live over the preview channel, and resets its own fields only.
 */
export function StudioControls({
  draft,
  override,
  contrast,
  canPublish,
  panelW,
  panelH,
  savedAt,
  isDirty,
  onPatch,
  onReset,
  onResetGroup,
  onDims,
  onAvatarFile,
  onCopy,
  onPaste,
  onSave,
}: StudioControlsProps) {
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const dirtyCount = Object.keys(override).length;

  return (
    <div className="min-w-0 space-y-4">
      <Card className="min-w-0">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="text-[15px] font-semibold">Theme</CardTitle>
              <CardDescription className="text-[13px]">
                Edits apply to the preview instantly.
                {isDirty
                  ? ` ${dirtyCount} override field${dirtyCount === 1 ? "" : "s"}.`
                  : " Matches brand extraction."}
                {savedAt ? ` Draft saved ${savedAt}.` : ""}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={onReset}>
              Reset to brand
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-1.5 pt-0">
          <Button variant="outline" size="sm" onClick={onCopy}>
            Copy override
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPasteOpen((v) => !v)}
          >
            {pasteOpen ? "Close paste" : "Paste override"}
          </Button>
          <Button variant="default" size="sm" onClick={onSave}>
            Save draft
          </Button>
        </CardContent>
        {pasteOpen && (
          <CardContent className="space-y-2 pt-0">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder='{"primary":"#9b6a45"}'
              spellCheck={false}
              rows={3}
              className="w-full rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px]"
            />
            <Button
              size="sm"
              onClick={() => {
                onPaste(pasteText);
                setPasteText("");
                setPasteOpen(false);
              }}
            >
              Apply pasted override
            </Button>
          </CardContent>
        )}
      </Card>

      <Section
        title="Panel"
        hint="Preview frame size (uncapped) plus panel corners."
        fields={["panelRadius"]}
        onResetGroup={onResetGroup}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1 text-[12px] text-muted-foreground">
            <span>Width px</span>
            <input
              type="number"
              value={panelW}
              min={200}
              step={10}
              onChange={(e) => onDims(Number(e.target.value) || panelW, panelH)}
              className="w-full rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[12px] text-foreground"
            />
          </label>
          <label className="block space-y-1 text-[12px] text-muted-foreground">
            <span>Height px</span>
            <input
              type="number"
              value={panelH}
              min={200}
              step={10}
              onChange={(e) => onDims(panelW, Number(e.target.value) || panelH)}
              className="w-full rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[12px] text-foreground"
            />
          </label>
        </div>
        <RadiusField
          label="Panel corners"
          value={draft.panelRadius}
          onPick={(radius) => onPatch({ panelRadius: radius })}
        />
      </Section>

      <Section
        title="Accents"
        fields={["primary", "secondary"]}
        onResetGroup={onResetGroup}
      >
        <ColorField
          label="Primary"
          value={override.primary ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ primary: hex })}
        />
        <ColorField
          label="Secondary (hover)"
          value={override.secondary ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ secondary: hex })}
        />
      </Section>

      <Section
        title="Shell"
        fields={["surface", "text"]}
        onResetGroup={onResetGroup}
      >
        <ColorField
          label="Surface"
          value={override.surface ?? null}
          fallback={draft.surface}
          onPick={(hex) => onPatch({ surface: hex })}
        />
        <ColorField
          label="Text on surface"
          value={override.text ?? null}
          fallback={draft.text}
          onPick={(hex) => onPatch({ text: hex })}
        />
        <p className="font-mono text-[11px] text-muted-foreground">
          Contrast {contrast == null ? "-" : contrast.toFixed(2)}
          {!canPublish && " — below 4.5, publish stays disabled"}
        </p>
      </Section>

      <Section
        title="Corners"
        hint="Global radius follows Accents-era behavior; per-element values win."
        fields={["radius", "userRadius", "aiRadius", "inputRadius", "launcherRadius"]}
        onResetGroup={onResetGroup}
      >
        <RadiusField
          label="Global"
          value={draft.radius}
          onPick={(radius) => onPatch({ radius })}
        />
        <RadiusField
          label="User bubble"
          value={draft.userRadius}
          onPick={(radius) => onPatch({ userRadius: radius })}
        />
        <RadiusField
          label="AI bubble"
          value={draft.aiRadius}
          onPick={(radius) => onPatch({ aiRadius: radius })}
        />
        <RadiusField
          label="Input bar"
          value={draft.inputRadius}
          onPick={(radius) => onPatch({ inputRadius: radius })}
        />
        <RadiusField
          label="Launcher"
          value={draft.launcherRadius}
          onPick={(radius) => onPatch({ launcherRadius: radius })}
        />
      </Section>

      <Section
        title="Launcher"
        hint="Auto shows the logo when available, else the brand glyph."
        fields={["launcherMode", "launcherGlyph", "launcherBg", "launcherHover", "launcherBorder"]}
        onResetGroup={onResetGroup}
      >
        <label className="block space-y-1 text-[12px] text-muted-foreground">
          <span>Mode</span>
          <select
            value={draft.launcherMode}
            onChange={(e) => onPatch({ launcherMode: e.target.value as LauncherMode })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
          >
            {LAUNCHER_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted-foreground">Glyph</p>
          <div className="flex flex-wrap gap-1.5">
            {LAUNCHER_GLYPHS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => onPatch({ launcherGlyph: g })}
                aria-pressed={draft.launcherGlyph === g}
                className={`rounded-md border px-2.5 py-1 text-[14px] transition-colors ${
                  draft.launcherGlyph === g
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <ColorField
          label="Background"
          value={override.launcherBg ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ launcherBg: hex })}
          onClear={() => onPatch({ launcherBg: null })}
        />
        <ColorField
          label="Hover"
          value={override.launcherHover ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ launcherHover: hex })}
          onClear={() => onPatch({ launcherHover: null })}
        />
        <ColorField
          label="Border"
          value={override.launcherBorder ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ launcherBorder: hex })}
          onClear={() => onPatch({ launcherBorder: null })}
        />
      </Section>

      <Section
        title="Header"
        fields={["showLogo", "headerTitle", "headerDomain", "headerBg", "headerText", "headerBorder", "showReady"]}
        onResetGroup={onResetGroup}
      >
        <Toggle
          label="Show logo"
          checked={draft.showLogo}
          onFlip={(v) => onPatch({ showLogo: v })}
        />
        <Toggle
          label="Show Ready badge"
          checked={draft.showReady}
          onFlip={(v) => onPatch({ showReady: v })}
        />
        <TextField
          label="Title"
          value={override.headerTitle ?? null}
          placeholder="Company name"
          onCommit={(v) => onPatch({ headerTitle: v })}
          onClear={() => onPatch({ headerTitle: null })}
        />
        <TextField
          label="Domain line"
          value={override.headerDomain ?? null}
          placeholder="example.com"
          onCommit={(v) => onPatch({ headerDomain: v })}
          onClear={() => onPatch({ headerDomain: null })}
        />
        <ColorField
          label="Background"
          value={override.headerBg ?? null}
          fallback={draft.surface}
          onPick={(hex) => onPatch({ headerBg: hex })}
          onClear={() => onPatch({ headerBg: null })}
        />
        <ColorField
          label="Text"
          value={override.headerText ?? null}
          fallback={draft.text}
          onPick={(hex) => onPatch({ headerText: hex })}
          onClear={() => onPatch({ headerText: null })}
        />
        <ColorField
          label="Border"
          value={override.headerBorder ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ headerBorder: hex })}
          onClear={() => onPatch({ headerBorder: null })}
        />
      </Section>

      <Section
        title="User bubble"
        fields={["userBg", "userText"]}
        onResetGroup={onResetGroup}
      >
        <ColorField
          label="Background"
          value={override.userBg ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ userBg: hex })}
          onClear={() => onPatch({ userBg: null })}
        />
        <ColorField
          label="Text"
          value={override.userText ?? null}
          fallback="#ffffff"
          onPick={(hex) => onPatch({ userText: hex })}
          onClear={() => onPatch({ userText: null })}
        />
      </Section>

      <Section
        title="AI bubble + avatar"
        hint="Avatar default is company logo, initials when missing. Custom uploads preview instantly; durable hosting lands with publish."
        fields={["aiBg", "aiText", "aiBorder", "avatarMode", "avatarBg", "avatarText", "customAvatarUrl"]}
        onResetGroup={onResetGroup}
      >
        <ColorField
          label="Background"
          value={override.aiBg ?? null}
          fallback={draft.surface}
          onPick={(hex) => onPatch({ aiBg: hex })}
          onClear={() => onPatch({ aiBg: null })}
        />
        <ColorField
          label="Text"
          value={override.aiText ?? null}
          fallback={draft.text}
          onPick={(hex) => onPatch({ aiText: hex })}
          onClear={() => onPatch({ aiText: null })}
        />
        <ColorField
          label="Border"
          value={override.aiBorder ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ aiBorder: hex })}
          onClear={() => onPatch({ aiBorder: null })}
        />
        <label className="block space-y-1 text-[12px] text-muted-foreground">
          <span>Avatar mode</span>
          <select
            value={draft.avatarMode}
            onChange={(e) => onPatch({ avatarMode: e.target.value as AvatarMode })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
          >
            {AVATAR_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <ColorField
          label="Avatar tile bg"
          value={override.avatarBg ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ avatarBg: hex })}
          onClear={() => onPatch({ avatarBg: null })}
        />
        <ColorField
          label="Avatar tile text"
          value={override.avatarText ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ avatarText: hex })}
          onClear={() => onPatch({ avatarText: null })}
        />
        <TextField
          label="Custom avatar URL (https or data:image)"
          value={override.customAvatarUrl ?? null}
          placeholder="https://…"
          onCommit={(v) => onPatch({ customAvatarUrl: v, avatarMode: "custom" })}
          onClear={() => onPatch({ customAvatarUrl: null })}
        />
        <label className="block space-y-1 text-[12px] text-muted-foreground">
          <span>Upload artwork (svg/photo, with or without bg)</span>
          <input
            type="file"
            accept="image/*,.svg"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAvatarFile(f);
              e.target.value = "";
            }}
            className="w-full rounded-md border border-border bg-muted/40 px-2 py-1.5 text-[12px] text-foreground"
          />
        </label>
      </Section>

      <Section
        title="Input"
        fields={["inputBg", "inputBorder", "inputText", "placeholderText", "focusRing"]}
        onResetGroup={onResetGroup}
      >
        <ColorField
          label="Background"
          value={override.inputBg ?? null}
          fallback={draft.surface}
          onPick={(hex) => onPatch({ inputBg: hex })}
          onClear={() => onPatch({ inputBg: null })}
        />
        <ColorField
          label="Border"
          value={override.inputBorder ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ inputBorder: hex })}
          onClear={() => onPatch({ inputBorder: null })}
        />
        <ColorField
          label="Text"
          value={override.inputText ?? null}
          fallback={draft.text}
          onPick={(hex) => onPatch({ inputText: hex })}
          onClear={() => onPatch({ inputText: null })}
        />
        <ColorField
          label="Focus ring"
          value={override.focusRing ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ focusRing: hex })}
          onClear={() => onPatch({ focusRing: null })}
        />
        <TextField
          label="Placeholder"
          value={override.placeholderText ?? null}
          placeholder="Ask about…"
          onCommit={(v) => onPatch({ placeholderText: v })}
          onClear={() => onPatch({ placeholderText: null })}
        />
      </Section>

      <Section
        title="Icons"
        fields={["sendGlyph", "sendBg", "sendText", "micGlyph", "micBg", "micText"]}
        onResetGroup={onResetGroup}
      >
        <label className="block space-y-1 text-[12px] text-muted-foreground">
          <span>Send glyph</span>
          <select
            value={draft.sendGlyph}
            onChange={(e) => onPatch({ sendGlyph: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
          >
            {SEND_GLYPHS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <ColorField
          label="Send bg"
          value={override.sendBg ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ sendBg: hex })}
          onClear={() => onPatch({ sendBg: null })}
        />
        <ColorField
          label="Send icon"
          value={override.sendText ?? null}
          fallback="#ffffff"
          onPick={(hex) => onPatch({ sendText: hex })}
          onClear={() => onPatch({ sendText: null })}
        />
        <label className="block space-y-1 text-[12px] text-muted-foreground">
          <span>Mic glyph</span>
          <select
            value={draft.micGlyph}
            onChange={(e) => onPatch({ micGlyph: e.target.value })}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[13px] text-foreground"
          >
            {MIC_GLYPHS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <ColorField
          label="Mic bg"
          value={override.micBg ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ micBg: hex })}
          onClear={() => onPatch({ micBg: null })}
        />
        <ColorField
          label="Mic icon"
          value={override.micText ?? null}
          fallback={draft.text}
          onPick={(hex) => onPatch({ micText: hex })}
          onClear={() => onPatch({ micText: null })}
        />
      </Section>

      <Section
        title="Links + chips"
        fields={["linkColor", "chipBorder", "chipBg"]}
        onResetGroup={onResetGroup}
      >
        <ColorField
          label="Answer links"
          value={override.linkColor ?? null}
          fallback={draft.primary}
          onPick={(hex) => onPatch({ linkColor: hex })}
          onClear={() => onPatch({ linkColor: null })}
        />
        <ColorField
          label="Chip border"
          value={override.chipBorder ?? null}
          fallback={draft.secondary}
          onPick={(hex) => onPatch({ chipBorder: hex })}
          onClear={() => onPatch({ chipBorder: null })}
        />
        <ColorField
          label="Chip background"
          value={override.chipBg ?? null}
          fallback={draft.surface}
          onPick={(hex) => onPatch({ chipBg: hex })}
          onClear={() => onPatch({ chipBg: null })}
        />
      </Section>
    </div>
  );
}
