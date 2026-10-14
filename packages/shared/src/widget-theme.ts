// Widget theme contract: maps a company's brand tokens to the embed's CSS
// variables. Everything is sanitized — tokens originate from scraped
// third-party CSS and must never reach the DOM raw.
//
// Fonts are deliberately excluded (licensing + availability): the embed
// keeps its system stack permanently.

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
}

/** Canonical lowercase hex, or null when unusable. */
export function cleanHexValue(v: unknown): string | null {
  if (typeof v === "string" && HEX_RE.test(v.trim())) return v.trim().toLowerCase();
  return null;
}

export function cleanRadiusValue(v: unknown): string | null {
  if (typeof v === "string" && RADIUS_RE.test(v.trim())) return v.trim();
  return null;
}

export function cleanLogoUrlValue(v: unknown): string | null {
  return cleanLogoUrl(v);
}

/** True when every present override field is well-formed. */
export function isValidOverride(o: unknown): o is WidgetThemeOverride {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  for (const k of ["primary", "secondary", "surface", "text"] as const) {
    if (r[k] !== undefined && cleanHexValue(r[k]) === null) return false;
  }
  if (r.radius !== undefined && cleanRadiusValue(r.radius) === null) return false;
  if (r.logoUrl !== undefined && r.logoUrl !== null) {
    if (cleanLogoUrlValue(r.logoUrl) === null) return false;
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
  if (radius) merged.radius = radius;
  if (override.logoUrl !== undefined) {
    merged.logoUrl = override.logoUrl === null ? null : cleanLogoUrlValue(override.logoUrl);
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
    return {
      primary,
      secondary,
      radius: cleanRadius(t.radius),
      surface,
      text,
      logoUrl: cleanLogoUrl(logoUrl ?? t.logoUrl),
      fullSurface: bodySurface && accentOnSurface,
      bodySurface,
      accentOnSurface,
      surfaceSource,
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
  };
  if (theme.bodySurface) {
    vars["--brand-surface"] = theme.surface;
    vars["--brand-text"] = theme.text;
  }
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
