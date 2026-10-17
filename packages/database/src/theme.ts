import { and, desc, eq, isNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  mapBrandToWidgetTheme,
  mergeThemeOverride,
  isValidOverride,
  type WidgetTheme,
  type WidgetThemeOverride,
} from "@ag-ui/shared";
import { db } from "./index";
import { brandStylesheets, brands, widgetThemeOverrides } from "./schema";

/**
 * Resolves the stylesheet id that themes a given knowledge snapshot.
 *
 * Order: snapshot-scoped READY row → floating (NULL snapshot) READY row →
 * any newest READY row. Never throws; null means "no stylesheet, use
 * neutral shell". Keeps theme following knowledge rollbacks: restoring
 * docs to v1 automatically re-themes to v1's stylesheet.
 */
export async function resolveThemeStylesheetId(
  companyId: string,
  snapshotId: string | null
): Promise<string | null> {
  try {
    if (snapshotId) {
      const [scoped] = await db
        .select({ id: brandStylesheets.id })
        .from(brandStylesheets)
        .where(
          and(
            eq(brandStylesheets.companyId, companyId),
            eq(brandStylesheets.snapshotId, snapshotId),
            eq(brandStylesheets.status, "READY")
          )
        )
        .orderBy(desc(brandStylesheets.createdAt))
        .limit(1);
      if (scoped) return scoped.id;
    }
    const [floating] = await db
      .select({ id: brandStylesheets.id })
      .from(brandStylesheets)
      .where(
        and(
          eq(brandStylesheets.companyId, companyId),
          isNull(brandStylesheets.snapshotId),
          eq(brandStylesheets.status, "READY")
        )
      )
      .orderBy(desc(brandStylesheets.createdAt))
      .limit(1);
    if (floating) return floating.id;
    const [any] = await db
      .select({ id: brandStylesheets.id })
      .from(brandStylesheets)
      .where(
        and(
          eq(brandStylesheets.companyId, companyId),
          eq(brandStylesheets.status, "READY")
        )
      )
      .orderBy(desc(brandStylesheets.createdAt))
      .limit(1);
    return any?.id ?? null;
  } catch {
    return null;
  }
}

/** Stable-key JSON so the same override always hashes identically. */
function canonicalize(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
}

/**
 * Deterministic 8-hex fingerprint of a published override. Used as the
 * override portion of the widget theme version so clients skip re-theming
 * when the effective theme has not actually changed.
 */
export function canonicalOverrideHash(override: WidgetThemeOverride): string {
  return createHash("sha256")
    .update(canonicalize(override))
    .digest("hex")
    .slice(0, 8);
}

export interface ResolvedWidgetTheme {
  theme: WidgetTheme;
  themeVersion: string | null;
}

/**
 * Resolves the effective widget theme for a company: the extracted brand
 * theme (snapshot-scoped stylesheet + observed WCAG pairs) merged with the
 * published studio override, plus a version that changes iff the effective
 * theme does. Single source of truth for the public config route, retrieval
 * (chat SSE brand event) and the studio.
 *
 * themeVersion contract:
 *  - no stylesheet, no override → null
 *  - stylesheet only            → `<stylesheetId>`   (backward compatible)
 *  - override present           → `<stylesheetId|"none">:<hash8>`
 *
 * Never throws — falls back to the neutral shell.
 */
export async function resolveCompanyWidgetTheme(
  companyId: string,
  snapshotId: string | null
): Promise<ResolvedWidgetTheme> {
  const stylesheetId = await resolveThemeStylesheetId(companyId, snapshotId);

  let wcag: unknown;
  let tokens: unknown;
  let logoUrl: unknown;
  let override: WidgetThemeOverride | null = null;
  try {
    if (stylesheetId) {
      const [sheet] = await db
        .select({ wcag: brandStylesheets.wcag })
        .from(brandStylesheets)
        .where(eq(brandStylesheets.id, stylesheetId))
        .limit(1);
      wcag = sheet?.wcag ?? undefined;
    }
    const [brand] = await db
      .select({ tokens: brands.tokens, logoUrl: brands.logoUrl })
      .from(brands)
      .where(eq(brands.companyId, companyId))
      .limit(1);
    tokens = brand?.tokens;
    logoUrl = brand?.logoUrl;
    const [row] = await db
      .select({ override: widgetThemeOverrides.override })
      .from(widgetThemeOverrides)
      .where(eq(widgetThemeOverrides.companyId, companyId))
      .limit(1);
    if (row && isValidOverride(row.override)) override = row.override;
  } catch {
    // fall through to the neutral shell below
  }

  const base = mapBrandToWidgetTheme(tokens, logoUrl, wcag);
  const theme = override ? mergeThemeOverride(base, override) : base;
  const themeVersion = override
    ? `${stylesheetId ?? "none"}:${canonicalOverrideHash(override)}`
    : stylesheetId;
  return { theme, themeVersion };
}
