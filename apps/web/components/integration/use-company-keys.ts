"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, type WidgetKeyListItem } from "@/lib/api-client";

export function useCompanyKeys(companyId: string | null) {
  const [keys, setKeys] = useState<WidgetKeyListItem[]>([]);
  const [loading, setLoading] = useState(!!companyId);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const load = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const list = await apiClient.embed.listKeys(id);
      if (cancelledRef.current) return;
      setKeys(list);
    } catch (err: any) {
      if (cancelledRef.current) return;
      setError(err.message || "Failed to list widget keys");
    } finally {
      if (!cancelledRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    if (!companyId) {
      setKeys([]);
      setLoading(false);
      return;
    }
    load(companyId);
    return () => {
      cancelledRef.current = true;
    };
  }, [companyId, load]);

  return { keys, loading, error, reload: () => companyId && load(companyId) };
}
