"use client";

import * as React from "react";
import { Plus, CircleNotch } from "@phosphor-icons/react";
import { SidebarGroup } from "@/components/ui/sidebar";

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
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <div className="px-2 mb-2">
        <button
          type="button"
          onClick={() => void handleNewChat()}
          disabled={isStarting}
          aria-busy={isStarting}
          className="flex w-full items-center justify-between px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-200/80 dark:hover:bg-zinc-800/90 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:text-zinc-950 dark:hover:text-white transition-all shadow-sm group disabled:opacity-60 disabled:cursor-wait"
        >
          <div className="flex items-center gap-2">
            {isStarting ? (
              <CircleNotch className="size-3.5 animate-spin text-brand-primary" />
            ) : (
              <Plus className="size-3.5 text-brand-primary" />
            )}
            <span>{isStarting ? "Starting…" : "New Chat"}</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 bg-zinc-200/80 dark:bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-300/80 dark:border-zinc-800">
            Ctrl+K
          </span>
        </button>
      </div>
    </SidebarGroup>
  );
}
