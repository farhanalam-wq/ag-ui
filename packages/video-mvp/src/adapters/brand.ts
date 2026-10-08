import { db, brands, companies, eq } from "@ag-ui/database";
import { contrastRatio } from "@ag-ui/shared";

export interface VideoTheme {
  primary: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  fontHeading: string;
  fontBody: string;
  radius: string;
  logoPath?: string;
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const cleanHex = (v: unknown, fb: string) =>
  typeof v === "string" && HEX.test(v.trim()) ? v.trim().toLowerCase() : fb;

const FONT_ALLOW = new Set(["inter", "roboto", "open sans", "montserrat", "poppins", "lato", "system-sans"]);
function cleanFont(v: unknown, fb: string): string {
  if (typeof v !== "string" || !v.trim()) return fb;
  const base = v.split(",")[0].trim().replace(/['"]/g, "");
  return FONT_ALLOW.has(base.toLowerCase()) ? base : fb;
}

/** DB-read only. Never runs live extraction. Brand tokens bypass the LLM straight to renderer. */
export async function resolveTheme(companyId: string): Promise<VideoTheme> {
  const [company] = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  void company;
  const [row] = await db.select().from(brands).where(eq(brands.companyId, companyId)).limit(1);
  const t: any = row?.tokens ?? {};
  const colors = t.colors ?? {};
  let theme: VideoTheme = {
    primary: cleanHex(colors.primary, "#2563eb"),
    background: cleanHex(colors.background ?? colors.surface, "#09090b"),
    surface: cleanHex(colors.background ?? colors.surface, "#09090b"),
    text: cleanHex(colors.foreground ?? colors.text, "#fafafa"),
    accent: cleanHex(colors.secondary ?? colors.accent, colors.secondary ?? "#3b82f6"),
    fontHeading: cleanFont(t.typography?.headingFont, "Inter"),
    fontBody: cleanFont(t.typography?.bodyFont, "Inter"),
    radius: typeof t.radius === "string" && t.radius ? t.radius : "0.5rem",
    ...(typeof row?.logoUrl === "string" && row.logoUrl ? { logoPath: row.logoUrl } : {}),
  };
  // Enforce WCAG AA 4.5:1 text/background — fall back to defaults, never invent.
  try {
    if (contrastRatio(theme.text, theme.background) < 4.5) {
      const darkOnLight = contrastRatio("#111111", theme.background) >= 4.5;
      const lightOnDark = contrastRatio("#fafafa", theme.background) >= 4.5;
      theme.text = darkOnLight ? "#111111" : lightOnDark ? "#fafafa" : "#fafafa";
      if (contrastRatio(theme.text, theme.background) < 4.5) theme.background = "#09090b";
    }
  } catch {
    theme.text = "#fafafa";
    theme.background = "#09090b";
  }
  return theme;
}
