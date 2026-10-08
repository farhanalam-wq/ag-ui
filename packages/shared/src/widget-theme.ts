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
  /** True when surface/text passed contrast and may be applied. */
  fullSurface: boolean;
}

const DEFAULTS: WidgetTheme = {
  primary: "#2563eb",
  secondary: "#3b82f6",
  radius: "0.5rem",
  surface: "#09090b",
  text: "#fafafa",
  logoUrl: null,
  fullSurface: false,
};

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const RADIUS_RE = /^(0|(?:\d+(?:\.\d+)?)(px|rem|%))$/;

function cleanHex(v: unknown, fallback: string): string {
  if (typeof v === "string" && HEX_RE.test(v.trim())) return v.trim().toLowerCase();
  return fallback;
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

function rec(v: unknown): Record<string, any> {
  return v && typeof v === "object" ? (v as Record<string, any>) : {};
}

/**
 * Maps raw brand tokens (brands.tokens shape) to a sanitized widget theme.
 * surface/text are only flagged usable when they pass contrast; otherwise
 * the caller keeps the neutral shell and brands header/launcher only.
 */
export function mapBrandToWidgetTheme(tokens: unknown, logoUrl?: unknown): WidgetTheme {
  try {
    const t = rec(tokens);
    const colors = rec(t.colors);
    const primary = cleanHex(colors.primary, DEFAULTS.primary);
    const secondary = cleanHex(
      colors.secondary ?? colors.accent,
      DEFAULTS.secondary
    );
    const surface = cleanHex(
      colors.background ?? colors.surface,
      DEFAULTS.surface
    );
    const text = cleanHex(
      colors.foreground ?? colors.text,
      DEFAULTS.text
    );
    const fullSurface =
      contrastRatio(text, surface) >= 4.5 && contrastRatio(primary, surface) >= 3;
    return {
      primary,
      secondary,
      radius: cleanRadius(t.radius),
      surface,
      text,
      logoUrl: cleanLogoUrl(logoUrl ?? t.logoUrl),
      fullSurface,
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
  if (theme.fullSurface) {
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
