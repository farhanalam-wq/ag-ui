import * as cheerio from "cheerio";
import type { BrandTokens } from "@ag-ui/contracts";
import { validateSafeUrl } from "./ssrf";

export interface ExtractedBrandData {
  logoUrl?: string;
  faviconUrl?: string;
  tokens: BrandTokens;
  /** Per-field provenance: "fallback" means the hardcoded default fired. */
  sources?: BrandSources;
}

export interface ExtractBrandOptions {
  fetchExternalCss?: boolean;
  maxStylesheets?: number;
  timeoutMs?: number;
  /**
   * Optional diagnostics callback. Receives non-blocking lifecycle events
   * (stylesheets discovered, per-file fetch outcomes, css byte totals, and
   * which detector produced the primary color) so callers can attribute
   * per-URL `fallback` results instead of guessing. Never throws.
   */
  onStage?: (ev: BrandDiagEvent) => void;
}

export interface BrandDiagEvent {
  type: "stylesheets-found" | "stylesheet-fetch" | "css-bytes" | "primary-source";
  /** All stylesheet URLs discovered in page HTML (`stylesheets-found`). */
  urls?: string[];
  /** Single stylesheet URL (`stylesheet-fetch`). */
  url?: string;
  ok?: boolean;
  bytes?: number;
  ms?: number;
  error?: string;
  /** Combined inline + external CSS bytes fed to extraction (`css-bytes`). */
  totalBytes?: number;
  /** Inline CSS bytes portion of `totalBytes`. */
  inlineBytes?: number;
  /** Which detector produced the primary color (`primary-source`). */
  source?: BrandFieldSource;
  /** Extracted primary value ("" when honestly empty). */
  primary?: string;
}

/**
 * Resolves a potentially relative URL against the base page URL.
 * Only http(s) targets are accepted — pages commonly ship
 * `<link rel="icon" href="data:,">` stubs (or blob:/javascript: URLs) that
 * must never become the stored logoUrl.
 */
function resolveAssetUrl(raw: string | undefined, baseUrl: URL): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (/^(data|blob|javascript|mailto|tel):/i.test(trimmed)) return undefined;
  try {
    const resolved = new URL(trimmed, baseUrl).toString();
    if (!resolved.startsWith("http://") && !resolved.startsWith("https://")) return undefined;
    return resolved;
  } catch {
    return undefined;
  }
}

/**
 * Normalizes hex colors (#rgb, #rgba, #rrggbb, #rrggbbaa) to 6-digit #rrggbb.
 */
function normalizeHex(hex: string): string | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length === 3) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toLowerCase();
  }
  if (clean.length === 4) {
    return `#${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`.toLowerCase();
  }
  if (clean.length === 6) {
    return `#${clean}`.toLowerCase();
  }
  if (clean.length === 8) {
    return `#${clean.slice(0, 6)}`.toLowerCase();
  }
  return null;
}

/**
 * Converts HSL (h: 0-360, s: 0-100, l: 0-100) to hex (#rrggbb).
 */
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Converts RGB (0-255) to hex (#rrggbb).
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
}

function linearToSrgb(u: number): number {
  const c = Math.max(0, u);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/** OKLab (L 0-1, a, b) to hex via linear sRGB (out-of-gamut clips). */
function oklabToHex(l: number, a: number, b: number): string {
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;
  const r = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;
  return rgbToHex(linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(bl) * 255);
}

/** OKLCH (L 0-1, C, h-deg) to hex. */
function oklchToHex(l: number, c: number, hDeg: number): string {
  const h = ((hDeg % 360) + 360) % 360;
  const rad = (h * Math.PI) / 180;
  return oklabToHex(l, c * Math.cos(rad), c * Math.sin(rad));
}

/** CIE Lab (L 0-100, a, b, D65) to hex. */
function labToHex(l: number, a: number, b: number): string {
  const fy = (Math.max(0, Math.min(100, l)) + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const f = (t: number) => (t * t * t > 0.008856 ? t * t * t : (116 * t - 16) / 903.3);
  const x = 0.95047 * f(fx);
  const y = f(fy);
  const z = 1.08883 * f(fz);
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return rgbToHex(linearToSrgb(r) * 255, linearToSrgb(g) * 255, linearToSrgb(bl) * 255);
}

/** CIE LCH (L 0-100, C, h-deg) to hex. */
function lchToHex(l: number, c: number, hDeg: number): string {
  const h = ((hDeg % 360) + 360) % 360;
  const rad = (h * Math.PI) / 180;
  return labToHex(l, c * Math.cos(rad), c * Math.sin(rad));
}

/** Common CSS named colors. Signals only — transparent/currentcolor return null. */
const NAMED_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", lime: "#00ff00", blue: "#0000ff",
  yellow: "#ffff00", cyan: "#00ffff", aqua: "#00ffff", magenta: "#ff00ff", fuchsia: "#ff00ff",
  gray: "#808080", grey: "#808080", darkgray: "#a9a9a9", darkgrey: "#a9a9a9",
  lightgray: "#d3d3d3", lightgrey: "#d3d3d3", dimgray: "#696969", dimgrey: "#696969",
  silver: "#c0c0c0", maroon: "#800000", olive: "#808000", green: "#008000", teal: "#008080",
  navy: "#000080", purple: "#800080", orange: "#ffa500", coral: "#ff7f50", tomato: "#ff6347",
  orangered: "#ff4500", crimson: "#dc143c", firebrick: "#b22222", darkred: "#8b0000",
  indianred: "#cd5c5c", salmon: "#fa8072", darksalmon: "#e9967a", lightsalmon: "#ffa07a",
  gold: "#ffd700", khaki: "#f0e68c", darkkhaki: "#bdb76b", goldenrod: "#daa520",
  darkgoldenrod: "#b8860b", palegoldenrod: "#eee8aa", yellowgreen: "#9acd32",
  greenyellow: "#adff2f", chartreuse: "#7fff00", lawngreen: "#7cfc00", limegreen: "#32cd32",
  darkgreen: "#006400", forestgreen: "#228b22", seagreen: "#2e8b57", mediumseagreen: "#3cb371",
  springgreen: "#00ff7f", mediumspringgreen: "#00fa9a", lightgreen: "#90ee90",
  palegreen: "#98fb98", darkseagreen: "#8fbc8f", lightseagreen: "#20b2aa",
  mediumaquamarine: "#66cdaa", aquamarine: "#7fffd4", turquoise: "#40e0d0",
  mediumturquoise: "#48d1cc", darkturquoise: "#00ced1", paleturquoise: "#afeeee",
  cadetblue: "#5f9ea0", steelblue: "#4682b4", lightsteelblue: "#b0c4de",
  powderblue: "#b0e0e6", lightblue: "#add8e6", skyblue: "#87ceeb", lightskyblue: "#87cefa",
  deepskyblue: "#00bfff", dodgerblue: "#1e90ff", cornflowerblue: "#6495ed",
  royalblue: "#4169e1", mediumblue: "#0000cd", darkblue: "#00008b", midnightblue: "#191970",
  indigo: "#4b0082", darkslateblue: "#483d8b", slateblue: "#6a5acd", mediumslateblue: "#7b68ee",
  mediumpurple: "#9370db", blueviolet: "#8a2be2", darkviolet: "#9400d3",
  darkorchid: "#9932cc", mediumorchid: "#ba55d3", orchid: "#da70d6", thistle: "#d8bfd8",
  plum: "#dda0dd", violet: "#ee82ee", darkmagenta: "#8b008b", mediumvioletred: "#c71585",
  palevioletred: "#db7093", deeppink: "#ff1493", hotpink: "#ff69b4", lightpink: "#ffb6c1",
  pink: "#ffc0cb", rosybrown: "#bc8f8f", brown: "#a52a2a", saddlebrown: "#8b4513",
  sienna: "#a0522d", chocolate: "#d2691e", peru: "#cd853f", sandybrown: "#f4a460",
  burlywood: "#deb887", tan: "#d2b48c", wheat: "#f5deb3", navajowhite: "#ffdead",
  bisque: "#ffe4c4", blanchedalmond: "#ffebcd", cornsilk: "#fff8dc", lemonchiffon: "#fffacd",
  lightgoldenrodyellow: "#fafad2", lightyellow: "#ffffe0", ivory: "#fffff0",
  beige: "#f5f5dc", linen: "#faf0e6", antiquewhite: "#faebd7", oldlace: "#fdf5e6",
  floralwhite: "#fffaf0", whitesmoke: "#f5f5f5", lavenderblush: "#fff0f5", mistyrose: "#ffe4e1",
  seashell: "#fff5ee", snow: "#fffafa", honeydew: "#f0fff0", mintcream: "#f5fffa",
  azure: "#f0ffff", aliceblue: "#f0f8ff", ghostwhite: "#f8f8ff", lavender: "#e6e6fa",
  lightcyan: "#e0ffff", papayawhip: "#ffefd5", moccasin: "#ffe4b5",   peachpuff: "#ffdab9",
  darkorange: "#ff8c00", rebeccapurple: "#663399",
};

/**
 * Parses any CSS color format (hex, rgb, rgba, hsl, hsla, or Tailwind/shadcn raw HSL channels) into #rrggbb.
 */
export function parseColorToHex(raw: string): string | null {
  if (!raw) return null;
  const str = raw.trim();

  // 1. Direct hex
  if (str.startsWith("#")) {
    const match = str.match(/^#([0-9a-fA-F]{3,8})/);
    if (match) return normalizeHex(match[0]);
  }

  // 2. rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = str.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    return rgbToHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  }

  // 3. hsl(h, s%, l%) or hsla(h, s%, l%, a) or space-separated hsl(h s% l% / a)
  const hslMatch = str.match(/^hsla?\(\s*(\d+(?:\.\d+)?)\s*(?:deg)?(?:,|\s+)\s*(\d+(?:\.\d+)?)%?(?:,|\s+)\s*(\d+(?:\.\d+)?)%?/i);
  if (hslMatch) {
    return hslToHex(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]));
  }

  // 4. Tailwind/shadcn raw space-separated or comma-separated HSL channels: e.g. "222.2 84% 4.9%" or "0 0% 100%"
  const twHslMatch = str.match(/^(\d+(?:\.\d+)?)\s*(?:deg)?(?:,|\s+)\s*(\d+(?:\.\d+)?)%?(?:,|\s+)\s*(\d+(?:\.\d+)?)%?$/);
  if (twHslMatch) {
    return hslToHex(Number(twHslMatch[1]), Number(twHslMatch[2]), Number(twHslMatch[3]));
  }

  // 5. Bare hex without '#': legacy HTML attributes (BGCOLOR=00CCCC) and sloppy CSS.
  const bareHex = str.match(/^([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/);
  if (bareHex) return normalizeHex("#" + bareHex[1]);

  // 6. Space-separated rgb()/hsl() with optional "/ alpha" (CSS Color 4).
  //    e.g. "rgb(227 24 55)", "rgb(227 24 55 / 50%)", "hsl(4 80% 50% / 0.5)"
  const spaceRgb = str.match(/^rgba?\(\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
  if (spaceRgb) {
    return rgbToHex(Number(spaceRgb[1]), Number(spaceRgb[2]), Number(spaceRgb[3]));
  }
  const spaceHsl = str.match(/^hsla?\(\s*(\d+(?:\.\d+)?)(?:deg)?\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
  if (spaceHsl) {
    return hslToHex(Number(spaceHsl[1]), Number(spaceHsl[2]), Number(spaceHsl[3]));
  }

  // 7. oklab()/oklch()/lab()/lch() (Tailwind v4 @theme tokens are oklch).
  const oklchMatch = str.match(/^oklch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
  if (oklchMatch) {
    let l = Number(oklchMatch[1]);
    if (oklchMatch[0].includes("%") || l > 1) l = l > 1 ? l / 100 : l;
    return oklchToHex(l, Number(oklchMatch[2]), Number(oklchMatch[3]));
  }
  const oklabMatch = str.match(/^oklab\(\s*([\d.]+)%?\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
  if (oklabMatch) {
    let l = Number(oklabMatch[1]);
    if (l > 1) l = l / 100;
    return oklabToHex(l, Number(oklabMatch[2]), Number(oklabMatch[3]));
  }
  const lchMatch = str.match(/^lch\(\s*([\d.]+)%?\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
  if (lchMatch) {
    return lchToHex(Number(lchMatch[1]), Number(lchMatch[2]), Number(lchMatch[3]));
  }
  const labMatch = str.match(/^lab\(\s*([\d.]+)%?\s+([-\d.]+)\s+([-\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/i);
  if (labMatch) {
    return labToHex(Number(labMatch[1]), Number(labMatch[2]), Number(labMatch[3]));
  }

  // 8. color-mix(in srgb, A 60%, B) — resolve by mixing endpoints in sRGB.
  const mixMatch = str.match(/^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\)$/i);
  const mixMatch50 = str.match(/^color-mix\(\s*in\s+[\w-]+\s*,\s*(.+?)\s*,\s*(.+?)\)$/i);
  const mix = mixMatch ?? (mixMatch50 ? [mixMatch50[0], mixMatch50[1], "50", mixMatch50[2]] : null);
  if (mix) {
    const aHex = parseColorToHex(mix[1].trim());
    const bHex = parseColorToHex(mix[3].trim());
    if (aHex && bHex) {
      const w = Math.max(0, Math.min(100, Number(mix[2]))) / 100;
      const av = hexToRgb(aHex);
      const bv = hexToRgb(bHex);
      if (av && bv) {
        return rgbToHex(av[0] * w + bv[0] * (1 - w), av[1] * w + bv[1] * (1 - w), av[2] * w + bv[2] * (1 - w));
      }
    }
  }

  // 9. CSS named colors (common subset; transparent/currentcolor carry no signal).
  const named = NAMED_COLORS[str.toLowerCase()];
  if (named) return named;

  return null;
}

/**
 * Allowlist-sanitizes a font family name extracted from untrusted HTML/CSS.
 * Google Fonts params often carry weight suffixes (e.g. "Inter:wght@400;700"),
 * which are stripped; anything outside plain font-name characters is rejected
 * so the value can never break out of its CSS declaration when compiled into
 * the brand stylesheet injected on widget host pages.
 */
export function sanitizeFontName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const collapsed = raw.trim().replace(/\s+/g, " ");
  const base = collapsed.split(/[:@]/)[0].trim();
  return /^[A-Za-z][A-Za-z0-9 \-]{0,48}$/.test(base) ? base : undefined;
}

/**
 * Allowlist-sanitizes a border-radius value extracted from untrusted CSS.
 * Returns undefined when the value is unusable — callers emit "" (honestly
 * empty) instead of a fabricated default.
 */
export function sanitizeRadius(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim().toLowerCase();
  return /^(\d*\.?\d+(rem|px|em|%)|9999px|0)$/.test(v) ? v : undefined;
}

/**
 * Calculates relative luminance of an #rrggbb hex color (0 = black, 1 = white).
 */
export function calculateLuminance(hex: string): number {
  const norm = normalizeHex(hex);
  if (!norm) return 0.5;
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Calculates HSL saturation of an #rrggbb hex color (0 = gray, 1 = vivid).
 * Used to tell chromatic brand colors apart from grayscale page chrome.
 */
export function colorSaturation(hex: string): number {
  const norm = normalizeHex(hex);
  if (!norm) return 0;
  const r = parseInt(norm.slice(1, 3), 16) / 255;
  const g = parseInt(norm.slice(3, 5), 16) / 255;
  const b = parseInt(norm.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const l = (max + min) / 2;
  return (max - min) / (1 - Math.abs(2 * l - 1) || 1);
}

/**
 * Collects external stylesheet URLs from page HTML.
 */
function extractStylesheetUrls($: cheerio.CheerioAPI, baseUrl: URL): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  $("link[rel='stylesheet'], link[rel~='stylesheet'], link[as='style']").each((_, el) => {
    const href = $(el).attr("href");
    const resolved = resolveAssetUrl(href, baseUrl);
    if (!resolved) return;

    try {
      const u = new URL(resolved);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;

      // Filter out trackers and ad networks
      const host = u.hostname.toLowerCase();
      if (
        host.includes("googletagmanager") ||
        host.includes("google-analytics") ||
        host.includes("segment") ||
        host.includes("clarity.ms") ||
        host.includes("hotjar")
      ) {
        return;
      }

      if (!seen.has(resolved)) {
        seen.add(resolved);
        urls.push(resolved);
      }
    } catch {
      // Ignore invalid URLs
    }
  });

  return urls;
}

/**
 * Fetches external stylesheets in parallel safely with SSRF protection and timeouts.
 * Returns the joined CSS plus per-file outcomes so callers can diagnose
 * silent intake loss (caps, timeouts, blocked hosts).
 */
export interface StylesheetFetchResult {
  url: string;
  ok: boolean;
  bytes: number;
  ms: number;
  error?: string;
  skippedByCap?: boolean;
}

async function fetchStylesheets(
  urls: string[],
  timeoutMs = 3500,
  maxSheets = 4
): Promise<{ css: string; results: StylesheetFetchResult[] }> {
  const results: StylesheetFetchResult[] = [];
  const targetUrls = urls.slice(0, maxSheets);
  for (const skipped of urls.slice(maxSheets)) {
    results.push({ url: skipped, ok: false, bytes: 0, ms: 0, error: `skipped: maxStylesheets=${maxSheets}`, skippedByCap: true });
  }
  if (targetUrls.length === 0) return { css: "", results };

  const settled = await Promise.allSettled(
    targetUrls.map(async (urlStr) => {
      const t0 = Date.now();
      await validateSafeUrl(urlStr);
      const res = await fetch(urlStr, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-crawler/1.0",
          Accept: "text/css,*/*;q=0.1",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) {
        results.push({ url: urlStr, ok: false, bytes: 0, ms: Date.now() - t0, error: `HTTP ${res.status}` });
        return "";
      }
      const text = await res.text();
      // Cap at 500KB per stylesheet to avoid memory bloat
      const capped = text.slice(0, 500 * 1024);
      results.push({ url: urlStr, ok: true, bytes: capped.length, ms: Date.now() - t0 });
      return capped;
    })
  );

  const css = settled
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value)
    .join("\n");
  // Attach network/SSRF rejections that never produced a result entry.
  settled.forEach((r, i) => {
    if (r.status === "rejected" && !results.some((x) => x.url === targetUrls[i])) {
      results.push({
        url: targetUrls[i],
        ok: false,
        bytes: 0,
        ms: 0,
        error: String((r.reason as any)?.message ?? r.reason).slice(0, 200),
      });
    }
  });
  return { css, results };
}

/**
 * Parses all CSS custom properties (--var: val) declared in CSS text.
 */
function extractCssVariables(css: string): Map<string, string> {
  const vars = new Map<string, string>();
  const varRegex = /--([a-zA-Z0-9_-]+)\s*:\s*([^;!}]+)/g;
  let match: RegExpExecArray | null;

  while ((match = varRegex.exec(css)) !== null) {
    const key = match[1].toLowerCase();
    const val = match[2].trim();
    if (!vars.has(key)) {
      vars.set(key, val);
    }
  }

  // Resolve 1-level pointer aliases: e.g. --color-primary: var(--primary)
  vars.forEach((val, key) => {
    const aliasMatch = val.match(/^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/i);
    if (aliasMatch) {
      const target = aliasMatch[1].toLowerCase();
      if (vars.has(target)) {
        vars.set(key, vars.get(target)!);
      }
    }
  });

  return vars;
}

/**
 * Where a brand field value came from. `fallback` means the hardcoded default
 * fired — surfaced so callers (and --json output) can tell extracted signals
 * apart from defaults instead of mistaking one for the other.
 */
export type BrandFieldSource =
  | "cssvar"
  | "meta"
  | "button"
  | "mined"
  | "fontface"
  | "fontlink"
  | "explicit"
  | "fallback";

export interface BrandSources {
  primary: BrandFieldSource;
  secondary: BrandFieldSource;
  background: BrandFieldSource;
  foreground: BrandFieldSource;
  font: BrandFieldSource;
  theme: BrandFieldSource;
  radius: BrandFieldSource;
}

export interface MinedColors {
  chromatic: { hex: string; count: number }[];
  background?: string;
  foreground?: string;
}

const MINED_COLOR_VALUE = "(#[0-9a-fA-F]{3,8}\\b|rgba?\\([^\\)]*\\)|hsla?\\([^\\)]*\\))";

/**
 * Mines utility-class stylesheets (Tailwind/Tachyons/VTEX-style) that declare
 * colors in class rules instead of CSS custom properties. Counts `color:` and
 * `background-color:` declarations (lookbehind keeps `border-color` /
 * `caret-color` out), then ranks: chromatic colors by frequency for
 * primary/secondary, most-frequent near-white for background, most-frequent
 * near-black for foreground. Only consulted when explicit signals
 * (CSS vars, meta tags, button styles) miss — and always labeled "mined".
 */
export function mineUtilityColors(cssText: string): MinedColors {
  const counts = new Map<string, number>();
  const bgCounts = new Map<string, number>();
  const record = (map: Map<string, number>, raw: string) => {
    const hex = parseColorToHex(raw);
    if (!hex) return;
    map.set(hex, (map.get(hex) ?? 0) + 1);
  };
  const colorRe = new RegExp(`(?<![\\w-])color\\s*:\\s*${MINED_COLOR_VALUE}`, "gi");
  const bgRe = new RegExp(`(?<![\\w-])background-color\\s*:\\s*${MINED_COLOR_VALUE}`, "gi");
  // `background:` shorthand (e.g. `background:#e31837`, `background:#fff url(...)`).
  // The trailing `\s*:` can't match `background-color:` (a `-` follows `background`
  // there), so no double counting with bgRe above.
  const bgShortRe = /(?<![\w-])background\s*:\s*([^;}{!]+)/gi;
  const colorTokenRe = /#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl|oklab|oklch|lab|lch)a?\([^)]*\)|\b[a-zA-Z]{3,20}\b/g;
  const SKIP_SHORTHAND_TOKENS = /^(url|var|none|transparent|inherit|initial|unset|scroll|fixed|local|cover|contain|center|repeat|norepeat|borderbox|paddingbox|contentbox|linear|radial|gradient|from|to|at|in|solid|dashed)$/i;
  let m: RegExpExecArray | null;
  while ((m = colorRe.exec(cssText)) !== null) record(counts, m[1]);
  while ((m = bgRe.exec(cssText)) !== null) {
    record(counts, m[1]);
    record(bgCounts, m[1]);
  }
  while ((m = bgShortRe.exec(cssText)) !== null) {
    const val = m[1];
    if (/^\s*var\(/i.test(val)) continue; // var-backed, handled by the cssvar path
    colorTokenRe.lastIndex = 0;
    let t: RegExpExecArray | null;
    while ((t = colorTokenRe.exec(val)) !== null) {
      if (SKIP_SHORTHAND_TOKENS.test(t[0])) continue;
      const hex = parseColorToHex(t[0]);
      if (hex) {
        record(counts, t[0]);
        record(bgCounts, t[0]);
        break;
      }
    }
  }
  const ranked = [...counts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
  const chromatic = ranked.filter((c) => colorSaturation(c.hex) > 0.15);
  let background: string | undefined;
  let foreground: string | undefined;
  const light = ranked.filter((c) => calculateLuminance(c.hex) >= 0.9);
  if (light.length > 0) {
    background = light[0].hex;
  } else {
    const bgRanked = [...bgCounts.entries()].sort((a, b) => b[1] - a[1]);
    if (bgRanked.length > 0 && calculateLuminance(bgRanked[0][0]) >= 0.75) {
      background = bgRanked[0][0];
    }
  }
  const dark = ranked.filter((c) => calculateLuminance(c.hex) <= 0.12);
  if (dark.length > 0) foreground = dark[0].hex;
  return { chromatic, background, foreground };
}

/** Generic/system font stacks that are never a brand signal. */
const GENERIC_FONTS = new Set([
  "inherit", "initial", "sans-serif", "serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
  "-apple-system", "blinkmacsystemfont", "avenir", "avenir next",
  "helvetica", "helvetica neue", "ubuntu", "roboto", "noto", "arial",
  "segoe ui", "tahoma", "verdana",
]);

/**
 * Full-stylesheet font vote. The old first-match lookup died on reset
 * stylesheets (`button{font-family:sans-serif}`) and never scanned further.
 * This harvests @font-face families, scans every `font-family` declaration,
 * skips generic/system stacks, and prefers a family the site actually ships —
 * else the most-used one.
 */
export function detectFontFromCss(cssText: string): { name: string; fromFontFace: boolean } | undefined {
  const shipped = new Set<string>();
  const faceRe = /@font-face\s*\{[^}]*?font-family\s*:\s*['"]?([^;'"}]+)/gi;
  let fm: RegExpExecArray | null;
  while ((fm = faceRe.exec(cssText)) !== null) {
    const clean = sanitizeFontName(fm[1]);
    if (clean) shipped.add(clean.toLowerCase());
  }
  const votes = new Map<string, { name: string; count: number }>();
  const declRe = /font-family\s*:\s*([^;}{]+)/gi;
  let dm: RegExpExecArray | null;
  while ((dm = declRe.exec(cssText)) !== null) {
    const first = dm[1].split(",")[0].trim().replace(/^['"]+|['"]+$/g, "");
    const clean = sanitizeFontName(first);
    if (!clean || GENERIC_FONTS.has(clean.toLowerCase())) continue;
    // Icon/glyph fonts are symbols, never brand typography — skip unless
    // nothing else exists (handled by the honest-empty fallback downstream).
    if (/icon|glyph|symbol|emoji|dingbat/i.test(clean)) continue;
    const key = clean.toLowerCase();
    const v = votes.get(key) ?? { name: clean, count: 0 };
    v.count += 1;
    votes.set(key, v);
  }
  if (votes.size === 0) return undefined;
  const ranked = [...votes.values()].sort((a, b) => b.count - a.count);
  const winner = ranked.find((r) => shipped.has(r.name.toLowerCase())) ?? ranked[0];
  return { name: winner.name, fromFontFace: shipped.has(winner.name.toLowerCase()) };
}

/**
 * Most-frequent explicit `border-radius` value, mapped onto the token scale.
 * Returns undefined when nothing usable is declared (caller keeps fallback).
 */
export function voteRadius(cssText: string): string | undefined {
  const counts = new Map<string, number>();
  const re = /border-radius\s*:\s*([^;}!]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cssText)) !== null) {
    const first = m[1].trim().split(/\s+/)[0].toLowerCase();
    if (!first || first === "inherit" || first === "initial") continue;
    counts.set(first, (counts.get(first) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  if (top === "0" || top === "0px") return "0rem";
  if (top === "50%" || top === "100%") return "9999px";
  const px = top.match(/^(\d+(?:\.\d+)?)px$/);
  if (px && Number(px[1]) >= 40) return "9999px";
  if (top === "0.5rem") return "0.5rem";
  const checked = sanitizeRadius(top);
  return checked === "0.5rem" ? undefined : checked;
}

/**
 * Finds a CSS variable by token list: exact name first, then hyphen-segment
 * match (catches namespaced/scaled tokens like `--brand-primary`,
 * `--color-primary-600`, Primer's `--bgColor-accent-emphasis`). Exact hits
 * keep priority so existing behavior is unchanged when they exist.
 */
function findVarBySegments(cssVars: Map<string, string>, tokens: string[]): string | undefined {
  for (const k of tokens) {
    if (cssVars.has(k)) return k;
  }
  const lowered = tokens.map((t) => t.toLowerCase());
  for (const name of cssVars.keys()) {
    const segs = name.toLowerCase().split("-");
    if (lowered.some((t) => segs.includes(t))) return name;
  }
  return undefined;
}

export interface LegacyAttrColors {
  /** Chromatic FONT COLOR values ranked by frequency (headings carry brand accents). */
  chromatic: { hex: string; count: number }[];
  background?: string;
  foreground?: string;
  font?: string;
}

/**
 * Last-resort signals for pre-CSS sites (hand-written 90s HTML with zero
 * stylesheets): BGCOLOR / TEXT / FONT COLOR / FACE attributes. Only consulted
 * when every modern signal misses, and always labeled "mined" — never a
 * fabricated default.
 */
function mineLegacyAttributes($: cheerio.CheerioAPI): LegacyAttrColors {
  const fontCounts = new Map<string, number>();
  $("font[color]").each((_, el) => {
    const raw = ($(el).attr("color") || "").trim();
    if (!raw) return;
    const hex = parseColorToHex(raw.startsWith("#") ? raw : `#${raw}`);
    if (!hex) return;
    fontCounts.set(hex, (fontCounts.get(hex) ?? 0) + 1);
  });
  const ranked = [...fontCounts.entries()]
    .map(([hex, count]) => ({ hex, count }))
    .sort((a, b) => b.count - a.count);
  const chromatic = ranked.filter((c) => colorSaturation(c.hex) > 0.15);

  const bgCounts = new Map<string, number>();
  $("body[bgcolor], table[bgcolor], td[bgcolor], tr[bgcolor]").each((_, el) => {
    const raw = ($(el).attr("bgcolor") || "").trim();
    if (!raw) return;
    const hex = parseColorToHex(raw.startsWith("#") ? raw : `#${raw}`);
    if (hex) bgCounts.set(hex, (bgCounts.get(hex) ?? 0) + 1);
  });
  const bgRanked = [...bgCounts.entries()].sort((a, b) => b[1] - a[1]);
  const lightBg = bgRanked.find(([hex]) => calculateLuminance(hex) >= 0.75);

  let foreground: string | undefined;
  const textRaw = ($("body").attr("text") || "").trim();
  if (textRaw) {
    const hex = parseColorToHex(textRaw.startsWith("#") ? textRaw : `#${textRaw}`);
    if (hex) foreground = hex;
  }

  let font: string | undefined;
  const face = ($("font[face]").first().attr("face") || "").split(",")[0].trim().replace(/^['"]+|['"]+$/g, "");
  if (face) font = sanitizeFontName(face) ?? undefined;

  return { chromatic, background: lightBg?.[0], foreground, font };
}

/**
 * Core brand tokens extraction from combined HTML and CSS.
 */
function parseBrandFromHtmlAndCss(
  html: string,
  baseUrl: URL,
  cssText: string
): ExtractedBrandData {
  const $ = cheerio.load(html);

  // 1. Favicon detection
  const faviconHref =
    $("link[rel='icon']").attr("href") ||
    $("link[rel='shortcut icon']").attr("href") ||
    $("link[rel='apple-touch-icon']").attr("href");
  const faviconUrl = resolveAssetUrl(faviconHref, baseUrl) || new URL("/favicon.ico", baseUrl).toString();

  // 2. Logo / OpenGraph image detection
  const ogImage = $("meta[property='og:image']").attr("content");
  const twitterImage = $("meta[name='twitter:image']").attr("content");
  const logoImgSrc = $("img[src*='logo'], img[alt*='logo'], [class*='logo'] img").first().attr("src");

  const logoUrl =
    resolveAssetUrl(ogImage, baseUrl) ||
    resolveAssetUrl(twitterImage, baseUrl) ||
    resolveAssetUrl(logoImgSrc, baseUrl) ||
    faviconUrl;

  // 3. Extract CSS variables
  const cssVars = extractCssVariables(cssText);

  // 4. Primary Brand Color Detection
  let primaryColor: string | undefined;
  let primarySource: BrandFieldSource = "fallback";

  // Check CSS variables prioritized by name
  const primaryKeys = [
    "primary",
    "brand",
    "main",
    "color-primary",
    "brand-color",
    "primary-color",
    "color-brand",
    "accent",
    "theme-color",
  ];
  const primaryKey = findVarBySegments(cssVars, primaryKeys);
  if (primaryKey) {
    const hex = parseColorToHex(cssVars.get(primaryKey)!);
    if (hex) {
      primaryColor = hex;
      primarySource = "cssvar";
    }
  }

  // Check meta tags: theme-color or msapplication-TileColor
  if (!primaryColor) {
    const metaThemeColor = $("meta[name='theme-color']").attr("content")?.trim();
    if (metaThemeColor) {
      const hex = parseColorToHex(metaThemeColor);
      if (hex) {
        primaryColor = hex;
        primarySource = "meta";
      }
    }
  }

  if (!primaryColor) {
    const tileColor = $("meta[name='msapplication-TileColor']").attr("content")?.trim();
    if (tileColor) {
      const hex = parseColorToHex(tileColor);
      if (hex) {
        primaryColor = hex;
        primarySource = "meta";
      }
    }
  }

  // Check primary button inline styles or class patterns
  if (!primaryColor) {
    const btnStyle = $("button[class*='primary'], a[class*='btn-primary'], .btn-primary").attr("style");
    if (btnStyle) {
      const bgMatch = btnStyle.match(/background(?:-color)?\s*:\s*([^;!]+)/i);
      if (bgMatch) {
        const hex = parseColorToHex(bgMatch[1]);
        if (hex) {
          primaryColor = hex;
          primarySource = "button";
        }
      }
    }
  }

  // Mine utility-class colors when explicit signals miss (labeled "mined")
  const mined = mineUtilityColors(cssText);
  if (!primaryColor && mined.chromatic.length > 0) {
    primaryColor = mined.chromatic[0].hex;
    primarySource = "mined";
  }

  // Pre-CSS legacy attributes when everything modern misses (labeled "mined")
  const legacy = mineLegacyAttributes($);
  if (!primaryColor && legacy.chromatic.length > 0) {
    primaryColor = legacy.chromatic[0].hex;
    primarySource = "mined";
  }

  // Honestly empty when no brand color found — never a fabricated default,
  // so unauthenticated values are distinguishable from extracted ones.
  if (!primaryColor) {
    primaryColor = "";
  }

  // 5. Secondary Color Detection
  let secondaryColor: string | undefined;
  let secondarySource: BrandFieldSource = "fallback";
  const secondaryKeys = [
    "secondary",
    "accent",
    "color-secondary",
    "secondary-color",
    "brand-secondary",
    "highlight",
  ];
  const secondaryKey = findVarBySegments(cssVars, secondaryKeys);
  if (secondaryKey) {
    const hex = parseColorToHex(cssVars.get(secondaryKey)!);
    if (hex && hex !== primaryColor) {
      secondaryColor = hex;
      secondarySource = "cssvar";
    }
  }
  if (!secondaryColor) {
    const runnerUp = mined.chromatic.find((c) => c.hex !== primaryColor);
    if (runnerUp) {
      secondaryColor = runnerUp.hex;
      secondarySource = "mined";
    } else {
      const legacyRunner = legacy.chromatic.find((c) => c.hex !== primaryColor);
      if (legacyRunner) {
        secondaryColor = legacyRunner.hex;
        secondarySource = "mined";
      }
    }
  }

  // 6. Dynamic Theme Mode & Background/Foreground Detection
  let detectedBackground: string | undefined;
  let detectedForeground: string | undefined;
  let backgroundSource: BrandFieldSource = "fallback";
  let foregroundSource: BrandFieldSource = "fallback";

  // Check CSS variables for background/foreground
  const bgKeys = ["background", "bg", "color-bg", "background-color", "surface", "surface-ground"];
  const bgKey = findVarBySegments(cssVars, bgKeys);
  if (bgKey) {
    const hex = parseColorToHex(cssVars.get(bgKey)!);
    if (hex) {
      detectedBackground = hex;
      backgroundSource = "cssvar";
    }
  }

  const fgKeys = ["foreground", "text", "color-text", "text-color", "foreground-color", "content-color"];
  const fgKey = findVarBySegments(cssVars, fgKeys);
  if (fgKey) {
    const hex = parseColorToHex(cssVars.get(fgKey)!);
    if (hex) {
      detectedForeground = hex;
      foregroundSource = "cssvar";
    }
  }

  if (!detectedBackground && mined.background) {
    detectedBackground = mined.background;
    backgroundSource = "mined";
  }
  if (!detectedBackground && legacy.background) {
    detectedBackground = legacy.background;
    backgroundSource = "mined";
  }
  if (!detectedForeground && mined.foreground) {
    detectedForeground = mined.foreground;
    foregroundSource = "mined";
  }
  if (!detectedForeground && legacy.foreground) {
    detectedForeground = legacy.foreground;
    foregroundSource = "mined";
  }

  // Detect explicit theme hints in HTML attributes
  const htmlTag = $("html");
  const bodyTag = $("body");
  const htmlClass = (htmlTag.attr("class") || "").toLowerCase();
  const bodyClass = (bodyTag.attr("class") || "").toLowerCase();
  const dataTheme = (htmlTag.attr("data-theme") || bodyTag.attr("data-theme") || htmlTag.attr("data-mode") || "").toLowerCase();
  const colorScheme = $("meta[name='color-scheme']").attr("content")?.toLowerCase() || "";

  const isExplicitDark =
    htmlClass.includes("dark") ||
    bodyClass.includes("dark") ||
    dataTheme === "dark" ||
    colorScheme.includes("dark");

  const isExplicitLight =
    htmlClass.includes("light") ||
    bodyClass.includes("light") ||
    dataTheme === "light" ||
    colorScheme.includes("light");

  let themeMode: "light" | "dark" | "auto" = "auto";

  if (detectedBackground) {
    const lum = calculateLuminance(detectedBackground);
    themeMode = lum >= 0.45 ? "light" : "dark";
  } else if (isExplicitLight) {
    themeMode = "light";
  } else if (isExplicitDark) {
    themeMode = "dark";
  } else {
    // Unknown when nothing signals it — "auto", never an assumed light.
    themeMode = "auto";
  }
  const themeSource: BrandFieldSource =
    isExplicitDark || isExplicitLight ? "explicit" : backgroundSource;

  // Harmonize background and foreground according to detected theme.
  // Empty when unextracted; derived neutrals only when the theme is known.
  const background = detectedBackground || "";
  const foreground = detectedForeground || "";
  const muted = themeMode === "auto" ? undefined : themeMode === "light" ? "#f1f5f9" : "#27272a";
  const border = themeMode === "auto" ? undefined : themeMode === "light" ? "#e2e8f0" : "#27272a";
  const card = themeMode === "auto" ? undefined : themeMode === "light" ? "#ffffff" : "#18181b";

  // 7. Typography detection
  let headingFont: string | undefined;
  let bodyFont: string | undefined;
  let fontSource: BrandFieldSource = "fallback";

  // Google Fonts link detection (explicit brand choice wins)
  const fontLinks = $("link[href*='fonts.googleapis.com']").attr("href");
  if (fontLinks) {
    const familyMatch = fontLinks.match(/family=([^&:]+)/);
    if (familyMatch && familyMatch[1]) {
      const decoded = decodeURIComponent(familyMatch[1].replace(/\+/g, " "));
      headingFont = sanitizeFontName(decoded);
      bodyFont = sanitizeFontName(decoded);
      if (headingFont) fontSource = "fontlink";
    }
  }

  // Google Fonts @import detection in CSS
  if (!headingFont) {
    const importMatch = cssText.match(/@import\s+(?:url\(['"]?)?https:\/\/fonts\.googleapis\.com\/css2?\?family=([^&'":]+)/i);
    if (importMatch && importMatch[1]) {
      const decoded = decodeURIComponent(importMatch[1].replace(/\+/g, " "));
      headingFont = sanitizeFontName(decoded);
      bodyFont = sanitizeFontName(decoded);
      if (headingFont) fontSource = "fontlink";
    }
  }

  // Full-stylesheet vote (see detectFontFromCss): reset stylesheets no longer
  // poison detection, and shipped @font-face families are preferred.
  if (!headingFont) {
    const voted = detectFontFromCss(cssText);
    if (voted) {
      headingFont = voted.name;
      bodyFont = voted.name;
      fontSource = voted.fromFontFace ? "fontface" : "mined";
    } else if (legacy.font) {
      headingFont = legacy.font;
      bodyFont = legacy.font;
      fontSource = "mined";
    }
  }

  // 8. Inferred Border Radius & Style Tone
  let radius = "";
  let radiusSource: BrandFieldSource = "fallback";
  if (cssVars.has("radius")) {
    radius = sanitizeRadius(cssVars.get("radius")) ?? "";
    if (radius) radiusSource = "cssvar";
  } else {
    // Framework-class ladder first (deliberate design tokens), then a
    // most-frequent-value vote over explicit declarations — a lone
    // `border-radius:0` must not outvote a predominantly rounded design.
    const flatCss = `${cssText} ${html}`.toLowerCase();
    if (/\brounded-full\b/.test(flatCss)) {
      radius = "9999px";
      radiusSource = "mined";
    } else if (/\brounded-none\b/.test(flatCss)) {
      radius = "0rem";
      radiusSource = "mined";
    } else if (/\brounded-(xl|2xl)\b/.test(flatCss)) {
      radius = "0.75rem";
      radiusSource = "mined";
    } else {
      const voted = voteRadius(cssText);
      if (voted) {
        radius = voted;
        radiusSource = "mined";
      }
    }
  }

  const combinedLower = (cssText + html).toLowerCase();
  let styleTone: "corporate" | "playful" | "minimal" | "technical" | "unknown" = "unknown";
  if (combinedLower.includes("mono") || combinedLower.includes("terminal") || combinedLower.includes("developer")) {
    styleTone = "technical";
  } else if (combinedLower.includes("minimal") || combinedLower.includes("clean")) {
    styleTone = "minimal";
  } else if (combinedLower.includes("fun") || combinedLower.includes("playful") || radius === "9999px") {
    styleTone = "playful";
  }

  // 9. Dynamic CSS Variables Dictionary — only extracted values are emitted.
  // Empty strings / undefined are omitted (never `--brand-primary: ;`), so an
  // absent variable is visibly absent instead of masquerading as a default.
  const cssVariables: Record<string, string> = {};
  const setVar = (key: string, val: string | undefined) => {
    if (val) cssVariables[key] = val;
  };
  setVar("--brand-primary", primaryColor);
  setVar("--brand-secondary", secondaryColor || primaryColor);
  setVar("--brand-background", background);
  setVar("--brand-foreground", foreground);
  setVar("--brand-muted", muted);
  setVar("--brand-border", border);
  setVar("--brand-card", card);
  setVar("--brand-radius", radius);
  setVar("--brand-font-heading", headingFont ? `'${headingFont}', system-ui, sans-serif` : undefined);
  setVar("--brand-font-body", bodyFont ? `'${bodyFont}', system-ui, sans-serif` : undefined);
  setVar("--brand-theme", themeMode);

  // 10. Compiled Dynamic Stylesheet (extracted declarations only)
  const rootDecls = Object.entries(cssVariables).map(([k, v]) => `${k}: ${v};`);
  const stylesheet = `
:root, [data-brand] {
  ${rootDecls.join("\n  ")}
}

.bg-brand-primary { background-color: var(--brand-primary); }
.text-brand-primary { color: var(--brand-primary); }
.border-brand-primary { border-color: var(--brand-primary); }
.bg-brand-card { background-color: var(--brand-card); }
.brand-button {
  background-color: var(--brand-primary);
  color: var(--brand-foreground);
  border-radius: var(--brand-radius);
  transition: opacity 0.2s ease;
}
.brand-button:hover { opacity: 0.9; }
`.trim();

  return {
    logoUrl,
    faviconUrl,
    tokens: {
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        background,
        foreground,
        muted,
        border,
        card,
      },
      typography: {
        headingFont,
        bodyFont,
      },
      radius,
      style: styleTone,
      theme: themeMode,
      cssVariables,
      stylesheet,
    },
    sources: {
      primary: primarySource,
      secondary: secondarySource,
      background: backgroundSource,
      foreground: foregroundSource,
      font: fontSource,
      theme: themeSource,
      radius: radiusSource,
    },
  };
}

/**
 * Extracts brand intelligence and dynamic stylesheets asynchronously, fetching external CSS if enabled.
 */
export async function extractBrandIntelligence(
  html: string,
  baseUrl: URL,
  options?: ExtractBrandOptions
): Promise<ExtractedBrandData> {
  const emit = (ev: BrandDiagEvent) => {
    try {
      options?.onStage?.(ev);
    } catch {
      // diagnostics must never break extraction
    }
  };
  const $ = cheerio.load(html);
  const inlineCss = $("style").text();

  let externalCss = "";
  if (options?.fetchExternalCss !== false) {
    const urls = extractStylesheetUrls($, baseUrl);
    emit({ type: "stylesheets-found", urls });
    if (urls.length > 0) {
      const fetched = await fetchStylesheets(urls, options?.timeoutMs, options?.maxStylesheets);
      for (const r of fetched.results) {
        emit({ type: "stylesheet-fetch", url: r.url, ok: r.ok, bytes: r.bytes, ms: r.ms, error: r.error });
      }
      externalCss = fetched.css;
    }
  }

  const combinedCss = `${inlineCss}\n${externalCss}`;
  emit({ type: "css-bytes", totalBytes: combinedCss.length, inlineBytes: inlineCss.length });
  const out = parseBrandFromHtmlAndCss(html, baseUrl, combinedCss);
  emit({ type: "primary-source", source: out.sources?.primary ?? "fallback", primary: out.tokens.colors.primary ?? "" });
  return out;
}

/**
 * Synchronous brand extraction using inline styles only (offline and unit-test friendly).
 */
export function extractBrandIntelligenceSync(
  html: string,
  baseUrl: URL
): ExtractedBrandData {
  const $ = cheerio.load(html);
  const inlineCss = $("style").text();
  return parseBrandFromHtmlAndCss(html, baseUrl, inlineCss);
}

