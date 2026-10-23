"use client";

/**
 * apps/web/lib/analytics.ts
 *
 * Shared client-side plumbing for the Analytics pages. Two things lived
 * copy-pasted across every page and drifted (notably the `Range` union):
 *
 *   1. the report window type, and
 *   2. the fetch lifecycle (cancel stale requests, clear data when no company
 *      is selected, re-run on inputs + refresh).
 *
 * Keeping both here means a page only declares its data shape and endpoint.
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** Canonical report window. Each page offers a subset of these in its select. */
export type Range = "7d" | "14d" | "30d" | "90d";

export interface CompanyReportState<T> {
  data: T | null;
  loading: boolean;
  loadError: string | null;
  refreshKey: number;
  setRefreshKey: Dispatch<SetStateAction<number>>;
}

/**
 * Fetch lifecycle for a company report.
 *
 * `fetcher` is deliberately not a dependency: it is a fresh closure each
 * render, so every input it reads MUST be listed in `deps`. The effect then
 * re-runs for exactly those inputs, the selected company, and Refresh clicks.
 */
export function useCompanyReport<T>(
  company: { id: string } | null,
  fetcher: (companyId: string) => Promise<T>,
  deps: readonly unknown[] = []
): CompanyReportState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!company) {
      setData(null);
      // The loading flag has to be cleared here too: the effect that was
      // running when the company was deselected never resolves, so the page
      // rendered a permanent skeleton instead of "Select a company" (F-08).
      setLoading(false);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetcher(company.id)
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id, refreshKey, ...deps]);

  return { data, loading, loadError, refreshKey, setRefreshKey };
}
