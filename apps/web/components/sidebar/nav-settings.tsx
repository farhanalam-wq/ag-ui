"use client";

import * as React from "react";
import {
  Sparkle,
  Gear,
  ArrowSquareOut,
  Terminal,
} from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar";

export function NavSettings() {
  return (
    <SidebarGroup className="mt-auto">
      <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1">
        Platform
      </SidebarGroupLabel>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="Explore interactive GenUI components"
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-colors"
          >
            <Sparkle className="size-4 text-brand-primary" />
            <span>GenUI Catalog</span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip="Open Elysia API Swagger & Health"
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-colors"
          >
            <a
              href="http://localhost:3001/swagger"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2"
            >
              <Terminal className="size-4 text-zinc-500" />
              <span>API Swagger</span>
              <ArrowSquareOut className="size-3 text-zinc-500 ml-auto" />
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip="System settings and retrieval thresholds"
            className="text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-zinc-900 transition-colors"
          >
            <Gear className="size-4 text-zinc-500" />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
