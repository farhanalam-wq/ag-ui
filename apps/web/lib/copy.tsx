"use client";

import { toast } from "sonner";
import { Copy } from "@phosphor-icons/react";

/**
 * Single copy implementation for every copy action (snippets, keys, code).
 * Toast on success, fallback guidance when the Clipboard API is blocked.
 * Returns true when the clipboard write succeeded.
 */
export async function copyToClipboard(
  text: string,
  opts?: { successTitle?: string; successDescription?: string }
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(opts?.successTitle ?? "Copied to clipboard", {
      ...(opts?.successDescription ? { description: opts.successDescription } : null),
      icon: <Copy className="size-4" aria-hidden="true" />,
    });
    return true;
  } catch {
    toast.message("Copy blocked by the browser", {
      description: "Select the text manually to copy it.",
    });
    return false;
  }
}
