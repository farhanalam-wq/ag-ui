"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleNotch } from "@phosphor-icons/react";
import { EmbedChat } from "@/components/embed/embed-chat";

/**
 * Company-keyed preview renderer. Same chat bundle as the public widget,
 * driven by company id for first-party surfaces (studio preview) with no
 * key in the URL. Mounted in an iframe only — never linked in navigation.
 */
export default function StudioPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-[100dvh] w-full items-center justify-center bg-background text-foreground antialiased">
          <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono animate-pulse">
            <CircleNotch className="size-4 animate-spin" />
            <span>Loading preview…</span>
          </div>
        </div>
      }
    >
      <StudioPreviewResolver />
    </Suspense>
  );
}

function StudioPreviewResolver() {
  const searchParams = useSearchParams();
  const companyId = searchParams.get("company") || undefined;
  if (!companyId) {
    return (
      <div className="flex flex-col h-[100dvh] w-full items-center justify-center bg-background text-foreground antialiased p-4">
        <p className="text-xs text-zinc-500 font-mono">
          No company selected.{" "}
          <Link href="/experience/widget-studio" className="underline">
            Open Widget Studio
          </Link>
        </p>
      </div>
    );
  }
  return <EmbedChat identity={{ kind: "company", companyId }} noCitations />;
}
