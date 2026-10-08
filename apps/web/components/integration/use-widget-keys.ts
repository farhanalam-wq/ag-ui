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

  const issue = useCallback(async (id: string) => {
    setPhase({ kind: "issuing" });
    try {
      const issued = await apiClient.embed.issueKey(id);
      if (cancelledRef.current) return;
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

  const rotate = useCallback(async () => {
    const keyId =
      phase.kind === "ready" || phase.kind === "existing" ? phase.keyId : null;
    if (!companyId || !keyId) return;
    setRotating(true);
    try {
      await apiClient.embed.revokeKey(keyId);
      const issued = await apiClient.embed.issueKey(companyId);
      if (cancelledRef.current) return;
      if (issued.widgetKey) {
        setPhase({ kind: "ready", raw: issued.widgetKey, keyId: issued.id, prefix: issued.keyPrefix });
      } else {
        setPhase({ kind: "existing", keyId: issued.id, prefix: issued.keyPrefix });
      }
    } catch (err: any) {
      if (!cancelledRef.current) {
        setPhase({ kind: "error", message: err.message || "Rotation failed" });
      }
    } finally {
      if (!cancelledRef.current) setRotating(false);
    }
  }, [phase, companyId]);

  const retry = useCallback(() => {
    if (companyId) issue(companyId);
  }, [companyId, issue]);

  return { phase, rotating, issue, rotate, retry };
}
