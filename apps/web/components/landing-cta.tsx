"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/use-session-store";

/**
 * Hero CTA: guests get "Open the studio" → /login; signed-in visitors skip
 * straight to /overview. One idempotent session check reuses the shared
 * session store, so landing → dashboard stays a single round-trip.
 */
export function LandingCta() {
  const ensure = useSessionStore((s) => s.ensure);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    ensure().then((user) => {
      if (active && user) setSignedIn(true);
    });
    return () => {
      active = false;
    };
  }, [ensure]);

  return signedIn ? (
    <Button size="lg" asChild>
      <Link href="/overview">Open the studio</Link>
    </Button>
  ) : (
    <Button size="lg" asChild>
      <Link href="/login">Open the studio</Link>
    </Button>
  );
}
