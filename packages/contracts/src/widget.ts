import { z } from "zod";

/**
 * Opaque public widget key contract.
 * Raw keys look like `agw_<base64url(24 bytes)>` and embed zero company info.
 * Only `key_hash = sha256(raw)` is ever persisted — the raw is shown once at issue time.
 */

export const WIDGET_KEY_PREFIX = "agw_" as const;

export const WidgetKeyRawSchema = z
  .string()
  .regex(/^agw_[A-Za-z0-9_-]{32,}$/, "Invalid widget key format");

export type WidgetKeyRaw = z.infer<typeof WidgetKeyRawSchema>;

export const CreateWidgetKeyInputSchema = z.object({
  companyId: z.string().uuid(),
  label: z.string().min(1).max(64).optional(),
});

export type CreateWidgetKeyInput = z.infer<typeof CreateWidgetKeyInputSchema>;

export const WidgetKeyMetaSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  keyPrefix: z.string(),
  label: z.string(),
  revoked: z.boolean(),
  createdAt: z.date(),
});

export type WidgetKeyMeta = z.infer<typeof WidgetKeyMetaSchema>;
