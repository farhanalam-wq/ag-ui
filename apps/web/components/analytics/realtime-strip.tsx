"use client";

/**
 * The last 30 minutes, on its own clock.
 *
 * The reports move on the 15-minute rollup; this strip reads the live counter
 * and refreshes every 30s. It polls only itself — re-fetching the whole page
 * that often would burn the API for numbers that cannot change. When nobody is
 * on the site the strip renders nothing rather than a row of zeroes.
 */

import { useEffect, useState } from "react";
import { Lightning } from "@phosphor-icons/react";
import { Card, CardContent } from "@/components/ui/card";
import { apiClient, type RealtimeSnapshot } from "@/lib/api-client";

export function RealtimeStrip({
  companyId,
  intervalMs = 30_000,
}: {
  companyId: string;
  intervalMs?: number;
}) {
  const [snapshot, setSnapshot] = useState<RealtimeSnapshot | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setUpdatedAt(null);
    const tick = () => {
      apiClient.analytics
        .realtime(companyId)
        .then((next) => {
          if (cancelled) return;
          setSnapshot(next);
          setUpdatedAt(new Date().toLocaleTimeString());
        })
        .catch(() => {
          // Transient: the next tick retries and the strip keeps its values.
        });
    };
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [companyId, intervalMs]);

  if (!snapshot || (snapshot.views === 0 && snapshot.sessions === 0)) return null;

  return (
    <Card className="border-violet-500/30">
      <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium">
          <Lightning className="size-4 text-violet-500" aria-hidden="true" />
          Last 30 min
        </span>
        <span className="tabular-nums">
          <strong>{snapshot.views.toLocaleString()}</strong>{" "}
          <span className="text-muted-foreground">views</span>
        </span>
        <span className="tabular-nums">
          <strong>{snapshot.sessions.toLocaleString()}</strong>{" "}
          <span className="text-muted-foreground">sessions</span>
        </span>
        {snapshot.topPaths[0] && (
          <span className="truncate font-mono text-xs text-muted-foreground">
            Top: {snapshot.topPaths[0].path} ({snapshot.topPaths[0].views})
          </span>
        )}
        {updatedAt && (
          <span className="ml-auto text-xs tabular-nums text-muted-foreground">
            Updated {updatedAt} · refreshes every 30s
          </span>
        )}
      </CardContent>
    </Card>
  );
}
