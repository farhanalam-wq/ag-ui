"use client";

import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChatCircleText,
  CreditCard,
  Crosshair,
  Globe,
  Hammer,
  Key,
  Lightning,
  ListBullets,
  Robot,
  SlidersHorizontal,
  Smiley,
  Target,
  User,
  UserPlus,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";

/**
 * Icon names accepted by `<ComingSoon>`.
 *
 * Deliberately a string (not a Phosphor component) so server-component routes
 * can render the placeholder without crossing a non-serializable value over the
 * server → client boundary. The actual Phosphor imports stay in this client
 * module.
 */
export const COMING_SOON_ICONS = {
  robot: Robot,
  target: Target,
  crosshair: Crosshair,
  globe: Globe,
  "sliders-horizontal": SlidersHorizontal,
  smiley: Smiley,
  lightning: Lightning,
  "list-bullets": ListBullets,
  "warning-circle": WarningCircle,
  user: User,
  key: Key,
  "credit-card": CreditCard,
  users: Users,
  "chat-circle-text": ChatCircleText,
  "user-plus": UserPlus,
} as const;

export type ComingSoonIcon = keyof typeof COMING_SOON_ICONS;

interface ComingSoonProps {
  title: string;
  /** Optional one-liner describing planned content. Falls back to generic copy. */
  description?: string;
  /** Serializable icon name; see {@link COMING_SOON_ICONS}. Defaults to a hammer. */
  icon?: ComingSoonIcon;
  /** Where the back button navigates. Defaults to "/" (Overview). */
  backHref?: string;
  /** Label for the back button. Defaults to "Back to Overview". */
  backLabel?: string;
}

/**
 * Reusable placeholder for sidebar sections that have no backend UI yet.
 * Rendered inside every not-ready route; per-leaf blurbs can land via
 * `description` later without touching this component.
 */
export function ComingSoon({ title, description, icon, backHref = "/", backLabel = "Back to Overview" }: ComingSoonProps) {
  const router = useRouter();
  const Icon = icon ? COMING_SOON_ICONS[icon] : Hammer;

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent">
          <Icon className="size-6 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <span className="inline-block rounded-full border border-sidebar-border bg-sidebar-accent px-2.5 py-0.5 text-[11px] font-sans uppercase tracking-wider text-muted-foreground">
            Coming soon
          </span>
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description ?? "We're building this section — check back soon."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-sidebar-border bg-sidebar-accent hover:bg-sidebar-accent/70 text-sm font-medium transition-colors"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </button>
      </div>
    </div>
  );
}
