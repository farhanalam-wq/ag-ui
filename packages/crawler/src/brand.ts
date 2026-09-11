import * as cheerio from "cheerio";
import type { BrandTokens } from "@ag-ui/contracts";

export interface ExtractedBrandData {
  logoUrl?: string;
  faviconUrl?: string;
  tokens: BrandTokens;
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
 * Extracts brand tokens (colors, logo, typography, styling) from page HTML and CSS.
 */
export function extractBrandIntelligence(html: string, baseUrl: URL): ExtractedBrandData {
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

  // 3. Primary & Secondary Colors
  // Check theme-color meta tag first
  let primaryColor = $("meta[name='theme-color']").attr("content")?.trim();
  let secondaryColor: string | undefined;

  // Search CSS variables and inline styles for color indicators
  const styleText = $("style").text();
  const hexColorRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

  if (!primaryColor) {
    // Check for --primary or --brand CSS variables
    const primaryVarMatch = styleText.match(/--(?:primary|brand|main):\s*(#[0-9a-fA-F]{3,6})/i);
    if (primaryVarMatch && primaryVarMatch[1]) {
      primaryColor = primaryVarMatch[1];
    }
  }

  const secondaryVarMatch = styleText.match(/--(?:secondary|accent):\s*(#[0-9a-fA-F]{3,6})/i);
  if (secondaryVarMatch && secondaryVarMatch[1]) {
    secondaryColor = secondaryVarMatch[1];
  }

  // Fallback to default modern blue if no explicit color found
  if (!primaryColor || !primaryColor.startsWith("#")) {
    primaryColor = "#2563eb";
  }

  // 4. Typography detection
  let headingFont: string | undefined;
  let bodyFont: string | undefined;

  // Check Google Fonts links
  const fontLinks = $("link[href*='fonts.googleapis.com']").attr("href");
  if (fontLinks) {
    const familyMatch = fontLinks.match(/family=([^&:]+)/);
    if (familyMatch && familyMatch[1]) {
      const decodedFont = decodeURIComponent(familyMatch[1].replace(/\+/g, " "));
      headingFont = decodedFont;
      bodyFont = decodedFont;
    }
  }

  // Check font-family in CSS
  if (!headingFont) {
    const fontMatch = styleText.match(/font-family:\s*['"]?([a-zA-Z0-9\s-]+)['"]?/);
    if (fontMatch && fontMatch[1]) {
      const detected = fontMatch[1].trim();
      if (!["inherit", "initial", "sans-serif", "serif"].includes(detected.toLowerCase())) {
        headingFont = detected;
        bodyFont = detected;
      }
    }
  }

  // 5. Inferred Style & Radius
  const styleStr = (styleText + html).toLowerCase();
  let radius = "0.5rem";
  if (styleStr.includes("rounded-full") || styleStr.includes("border-radius: 9999px")) {
    radius = "9999px";
  } else if (styleStr.includes("rounded-none") || styleStr.includes("border-radius: 0")) {
    radius = "0rem";
  } else if (styleStr.includes("rounded-xl") || styleStr.includes("rounded-2xl")) {
    radius = "0.75rem";
  }

  let styleTone: "corporate" | "playful" | "minimal" | "technical" = "corporate";
  if (styleStr.includes("mono") || styleStr.includes("terminal") || styleStr.includes("developer")) {
    styleTone = "technical";
  } else if (styleStr.includes("minimal") || styleStr.includes("clean")) {
    styleTone = "minimal";
  } else if (styleStr.includes("fun") || styleStr.includes("playful") || radius === "9999px") {
    styleTone = "playful";
  }

  return {
    logoUrl,
    faviconUrl,
    tokens: {
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        background: "#09090b",
        foreground: "#fafafa",
      },
      typography: {
        headingFont,
        bodyFont,
      },
      radius,
      style: styleTone,
    },
  };
}
