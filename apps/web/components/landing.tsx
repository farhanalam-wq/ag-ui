"use client";

import Link from "next/link";
import {
  ChartLineUp,
  Database,
  Robot,
  ShieldCheck,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LandingCta } from "@/components/landing-cta";

const FEATURES = [
  {
    icon: Database,
    title: "Your corpus, indexed",
    body: "Crawl domains, upload documents and enrich snapshots — every version tracked, every rollback possible.",
  },
  {
    icon: Robot,
    title: "An agent that answers",
    body: "A grounded chat widget wired to your indexed knowledge base, with fallbacks and citations you control.",
  },
  {
    icon: ChartLineUp,
    title: "Analytics on everything",
    body: "Pageviews, sessions, funnels, agent quality and voice-of-customer reports — one store, one tenant boundary.",
  },
];

export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            A
          </span>
          ag-ui
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Log in</Link>
          </Button>
          <Button size="sm" asChild>
            <Link href="/register">Create account</Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-16">
        <section className="max-w-3xl">
          <Badge variant="secondary" className="mb-6 gap-1.5">
            <ShieldCheck className="size-3.5" />
            Tenant-scoped by design
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.1]">
            Every company deserves its own{" "}
            <span className="text-brand-600 dark:text-brand-500">company AI</span>.
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            ag-ui crawls and indexes your company&apos;s knowledge base, then puts a
            grounded agent behind it — with analytics on every conversation that
            follows. Self-serve from the first click.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <LandingCta />
            <Button size="lg" variant="outline" asChild>
              <Link href="/register">Start free</Link>
            </Button>
          </div>
        </section>

        {/* Feature cards */}
        <section className="mt-20 grid gap-4 sm:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="border-border/70">
              <CardContent className="flex flex-col gap-3 pt-6">
                <feature.icon className="size-5 text-brand-600 dark:text-brand-500" weight="duotone" />
                <h2 className="text-sm font-semibold">{feature.title}</h2>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        {/* Footer */}
        <footer className="mt-20 flex items-center justify-between border-t pt-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} ag-ui</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Register
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
