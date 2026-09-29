import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { widgetKeys } from "./schema";

export interface WidgetKeyRow {
  id: string;
  companyId: string;
  keyHash: string;
  keyPrefix: string;
  label: string;
  revoked: boolean;
  createdAt: Date;
}

export async function createWidgetKeyRow(input: {
  companyId: string;
  keyHash: string;
  keyPrefix: string;
  label?: string;
}): Promise<WidgetKeyRow> {
  const [row] = await db
    .insert(widgetKeys)
    .values({
      companyId: input.companyId,
      keyHash: input.keyHash,
      keyPrefix: input.keyPrefix,
      label: input.label?.slice(0, 64) || "default",
    })
    .returning();
  return row as WidgetKeyRow;
}

export async function findActiveKeyByLabel(
  companyId: string,
  label: string
): Promise<WidgetKeyRow | null> {
  const [row] = await db
    .select()
    .from(widgetKeys)
    .where(
      and(
        eq(widgetKeys.companyId, companyId),
        eq(widgetKeys.label, label),
        eq(widgetKeys.revoked, false)
      )
    )
    .orderBy(desc(widgetKeys.createdAt))
    .limit(1);
  return (row as WidgetKeyRow) ?? null;
}

export async function resolveWidgetKeyByHash(keyHash: string): Promise<WidgetKeyRow | null> {
  const [row] = await db
    .select()
    .from(widgetKeys)
    .where(eq(widgetKeys.keyHash, keyHash))
    .limit(1);
  return (row as WidgetKeyRow) ?? null;
}

export async function listKeysByCompany(companyId: string): Promise<
  Pick<WidgetKeyRow, "id" | "keyPrefix" | "label" | "revoked" | "createdAt">[]
> {
  const rows = await db
    .select({
      id: widgetKeys.id,
      keyPrefix: widgetKeys.keyPrefix,
      label: widgetKeys.label,
      revoked: widgetKeys.revoked,
      createdAt: widgetKeys.createdAt,
    })
    .from(widgetKeys)
    .where(eq(widgetKeys.companyId, companyId))
    .orderBy(desc(widgetKeys.createdAt));
  return rows;
}

export async function revokeWidgetKey(id: string): Promise<WidgetKeyRow | null> {
  const [row] = await db
    .update(widgetKeys)
    .set({ revoked: true, updatedAt: new Date() })
    .where(eq(widgetKeys.id, id))
    .returning();
  return (row as WidgetKeyRow) ?? null;
}
