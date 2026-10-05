"use client";

import type { Icon } from "@phosphor-icons/react";
import {
  SquaresFour,
  TrayArrowDown,
  Database,
  Stack,
  Graph,
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
}

export interface SidebarNavSection {
  /** Null = label-less singleton group (Overview, Playground). */
  title: string | null;
  /** Parent icon for the collapsible group (sidebar-07 NavMain style). */
  icon?: Icon;
  items: SidebarNavItem[];
}

/**
 * Phase 1 is visual-only: every leaf uses href "#" (no routing).
 * Phase 2 will add `href` per leaf and migrate routes.
 */
export const SIDEBAR_NAV: SidebarNavSection[] = [
  {
    title: null,
    items: [{ id: "overview", label: "Overview", icon: SquaresFour }],
  },
  {
    title: "KNOWLEDGE",
    icon: Database,
    items: [
      { id: "ingest", label: "Ingest", icon: TrayArrowDown },
      { id: "sources", label: "Sources", icon: Database },
      { id: "snapshots", label: "Snapshots", icon: Stack },
      { id: "graph", label: "Graph", icon: Graph },
    ],
  },
  {
    title: "AGENTS",
    icon: Robot,
    items: [{ id: "agents", label: "Agents", icon: Robot }],
  },
  {
    title: "EXPERIENCE",
    icon: Palette,
    items: [
      { id: "appearance", label: "Appearance", icon: Palette },
      { id: "personality", label: "Personality", icon: Smiley },
      { id: "behavior", label: "Behavior", icon: SlidersHorizontal },
    ],
  },
  {
    title: null,
    items: [{ id: "playground", label: "Playground", icon: Play }],
  },
  {
    title: "INTEGRATION",
    icon: Code,
    items: [
      { id: "embed-snippet", label: "Embed Snippet", icon: Code },
      { id: "allowed-domains", label: "Allowed Domains", icon: Globe },
    ],
  },
  {
    title: "VISITORS",
    icon: ChatCircleText,
    items: [
      { id: "conversations", label: "Conversations", icon: ChatCircleText },
      { id: "leads", label: "Leads", icon: UserPlus },
      { id: "conversions", label: "Conversions", icon: Target },
    ],
  },
  {
    title: "INSIGHTS",
    icon: Eye,
    items: [
      { id: "intent-radar", label: "Intent Radar", icon: Crosshair },
      { id: "signals", label: "Signals", icon: Lightning },
      { id: "analytics", label: "Analytics", icon: ChartBar },
    ],
  },
  {
    title: "OPERATIONS",
    icon: ChartLine,
    items: [
      { id: "activity", label: "Activity", icon: ListBullets },
      { id: "errors", label: "Errors", icon: WarningCircle },
    ],
  },
];
