import * as cheerio from "cheerio";
import type { BrandTokens } from "@ag-ui/contracts";
import { validateSafeUrl } from "./ssrf";

export interface ExtractedBrandData {
  logoUrl?: string;
  faviconUrl?: string;
  tokens: BrandTokens;
}

export interface ExtractBrandOptions {
  fetchExternalCss?: boolean;
  maxStylesheets?: number;
  timeoutMs?: number;
}

/**
 * Resolves a potentially relative URL against the base page URL.
 */
function resolveAssetUrl(raw: string | undefined, baseUrl: URL): string | undefined {
  if (!raw) return undefined;
  try {
    return new URL(raw, baseUrl).toString();
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

  return null;
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
 */
async function fetchStylesheets(urls: string[], timeoutMs = 3500, maxSheets = 4): Promise<string> {
  const targetUrls = urls.slice(0, maxSheets);
  if (targetUrls.length === 0) return "";

  const results = await Promise.allSettled(
    targetUrls.map(async (urlStr) => {
      await validateSafeUrl(urlStr);
      const res = await fetch(urlStr, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ag-ui-crawler/1.0",
          Accept: "text/css,*/*;q=0.1",
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!res.ok) return "";
      const text = await res.text();
      // Cap at 500KB per stylesheet to avoid memory bloat
      return text.slice(0, 500 * 1024);
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value)
    .join("\n");
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
  for (const [key, val] of vars.entries()) {
    const aliasMatch = val.match(/^var\(\s*--([a-zA-Z0-9_-]+)\s*\)$/i);
    if (aliasMatch) {
      const target = aliasMatch[1].toLowerCase();
      if (vars.has(target)) {
        vars.set(key, vars.get(target)!);
      }
    }
  }

  return vars;
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
  for (const k of primaryKeys) {
    if (cssVars.has(k)) {
      const hex = parseColorToHex(cssVars.get(k)!);
      if (hex) {
        primaryColor = hex;
        break;
      }
    }
  }

  // Check meta tags: theme-color or msapplication-TileColor
  if (!primaryColor) {
    const metaThemeColor = $("meta[name='theme-color']").attr("content")?.trim();
    if (metaThemeColor) {
      const hex = parseColorToHex(metaThemeColor);
      if (hex) primaryColor = hex;
    }
  }

  if (!primaryColor) {
    const tileColor = $("meta[name='msapplication-TileColor']").attr("content")?.trim();
    if (tileColor) {
      const hex = parseColorToHex(tileColor);
      if (hex) primaryColor = hex;
    }
  }

  // Check primary button inline styles or class patterns
  if (!primaryColor) {
    const btnStyle = $("button[class*='primary'], a[class*='btn-primary'], .btn-primary").attr("style");
    if (btnStyle) {
      const bgMatch = btnStyle.match(/background(?:-color)?\s*:\s*([^;!]+)/i);
      if (bgMatch) {
        const hex = parseColorToHex(bgMatch[1]);
        if (hex) primaryColor = hex;
      }
    }
  }

  // Fallback to modern vibrant blue if no brand color found
  if (!primaryColor) {
    primaryColor = "#2563eb";
  }

  // 5. Secondary Color Detection
  let secondaryColor: string | undefined;
  const secondaryKeys = [
    "secondary",
    "accent",
    "color-secondary",
    "secondary-color",
    "brand-secondary",
    "highlight",
  ];
  for (const k of secondaryKeys) {
    if (cssVars.has(k)) {
      const hex = parseColorToHex(cssVars.get(k)!);
      if (hex && hex !== primaryColor) {
        secondaryColor = hex;
        break;
      }
    }
  }

  // 6. Dynamic Theme Mode & Background/Foreground Detection
  let detectedBackground: string | undefined;
  let detectedForeground: string | undefined;

  // Check CSS variables for background/foreground
  const bgKeys = ["background", "bg", "color-bg", "background-color", "surface", "surface-ground"];
  for (const k of bgKeys) {
    if (cssVars.has(k)) {
      const hex = parseColorToHex(cssVars.get(k)!);
      if (hex) {
        detectedBackground = hex;
        break;
      }
    }
  }

  const fgKeys = ["foreground", "text", "color-text", "text-color", "foreground-color", "content-color"];
  for (const k of fgKeys) {
    if (cssVars.has(k)) {
      const hex = parseColorToHex(cssVars.get(k)!);
      if (hex) {
        detectedForeground = hex;
        break;
      }
    }
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

  let themeMode: "light" | "dark" = "light";

  if (detectedBackground) {
    const lum = calculateLuminance(detectedBackground);
    themeMode = lum >= 0.45 ? "light" : "dark";
  } else if (isExplicitLight) {
    themeMode = "light";
  } else if (isExplicitDark) {
    themeMode = "dark";
  } else {
    // Default to light for public web documentation / websites
    themeMode = "light";
  }

  // Harmonize background and foreground according to detected theme
  const background = detectedBackground || (themeMode === "light" ? "#ffffff" : "#09090b");
  const foreground = detectedForeground || (themeMode === "light" ? "#09090b" : "#fafafa");
  const muted = themeMode === "light" ? "#f1f5f9" : "#27272a";
  const border = themeMode === "light" ? "#e2e8f0" : "#27272a";
  const card = themeMode === "light" ? "#ffffff" : "#18181b";

  // 7. Typography detection
  let headingFont: string | undefined;
  let bodyFont: string | undefined;

  // Google Fonts link detection
  const fontLinks = $("link[href*='fonts.googleapis.com']").attr("href");
  if (fontLinks) {
    const familyMatch = fontLinks.match(/family=([^&:]+)/);
    if (familyMatch && familyMatch[1]) {
      const decoded = decodeURIComponent(familyMatch[1].replace(/\+/g, " "));
      headingFont = decoded;
      bodyFont = decoded;
    }
  }

  // Google Fonts @import detection in CSS
  if (!headingFont) {
    const importMatch = cssText.match(/@import\s+(?:url\(['"]?)?https:\/\/fonts\.googleapis\.com\/css2?\?family=([^&'":]+)/i);
    if (importMatch && importMatch[1]) {
      const decoded = decodeURIComponent(importMatch[1].replace(/\+/g, " "));
      headingFont = decoded;
      bodyFont = decoded;
    }
  }

  // CSS font-family detection
  if (!headingFont) {
    const fontMatch = cssText.match(/font-family:\s*['"]?([a-zA-Z0-9\s-]+)['"]?/i);
    if (fontMatch && fontMatch[1]) {
      const detected = fontMatch[1].trim();
      if (!["inherit", "initial", "sans-serif", "serif", "monospace"].includes(detected.toLowerCase())) {
        headingFont = detected;
        bodyFont = detected;
      }
    }
  }

  // 8. Inferred Border Radius & Style Tone
  let radius = "0.5rem";
  if (cssVars.has("radius")) {
    radius = cssVars.get("radius")!;
  } else {
    const combinedStr = (cssText + html).toLowerCase();
    if (combinedStr.includes("rounded-full") || combinedStr.includes("border-radius: 9999px")) {
      radius = "9999px";
    } else if (combinedStr.includes("rounded-none") || combinedStr.includes("border-radius: 0")) {
      radius = "0rem";
    } else if (combinedStr.includes("rounded-xl") || combinedStr.includes("rounded-2xl")) {
      radius = "0.75rem";
    }
  }

  const combinedLower = (cssText + html).toLowerCase();
  let styleTone: "corporate" | "playful" | "minimal" | "technical" = "corporate";
  if (combinedLower.includes("mono") || combinedLower.includes("terminal") || combinedLower.includes("developer")) {
    styleTone = "technical";
  } else if (combinedLower.includes("minimal") || combinedLower.includes("clean")) {
    styleTone = "minimal";
  } else if (combinedLower.includes("fun") || combinedLower.includes("playful") || radius === "9999px") {
    styleTone = "playful";
  }

  // 9. Dynamic CSS Variables Dictionary
  const cssVariables: Record<string, string> = {
    "--brand-primary": primaryColor,
    "--brand-secondary": secondaryColor || primaryColor,
    "--brand-background": background,
    "--brand-foreground": foreground,
    "--brand-muted": muted,
    "--brand-border": border,
    "--brand-card": card,
    "--brand-radius": radius,
    "--brand-font-heading": headingFont ? `'${headingFont}', system-ui, sans-serif` : "system-ui, sans-serif",
    "--brand-font-body": bodyFont ? `'${bodyFont}', system-ui, sans-serif` : "system-ui, sans-serif",
    "--brand-theme": themeMode,
  };

  // 10. Compiled Dynamic Stylesheet
  const stylesheet = `
:root, [data-brand] {
  --brand-primary: ${primaryColor};
  --brand-secondary: ${secondaryColor || primaryColor};
  --brand-background: ${background};
  --brand-foreground: ${foreground};
  --brand-muted: ${muted};
  --brand-border: ${border};
  --brand-card: ${card};
  --brand-radius: ${radius};
  --brand-font-heading: ${headingFont ? `'${headingFont}', system-ui, sans-serif` : "system-ui, sans-serif"};
  --brand-font-body: ${bodyFont ? `'${bodyFont}', system-ui, sans-serif` : "system-ui, sans-serif"};
  --brand-theme: ${themeMode};
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
  const $ = cheerio.load(html);
  const inlineCss = $("style").text();

  let externalCss = "";
  if (options?.fetchExternalCss !== false) {
    const urls = extractStylesheetUrls($, baseUrl);
    if (urls.length > 0) {
      externalCss = await fetchStylesheets(urls, options?.timeoutMs, options?.maxStylesheets);
    }
  }

  const combinedCss = `${inlineCss}\n${externalCss}`;
  return parseBrandFromHtmlAndCss(html, baseUrl, combinedCss);
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

