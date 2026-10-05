"use client";

import { CaretRight } from "@phosphor-icons/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { SIDEBAR_NAV } from "./nav-config";

interface NavMainProps {
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * sidebar-07 NavMain: singleton leaves render as direct menu buttons,
 * multi-item sections render as collapsible parents with sub-items,
 * single-item sections (e.g. AGENTS) render as a direct button under
 * their group label. KNOWLEDGE opens by default; the rest start closed.
 * Visual-only for now (no routing).
 */
export function NavMain({ activeId, onSelect }: NavMainProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {SIDEBAR_NAV.map((section) => {
          // Singleton (Overview, Playground) — direct button, no chevron.
          if (!section.title) {
            const item = section.items[0];
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  tooltip={item.label}
                  isActive={activeId === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          // Single-item section (e.g. AGENTS) — direct button, no subgroup.
          if (section.items.length === 1) {
            const item = section.items[0];
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  tooltip={item.label}
                  isActive={activeId === item.id}
                  onClick={() => onSelect(item.id)}
                >
                  <Icon />
                  <span>{item.label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          const ParentIcon = section.icon ?? section.items[0].icon;
          const containsActive = section.items.some((i) => i.id === activeId);
          return (
            <Collapsible
              key={section.title}
              asChild
              defaultOpen={section.title === "KNOWLEDGE"}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={section.title} isActive={containsActive}>
                    <ParentIcon />
                    <span className="capitalize">{section.title.toLowerCase()}</span>
                    <CaretRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                  <SidebarMenuSub>
                    {section.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={activeId === subItem.id}
                          className="w-full"
                        >
                          <button type="button" onClick={() => onSelect(subItem.id)}>
                            <span>{subItem.label}</span>
                          </button>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
