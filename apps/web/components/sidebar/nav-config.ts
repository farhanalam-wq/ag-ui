"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  SquaresFour,
  TrayArrowDown,
  Database,
  Stack,
  Robot,
  Palette,
  Smiley,
  SlidersHorizontal,
  Play,
  Code,
  Globe,
  ChatCircleText,
  UserPlus,
  Target,
  Crosshair,
  Lightning,
  ChartBar,
  ChartLine,
  ListBullets,
  WarningCircle,
  Eye,
} from "@phosphor-icons/react";

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: Icon;
  href: string;
}

export interface SidebarNavSection {
  /** Null = label-less singleton group (Overview, Playground). */
  title: string | null;
  /** Parent icon for the collapsible group (sidebar-07 NavMain style). */
  icon?: Icon;
  items: SidebarNavItem[];
}

export const SIDEBAR_NAV: SidebarNavSection[] = [
  {
    title: null,
    items: [{ id: "overview", label: "Overview", icon: SquaresFour, href: "/" }],
  },
  {
    title: "KNOWLEDGE",
    icon: Database,
    items: [
      { id: "ingest", label: "Ingest", icon: TrayArrowDown, href: "/knowledge/ingest" },
      { id: "sources", label: "Sources", icon: Database, href: "/knowledge/sources" },
      { id: "snapshots", label: "Snapshots", icon: Stack, href: "/knowledge/snapshots" },
    ],
  },
  {
    title: "AGENTS",
    icon: Robot,
    items: [{ id: "agents", label: "Agents", icon: Robot, href: "/agents" }],
  },
  {
    title: "EXPERIENCE",
    icon: Palette,
    items: [
      { id: "appearance", label: "Appearance", icon: Palette, href: "/experience/appearance" },
      { id: "personality", label: "Personality", icon: Smiley, href: "/experience/personality" },
      { id: "behavior", label: "Behavior", icon: SlidersHorizontal, href: "/experience/behavior" },
    ],
  },
  {
    title: null,
    items: [{ id: "playground", label: "Playground", icon: Play, href: "/playground" }],
  },
  {
    title: "INTEGRATION",
    icon: Code,
    items: [
      { id: "embed-snippet", label: "Embed Snippet", icon: Code, href: "/integration/embed-snippet" },
      { id: "allowed-domains", label: "Allowed Domains", icon: Globe, href: "/integration/allowed-domains" },
    ],
  },
  {
    title: "VISITORS",
    icon: ChatCircleText,
    items: [
      { id: "conversations", label: "Conversations", icon: ChatCircleText, href: "/visitors/conversations" },
      { id: "leads", label: "Leads", icon: UserPlus, href: "/visitors/leads" },
      { id: "conversions", label: "Conversions", icon: Target, href: "/visitors/conversions" },
    ],
  },
  {
    title: "INSIGHTS",
    icon: Eye,
    items: [
      { id: "intent-radar", label: "Intent Radar", icon: Crosshair, href: "/insights/intent-radar" },
      { id: "signals", label: "Signals", icon: Lightning, href: "/insights/signals" },
      { id: "analytics", label: "Analytics", icon: ChartBar, href: "/insights/analytics" },
    ],
  },
  {
    title: "OPERATIONS",
    icon: ChartLine,
    items: [
      { id: "activity", label: "Activity", icon: ListBullets, href: "/operations/activity" },
      { id: "errors", label: "Errors", icon: WarningCircle, href: "/operations/errors" },
    ],
  },
];

/** Flat lookup: pathname href -> nav item. */
export function findNavItemByHref(pathname: string): SidebarNavItem | null {
  for (const section of SIDEBAR_NAV) {
    for (const item of section.items) {
      if (item.href === pathname) return item;
    }
  }
  return null;
}
