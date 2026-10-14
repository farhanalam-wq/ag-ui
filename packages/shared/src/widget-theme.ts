// Widget theme contract: maps a company's brand tokens to the embed's CSS
// variables. Everything is sanitized — tokens originate from scraped
// third-party CSS and must never reach the DOM raw.
//
// Fonts are deliberately excluded (licensing + availability): the embed
// keeps its system stack permanently.

export type AvatarMode = "auto" | "logo" | "initials" | "custom" | "none";
export type LauncherMode = "auto" | "glyph" | "brand" | "logo";

export const AVATAR_MODES: AvatarMode[] = ["auto", "logo", "initials", "custom", "none"];
export const LAUNCHER_MODES: LauncherMode[] = ["auto", "glyph", "brand", "logo"];
export const LAUNCHER_GLYPHS = ["✦", "◆", "●", "▲", "✎", "➤"];
export const SEND_GLYPHS = ["arrow-up", "paper-plane", "arrow-right", "check"] as const;
export const MIC_GLYPHS = ["mic", "mic-slash", "wave"] as const;

export interface WidgetTheme {
  primary: string;
  secondary: string;
  radius: string;
  surface: string;
  text: string;
  logoUrl: string | null;
  /** Legacy: bodySurface && accentOnSurface. Kept for compat. */
  fullSurface: boolean;
  /**
   * True when text-on-surface >= 4.5. The shell (chat background, header,
   * body copy) may be painted with surface/text.
   */
  bodySurface: boolean;
  /**
   * True when primary-on-surface >= 3. Brand accents (user bubbles, send
   * CTA, links, focus rings) may sit directly on the surface. When false
   * but bodySurface is true, accents stay confined to the header/launcher
   * and on-surface controls fall back to neutral styling.
   */
  accentOnSurface: boolean;
  /** Where surface/text came from: observed pairs, raw tokens, or defaults. */
  surfaceSource: "wcag-best" | "tokens" | "default" | "embed-query";
  // --- M2 per-slot fields (all resolved with defaults; null = follow base) ---
  panelRadius: string;
  userRadius: string;
  aiRadius: string;
  inputRadius: string;
  launcherRadius: string;
  headerBg: string | null;
  headerText: string | null;
  headerBorder: string | null;
  showLogo: boolean;
  headerTitle: string | null;
  headerDomain: string | null;
  showReady: boolean;
  userBg: string | null;
  userText: string | null;
  aiBg: string | null;
  aiText: string | null;
  aiBorder: string | null;
  avatarMode: AvatarMode;
  avatarBg: string | null;
  avatarText: string | null;
  customAvatarUrl: string | null;
  inputBg: string | null;
  inputBorder: string | null;
  inputText: string | null;
  placeholderText: string | null;
  focusRing: string | null;
  launcherMode: LauncherMode;
  launcherGlyph: string;
  launcherBg: string | null;
  launcherHover: string | null;
  launcherBorder: string | null;
  sendGlyph: string;
  sendBg: string | null;
  sendText: string | null;
  micGlyph: string;
  micBg: string | null;
  micText: string | null;
  linkColor: string | null;
  chipBorder: string | null;
  chipBg: string | null;
}

const DEFAULTS: WidgetTheme = {
  primary: "#2563eb",
  secondary: "#3b82f6",
  radius: "0.5rem",
  surface: "#09090b",
  text: "#fafafa",
  logoUrl: null,
  fullSurface: false,
  bodySurface: false,
  accentOnSurface: false,
  surfaceSource: "default",
  panelRadius: "0.5rem",
  userRadius: "0.5rem",
  aiRadius: "0.5rem",
  inputRadius: "0.5rem",
  launcherRadius: "9999px",
  headerBg: null,
  headerText: null,
  headerBorder: null,
  showLogo: true,
  headerTitle: null,
  headerDomain: null,
  showReady: true,
  userBg: null,
  userText: null,
  aiBg: null,
  aiText: null,
  aiBorder: null,
  avatarMode: "auto",
  avatarBg: null,
  avatarText: null,
  customAvatarUrl: null,
  inputBg: null,
  inputBorder: null,
  inputText: null,
  placeholderText: null,
  focusRing: null,
  launcherMode: "auto",
  launcherGlyph: "✦",
  launcherBg: null,
  launcherHover: null,
  launcherBorder: null,
  sendGlyph: "arrow-up",
  sendBg: null,
  sendText: null,
  micGlyph: "mic",
  micBg: null,
  micText: null,
  linkColor: null,
  chipBorder: null,
  chipBg: null,
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
export const RADIUS_RE = /^(0|(?:\d+(?:\.\d+)?)(px|rem|%))$/;

/** Flat JSON-safe override: every control writes fields of this object. */
export interface WidgetThemeOverride {
  primary?: string;
  secondary?: string;
  radius?: string;
  surface?: string;
  text?: string;
  logoUrl?: string | null;
  panelRadius?: string;
  userRadius?: string;
  aiRadius?: string;
  inputRadius?: string;
  launcherRadius?: string;
  headerBg?: string | null;
  headerText?: string | null;
  headerBorder?: string | null;
  showLogo?: boolean;
  headerTitle?: string | null;
  headerDomain?: string | null;
  showReady?: boolean;
  userBg?: string | null;
  userText?: string | null;
  aiBg?: string | null;
  aiText?: string | null;
  aiBorder?: string | null;
  avatarMode?: AvatarMode;
  avatarBg?: string | null;
  avatarText?: string | null;
  customAvatarUrl?: string | null;
  inputBg?: string | null;
  inputBorder?: string | null;
  inputText?: string | null;
  placeholderText?: string | null;
  focusRing?: string | null;
  launcherMode?: LauncherMode;
  launcherGlyph?: string;
  launcherBg?: string | null;
  launcherHover?: string | null;
  launcherBorder?: string | null;
  sendGlyph?: string;
  sendBg?: string | null;
  sendText?: string | null;
  micGlyph?: string;
  micBg?: string | null;
  micText?: string | null;
  linkColor?: string | null;
  chipBorder?: string | null;
  chipBg?: string | null;
}

/** Canonical lowercase hex, or null when unusable. */
export function cleanHexValue(v: unknown): string | null {
  if (typeof v === "string" && HEX_RE.test(v.trim())) return v.trim().toLowerCase();
  return null;
}

/** Nullable hex: null clears the field, otherwise must be valid hex. */
function cleanNullableHex(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const h = cleanHexValue(v);
  return h ?? undefined;
}

/** Nullable radius: null clears, otherwise must match the shared pattern. */
function cleanNullableRadius(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  return cleanRadiusValue(v) ?? undefined;
}

/** Header/body text: trimmed, max 80 chars, no angle brackets. */
export function cleanTextValue(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim().slice(0, 80);
  if (t.length === 0) return null;
  if (/[<>]/.test(t)) return undefined;
  return t;
}

export function cleanRadiusValue(v: unknown): string | null {
  if (typeof v === "string" && RADIUS_RE.test(v.trim())) return v.trim();
  return null;
}

export function cleanLogoUrlValue(v: unknown): string | null {
  return cleanLogoUrl(v);
}

/** Avatar artwork: https URL or inline data:image (uploads), capped. */
export function cleanAvatarUrlValue(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.startsWith("data:image/")) return t.length <= 700_000 ? t : null;
  return cleanLogoUrl(v);
}

/** True when every present override field is well-formed. */
export function isValidOverride(o: unknown): o is WidgetThemeOverride {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  for (const k of [
    "primary", "secondary", "surface", "text",
    "headerBg", "headerText", "headerBorder",
    "userBg", "userText", "aiBg", "aiText", "aiBorder",
    "avatarBg", "avatarText",
    "inputBg", "inputBorder", "inputText", "placeholderText", "focusRing",
    "launcherBg", "launcherHover", "launcherBorder",
    "sendBg", "sendText", "micBg", "micText",
    "linkColor", "chipBorder", "chipBg",
  ] as const) {
    const v = r[k];
    if (v !== undefined && v !== null && cleanHexValue(v) === null) return false;
  }
  for (const k of ["radius", "panelRadius", "userRadius", "aiRadius", "inputRadius", "launcherRadius"] as const) {
    if (r[k] !== undefined && cleanRadiusValue(r[k]) === null) return false;
  }
  if (r.logoUrl !== undefined && r.logoUrl !== null) {
    if (cleanLogoUrlValue(r.logoUrl) === null) return false;
  }
  if (r.customAvatarUrl !== undefined && r.customAvatarUrl !== null) {
    if (cleanAvatarUrlValue(r.customAvatarUrl) === null) return false;
  }
  if (r.avatarMode !== undefined && !(AVATAR_MODES as string[]).includes(r.avatarMode as string)) return false;
  if (r.launcherMode !== undefined && !(LAUNCHER_MODES as string[]).includes(r.launcherMode as string)) return false;
  if (r.launcherGlyph !== undefined && !LAUNCHER_GLYPHS.includes(r.launcherGlyph as string)) return false;
  if (r.sendGlyph !== undefined && !(SEND_GLYPHS as readonly string[]).includes(r.sendGlyph as string)) return false;
  if (r.micGlyph !== undefined && !(MIC_GLYPHS as readonly string[]).includes(r.micGlyph as string)) return false;
  for (const k of ["showLogo", "showReady"] as const) {
    if (r[k] !== undefined && typeof r[k] !== "boolean") return false;
  }
  for (const k of ["headerTitle", "headerDomain"] as const) {
    if (r[k] !== undefined && r[k] !== null && cleanTextValue(r[k]) === undefined) return false;
  }
  return true;
}

/** Merges extraction base with a draft override, recomputing contrast gates. */
export function mergeThemeOverride(
  base: WidgetTheme,
  override: WidgetThemeOverride
): WidgetTheme {
  const merged: WidgetTheme = { ...base };
  const primary = override.primary !== undefined ? cleanHexValue(override.primary) : undefined;
  const secondary = override.secondary !== undefined ? cleanHexValue(override.secondary) : undefined;
  const surface = override.surface !== undefined ? cleanHexValue(override.surface) : undefined;
  const text = override.text !== undefined ? cleanHexValue(override.text) : undefined;
  const radius = override.radius !== undefined ? cleanRadiusValue(override.radius) : undefined;
  if (primary) merged.primary = primary;
  if (secondary) merged.secondary = secondary;
  if (surface) merged.surface = surface;
  if (text) merged.text = text;
  if (radius) {
    merged.radius = radius;
    if (override.panelRadius === undefined) merged.panelRadius = radius;
    if (override.userRadius === undefined) merged.userRadius = radius;
    if (override.aiRadius === undefined) merged.aiRadius = radius;
    if (override.inputRadius === undefined) merged.inputRadius = radius;
  }
  if (override.logoUrl !== undefined) {
    merged.logoUrl = override.logoUrl === null ? null : cleanLogoUrlValue(override.logoUrl);
  }
  for (const k of ["panelRadius", "userRadius", "aiRadius", "inputRadius", "launcherRadius"] as const) {
    const v = override[k];
    if (v !== undefined) {
      const c = cleanRadiusValue(v);
      if (c) merged[k] = c;
    }
  }
  for (const k of [
    "headerBg", "headerText", "headerBorder",
    "userBg", "userText", "aiBg", "aiText", "aiBorder",
    "avatarBg", "avatarText",
    "inputBg", "inputBorder", "inputText", "placeholderText", "focusRing",
    "launcherBg", "launcherHover", "launcherBorder",
    "sendBg", "sendText", "micBg", "micText",
    "linkColor", "chipBorder", "chipBg",
  ] as const) {
    const v = override[k];
    if (v !== undefined) {
      const c = cleanNullableHex(v);
      if (c !== undefined) (merged as unknown as Record<string, unknown>)[k] = c;
    }
  }
  if (override.avatarMode !== undefined && (AVATAR_MODES as string[]).includes(override.avatarMode)) {
    merged.avatarMode = override.avatarMode;
  }
  if (override.launcherMode !== undefined && (LAUNCHER_MODES as string[]).includes(override.launcherMode)) {
    merged.launcherMode = override.launcherMode;
  }
  if (override.launcherGlyph !== undefined && LAUNCHER_GLYPHS.includes(override.launcherGlyph)) {
    merged.launcherGlyph = override.launcherGlyph;
  }
  if (override.sendGlyph !== undefined && (SEND_GLYPHS as readonly string[]).includes(override.sendGlyph)) {
    merged.sendGlyph = override.sendGlyph;
  }
  if (override.micGlyph !== undefined && (MIC_GLYPHS as readonly string[]).includes(override.micGlyph)) {
    merged.micGlyph = override.micGlyph;
  }
  if (override.showLogo !== undefined) merged.showLogo = override.showLogo;
  if (override.showReady !== undefined) merged.showReady = override.showReady;
  for (const k of ["headerTitle", "headerDomain"] as const) {
    const v = override[k];
    if (v !== undefined) {
      const c = cleanTextValue(v);
      if (c !== undefined) (merged as unknown as Record<string, unknown>)[k] = c;
    }
  }
  if (override.customAvatarUrl !== undefined) {
    merged.customAvatarUrl =
      override.customAvatarUrl === null ? null : cleanAvatarUrlValue(override.customAvatarUrl);
  }
  const bodySurface = contrastRatio(merged.text, merged.surface) >= 4.5;
  const accentOnSurface = contrastRatio(merged.primary, merged.surface) >= 3;
  return {
    ...merged,
    bodySurface,
    accentOnSurface,
    fullSurface: bodySurface && accentOnSurface,
  };
}

function cleanHex(v: unknown, fallback: string): string {
  if (typeof v === "string" && HEX_RE.test(v.trim())) return v.trim().toLowerCase();
  return fallback;
}

function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v.trim());
}

function cleanRadius(v: unknown): string {
  if (typeof v === "string" && RADIUS_RE.test(v.trim())) return v.trim();
  return DEFAULTS.radius;
}

function cleanLogoUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return null;
    return t;
  } catch {
    return null;
  }
}

function luminance(hex: string): number {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const s = parseInt(full.slice(i, i + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * True when dark body copy reads better on the color than light copy.
 * Self-calibrating (no magic threshold): compares dark vs light text
 * contrast directly. Used to decide when dark-designed pills/badges need
 * darkened text on a light brand surface.
 */
export function isLightSurface(hex: string): boolean {
  if (!isHexColor(hex)) return false;
  const h = hex.trim().toLowerCase();
  return contrastRatio("#18181b", h) >= contrastRatio("#fafafa", h);
}

function rec(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as Record<string, any>) : {};
}

function firstNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim();
  }
  return undefined;
}

/** One observed text/background pair (dembrandt `--wcag` shape, tolerant). */
export interface NormalizedWcagPair {
  fg: string;
  bg: string;
  /** Recomputed with our own contrastRatio (consistent, sanitized). */
  ratio: number;
  /** Observed frequency; tie-break only, never a gate. */
  count: number;
}

/**
 * Normalizes stored WCAG data into clean pairs. Accepts the raw
 * `brand_stylesheets.wcag` column as-is: an array OR `{ pairs: [...] }`,
 * with dembrandt field names (`fg`/`bg`/`ratio`/`count`/`passAA`…) or the
 * generic aliases (`foreground`/`background`/`text`). Non-hex entries are
 * dropped. Never throws.
 */
export function normalizeWcagPairs(input: unknown): NormalizedWcagPair[] {
  try {
    const arr = Array.isArray(input) ? input : rec(input).pairs;
    if (!Array.isArray(arr)) return [];
    const out: NormalizedWcagPair[] = [];
    for (const p of arr) {
      const r = rec(p);
      const fgRaw = firstNonEmptyString(r.fg, r.foreground, r.text);
      const bgRaw = firstNonEmptyString(r.bg, r.background);
      if (!isHexColor(fgRaw) || !isHexColor(bgRaw)) continue;
      const fg = (fgRaw as string).trim().toLowerCase();
      const bg = (bgRaw as string).trim().toLowerCase();
      if (fg === bg) continue;
      const rawCount = (r as Record<string, unknown>).count;
      const count =
        typeof rawCount === "number" && Number.isFinite(rawCount) && rawCount >= 0
          ? Math.floor(rawCount)
          : 0;
      out.push({ fg, bg, ratio: contrastRatio(fg, bg), count });
    }
    return out;
  } catch {
    return [];
  }
}

export interface BestSurfacePair {
  /** Background to paint the shell with (pair's observed bg). */
  surface: string;
  /** Body copy color (pair's observed fg). */
  text: string;
  ratio: number;
  count: number;
}

/**
 * Picks the highest-ratio observed pair that passes body-text contrast
 * (>= 4.5). Ranked by ratio, then by observed frequency. Returns null
 * when no AA pair exists — the caller falls back to brand tokens, then
 * to the neutral shell. Never throws.
 */
export function pickBestSurfacePair(input: unknown): BestSurfacePair | null {
  const pairs = normalizeWcagPairs(input).filter((p) => p.ratio >= 4.5);
  if (pairs.length === 0) return null;
  pairs.sort((a, b) => b.ratio - a.ratio || b.count - a.count);
  const best = pairs[0];
  return { surface: best.bg, text: best.fg, ratio: best.ratio, count: best.count };
}

/**
 * Maps raw brand tokens (brands.tokens shape) to a sanitized widget theme.
 *
 * Surface/text resolution order:
 *  1. Best observed WCAG pair (`wcagPairs` = brand_stylesheets.wcag) — real
 *     measured contrast from the company's own site, highest ratio wins.
 *  2. Raw token background/foreground.
 *  3. Neutral dark defaults.
 *
 * The two-tier gate keeps this safe: the shell applies on body contrast
 * alone (>= 4.5); brand accents additionally need primary-on-surface >= 3.
 */
export function mapBrandToWidgetTheme(
  tokens: unknown,
  logoUrl?: unknown,
  wcagPairs?: unknown
): WidgetTheme {
  try {
    const t = rec(tokens);
    const colors = rec(t.colors);
    const primary = cleanHex(colors.primary, DEFAULTS.primary);
    const secondary = cleanHex(
      colors.secondary ?? colors.accent,
      DEFAULTS.secondary
    );
    const tokenSurface = cleanHex(
      colors.background ?? colors.surface,
      DEFAULTS.surface
    );
    const tokenText = cleanHex(
      colors.foreground ?? colors.text,
      DEFAULTS.text
    );
    const tokensProvided =
      firstNonEmptyString(colors.background, colors.surface) !== undefined ||
      firstNonEmptyString(colors.foreground, colors.text) !== undefined;

    const best = wcagPairs === undefined ? null : pickBestSurfacePair(wcagPairs);
    const surface = best ? best.surface : tokenSurface;
    const text = best ? best.text : tokenText;
    const surfaceSource = best ? "wcag-best" : tokensProvided ? "tokens" : "default";

    const bodySurface = contrastRatio(text, surface) >= 4.5;
    const accentOnSurface = contrastRatio(primary, surface) >= 3;
    const radius = cleanRadius(t.radius);
    return {
      primary,
      secondary,
      radius,
      surface,
      text,
      logoUrl: cleanLogoUrl(logoUrl ?? t.logoUrl),
      fullSurface: bodySurface && accentOnSurface,
      bodySurface,
      accentOnSurface,
      surfaceSource,
      panelRadius: radius,
      userRadius: radius,
      aiRadius: radius,
      inputRadius: radius,
      launcherRadius: DEFAULTS.launcherRadius,
      headerBg: null,
      headerText: null,
      headerBorder: null,
      showLogo: true,
      headerTitle: null,
      headerDomain: null,
      showReady: true,
      userBg: null,
      userText: null,
      aiBg: null,
      aiText: null,
      aiBorder: null,
      avatarMode: "auto",
      avatarBg: null,
      avatarText: null,
      customAvatarUrl: null,
      inputBg: null,
      inputBorder: null,
      inputText: null,
      placeholderText: null,
      focusRing: null,
      launcherMode: "auto",
      launcherGlyph: DEFAULTS.launcherGlyph,
      launcherBg: null,
      launcherHover: null,
      launcherBorder: null,
      sendGlyph: DEFAULTS.sendGlyph,
      sendBg: null,
      sendText: null,
      micGlyph: DEFAULTS.micGlyph,
      micBg: null,
      micText: null,
      linkColor: null,
      chipBorder: null,
      chipBg: null,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/** CSS variable dict for direct application on an element. */
export function widgetThemeVars(theme: WidgetTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--brand-primary": theme.primary,
    "--brand-secondary": theme.secondary,
    "--brand-radius": theme.radius,
    "--brand-panel-radius": theme.panelRadius,
    "--brand-user-radius": theme.userRadius,
    "--brand-ai-radius": theme.aiRadius,
    "--brand-input-radius": theme.inputRadius,
    "--brand-launcher-radius": theme.launcherRadius,
  };
  if (theme.bodySurface) {
    vars["--brand-surface"] = theme.surface;
    vars["--brand-text"] = theme.text;
  }
  const put = (k: string, v: string | null) => {
    if (v) vars[k] = v;
  };
  put("--brand-header-bg", theme.headerBg);
  put("--brand-header-text", theme.headerText);
  put("--brand-header-border", theme.headerBorder);
  put("--brand-user-bg", theme.userBg);
  put("--brand-user-text", theme.userText);
  put("--brand-ai-bg", theme.aiBg);
  put("--brand-ai-text", theme.aiText);
  put("--brand-ai-border", theme.aiBorder);
  put("--brand-avatar-bg", theme.avatarBg);
  put("--brand-avatar-text", theme.avatarText);
  put("--brand-input-bg", theme.inputBg);
  put("--brand-input-border", theme.inputBorder);
  put("--brand-input-text", theme.inputText);
  put("--brand-focus-ring", theme.focusRing);
  put("--brand-launcher-bg", theme.launcherBg);
  put("--brand-launcher-hover", theme.launcherHover);
  put("--brand-launcher-border", theme.launcherBorder);
  put("--brand-send-bg", theme.sendBg);
  put("--brand-send-text", theme.sendText);
  put("--brand-mic-bg", theme.micBg);
  put("--brand-mic-text", theme.micText);
  put("--brand-link", theme.linkColor);
  put("--brand-chip-border", theme.chipBorder);
  put("--brand-chip-bg", theme.chipBg);
  return vars;
}

/** Applies the theme vars to a DOM element / document root. No fonts, ever. */
export function applyWidgetTheme(
  el: { style: { setProperty: (k: string, v: string) => void } },
  theme: WidgetTheme
): void {
  const vars = widgetThemeVars(theme);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
}
