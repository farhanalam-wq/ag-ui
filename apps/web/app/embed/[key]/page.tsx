"use client";

import React, { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react";
import { EmbedChat } from "@/components/embed/embed-chat";

// No `force-dynamic` — the indexing poll is client-side fetch and the
// search-params subtree already sits behind Suspense, so the route prerenders
// a static shell and hydrates per widget key.

export default function EmbedChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-[100dvh] w-full items-center justify-center bg-background text-foreground antialiased">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono animate-pulse">
            <CircleNotch className="size-4 animate-spin" />
            <span>Loading assistant…</span>
          </div>
        </div>
      }
    >
      <EmbedRouteResolver />
    </Suspense>
  );
}

function EmbedRouteResolver() {
  const params = useParams();
  const searchParams = useSearchParams();
  const rawKey = params?.key;
  const widgetKey = Array.isArray(rawKey) ? rawKey[0] : rawKey;
  const apiBase = searchParams.get("api") || undefined;
  // Empty key preserves the in-component "Missing widget key" error card.
  return <EmbedChat identity={{ kind: "key", widgetKey: widgetKey ?? "" }} apiBase={apiBase} />;
}
