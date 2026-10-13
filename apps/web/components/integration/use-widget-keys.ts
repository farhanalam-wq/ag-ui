"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/api-client";

export type WidgetKeyPhase =
  | { kind: "idle" }
  | { kind: "issuing" }
  | { kind: "ready"; raw: string; keyId: string; prefix: string }
  | { kind: "existing"; keyId: string; prefix: string }
  | { kind: "error"; message: string };

export function useWidgetKeys(companyId: string | null) {
  const [phase, setPhase] = useState<WidgetKeyPhase>(
    companyId ? { kind: "issuing" } : { kind: "idle" }
  );
  const [rotating, setRotating] = useState(false);
  const cancelledRef = useRef(false);
  // Latest-round token: only the newest issue/rotate round may commit state.
  // Stale rounds (StrictMode remounts, company switches, retries) resolve
  // silently instead of clobbering the UI. Orphaned twin rows they may leave
  // behind are reaped by rotate's self-heal below.
  const roundRef = useRef(0);

  const issue = useCallback(async (id: string) => {
    const round = ++roundRef.current;
    setPhase({ kind: "issuing" });
    try {
      const issued = await apiClient.embed.issueKey(id);
      if (cancelledRef.current || round !== roundRef.current) return;
      if (issued.widgetKey) {
        setPhase({ kind: "ready", raw: issued.widgetKey, keyId: issued.id, prefix: issued.keyPrefix });
      } else {
        setPhase({ kind: "existing", keyId: issued.id, prefix: issued.keyPrefix });
      }
    } catch (err: any) {
      if (cancelledRef.current) return;
      setPhase({ kind: "error", message: err.message || "Failed to issue widget key" });
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!companyId) {
      setPhase({ kind: "idle" });
      return;
    }
    issue(companyId);
    return () => {
      cancelledRef.current = true;
    };
  }, [companyId, issue]);

  type RotateResult = { ok: true } | { ok: false; message: string };

  const rotate = useCallback(async (): Promise<RotateResult> => {
    const firstKeyId =
      phase.kind === "ready" || phase.kind === "existing" ? phase.keyId : null;
    if (!companyId || !firstKeyId) {
      return {
        ok: false,
        message: "No widget key to rotate yet — wait for issuance to finish.",
      };
    }
    const round = ++roundRef.current;
    setRotating(true);
    try {
      // Bounded self-heal (max 2 rounds): revoke+issue can answer `existing`
      // when a leaked twin key is still live (dev double-mount orphans).
      // Revoking the survivor and issuing once more converges to one fresh
      // key, so a single press always ends holding a new raw.
      let keyId = firstKeyId;
      let lastPrefix = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await apiClient.embed.revokeKey(keyId);
        } catch (err) {
          if (!(err instanceof Error) || !/not found/i.test(err.message)) throw err;
          // Already gone (rotated elsewhere) — the desired end state.
        }
        const issued = await apiClient.embed.issueKey(companyId);
        if (issued.widgetKey) {
          if (cancelledRef.current || round !== roundRef.current) return { ok: true };
          setPhase({ kind: "ready", raw: issued.widgetKey, keyId: issued.id, prefix: issued.keyPrefix });
          return { ok: true };
        }
        keyId = issued.id;
        lastPrefix = issued.keyPrefix;
      }
      if (cancelledRef.current || round !== roundRef.current) return { ok: true };
      setPhase({ kind: "existing", keyId, prefix: lastPrefix });
      return {
        ok: false,
        message: "A leftover duplicate key survived rotation — press rotate once more.",
      };
    } catch (err: any) {
      if (cancelledRef.current || round !== roundRef.current) return { ok: true };
      const message = err?.message || "Rotation failed";
      setPhase({ kind: "error", message });
      return { ok: false, message };
    } finally {
      if (!cancelledRef.current && round === roundRef.current) setRotating(false);
    }
  }, [phase, companyId]);

  const retry = useCallback(() => {
    if (companyId) issue(companyId);
  }, [companyId, issue]);

  return { phase, rotating, issue, rotate, retry };
}
