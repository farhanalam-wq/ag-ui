"use client";

import * as React from "react";
import {
  ChatCircleText,
  Plus,
  Star,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuAction,
} from "@/components/ui/sidebar";

export interface ChatThread {
  id: string;
  title: string;
  category: "Today" | "Previous 7 Days";
  companyDomain?: string;
  active?: boolean;
}

const DEFAULT_CHATS: ChatThread[] = [
  {
    id: "chat-1",
    title: "Pricing tiers & API limits",
    category: "Today",
    companyDomain: "resend.com",
    active: true,
  },
  {
    id: "chat-2",
    title: "SDKs & Next.js integration",
    category: "Today",
    companyDomain: "resend.com",
  },
  {
    id: "chat-3",
    title: "Domain verification & DNS records",
    category: "Previous 7 Days",
    companyDomain: "resend.com",
  },
  {
    id: "chat-4",
    title: "Claude 3.5 Sonnet context window",
    category: "Previous 7 Days",
    companyDomain: "anthropic.com",
  },
  {
    id: "chat-5",
    title: "Enterprise OpenShift licensing",
    category: "Previous 7 Days",
    companyDomain: "redhat.com",
  },
];

interface NavChatsProps {
  onNewChat: () => void;
  activeChatId?: string;
  onSelectChat?: (chat: ChatThread) => void;
}

export function NavChats({ onNewChat, activeChatId = "chat-1", onSelectChat }: NavChatsProps) {
  const todayChats = DEFAULT_CHATS.filter((c) => c.category === "Today");
  const previousChats = DEFAULT_CHATS.filter((c) => c.category === "Previous 7 Days");

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <div className="px-2 mb-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-between px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800/80 hover:bg-zinc-800/90 text-xs font-medium text-zinc-200 hover:text-white transition-all shadow-sm group"
        >
          <div className="flex items-center gap-2">
            <Plus className="size-3.5 text-brand-primary" />
            <span>New Chat</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
            Ctrl+K
          </span>
        </button>
      </div>

      <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1">
        Today
      </SidebarGroupLabel>
      <SidebarMenu>
        {todayChats.map((chat) => (
          <SidebarMenuItem key={chat.id}>
            <SidebarMenuButton
              isActive={chat.id === activeChatId}
              onClick={() => onSelectChat?.(chat)}
              className="text-xs hover:bg-zinc-900 data-[active=true]:bg-zinc-900/90 data-[active=true]:text-zinc-100 text-zinc-400 justify-between py-1.5"
            >
              <div className="flex items-center gap-2 truncate">
                <ChatCircleText className="size-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{chat.title}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>

      <SidebarGroupLabel className="text-[10px] font-mono uppercase tracking-wider text-zinc-500 px-2 py-1 mt-3">
        Previous 7 Days
      </SidebarGroupLabel>
      <SidebarMenu>
        {previousChats.map((chat) => (
          <SidebarMenuItem key={chat.id}>
            <SidebarMenuButton
              isActive={chat.id === activeChatId}
              onClick={() => onSelectChat?.(chat)}
              className="text-xs hover:bg-zinc-900 data-[active=true]:bg-zinc-900/90 data-[active=true]:text-zinc-100 text-zinc-400 justify-between py-1.5"
            >
              <div className="flex items-center gap-2 truncate">
                <ChatCircleText className="size-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{chat.title}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
