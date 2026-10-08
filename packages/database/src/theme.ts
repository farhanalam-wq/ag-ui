import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "./index";
import { brandStylesheets } from "./schema";

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
