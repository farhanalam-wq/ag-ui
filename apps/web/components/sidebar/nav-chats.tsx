"use client";

import * as React from "react";
import { Plus, CircleNotch } from "@phosphor-icons/react";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export interface ChatThread {
  id: string;
  title: string;
  category: "Today" | "Previous 7 Days";
  companyDomain?: string;
  active?: boolean;
}

interface NavChatsProps {
  onNewChat: () => void | Promise<void>;
}

export function NavChats({ onNewChat }: NavChatsProps) {
  const [isStarting, setIsStarting] = React.useState(false);

  const handleNewChat = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      await onNewChat();
    } finally {
      setTimeout(() => setIsStarting(false), 800);
    }
  };

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            tooltip={isStarting ? "Starting…" : "New Chat"}
            onClick={() => void handleNewChat()}
            disabled={isStarting}
          >
            {isStarting ? (
              <CircleNotch className="animate-spin" />
            ) : (
              <Plus />
            )}
            <span>{isStarting ? "Starting…" : "New Chat"}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  );
}
