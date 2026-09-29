import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { WIDGET_KEY_PREFIX, WidgetKeyRawSchema } from "@ag-ui/contracts";

export const WIDGET_KEY_BYTES = 24;
export const WIDGET_KEY_PREFIX_LEN = 12;

export interface GeneratedWidgetKey {
  raw: string;
  hash: string;
  prefix: string;
}

function toBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** sha256 hex of the raw widget key — the only value ever persisted. */
export function hashWidgetKey(raw: string): string {
  const parsed = WidgetKeyRawSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Invalid widget key format");
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Generate a fresh opaque key: `agw_<base64url(24 bytes)>` plus its hash/prefix. */
export function generateWidgetKey(): GeneratedWidgetKey {
  const raw = `${WIDGET_KEY_PREFIX}${toBase64Url(randomBytes(WIDGET_KEY_BYTES))}`;
  return {
    raw,
    hash: createHash("sha256").update(raw, "utf8").digest("hex"),
    prefix: raw.slice(0, WIDGET_KEY_PREFIX_LEN),
  };
}

export function isWidgetKeyFormat(value: string): boolean {
  return WidgetKeyRawSchema.safeParse(value).success;
}

/** Constant-time hex comparison for stored key hashes. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
