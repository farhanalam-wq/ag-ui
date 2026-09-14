"use client";

import * as React from "react";
import {
  CaretUpDown,
  User,
  CreditCard,
  Key,
  SignOut,
  Sparkle,
} from "@phosphor-icons/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

const DEFAULT_USER: UserProfile = {
  name: "Farhan Alam",
  email: "farhan@enterprise.ai",
  role: "Enterprise Admin",
};

export function NavUser({ user = DEFAULT_USER }: { user?: UserProfile }) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground hover:bg-zinc-900 transition-colors"
            >
              <Avatar className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700/60">
                <AvatarFallback className="rounded-lg bg-zinc-900 text-xs font-semibold text-zinc-300">
                  {user.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-zinc-200">
                  {user.name}
                </span>
                <span className="truncate text-xs text-zinc-500 font-mono">
                  {user.email}
                </span>
              </div>
              <CaretUpDown className="ml-auto size-4 text-zinc-400" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl p-1.5"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700/60">
                  <AvatarFallback className="rounded-lg bg-zinc-900 text-xs font-semibold text-zinc-300">
                    {user.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold text-zinc-200">
                    {user.name}
                  </span>
                  <span className="truncate text-xs text-zinc-500 font-mono">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />
            <DropdownMenuGroup>
              <DropdownMenuItem className="gap-2.5 p-2 rounded-lg text-xs cursor-pointer focus:bg-zinc-900 focus:text-zinc-100">
                <User className="size-4 text-zinc-400" />
                <span>Account Profile</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2.5 p-2 rounded-lg text-xs cursor-pointer focus:bg-zinc-900 focus:text-zinc-100">
                <Key className="size-4 text-zinc-400" />
                <span>API Keys & Credentials</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2.5 p-2 rounded-lg text-xs cursor-pointer focus:bg-zinc-900 focus:text-zinc-100">
                <CreditCard className="size-4 text-zinc-400" />
                <span>Billing & Usage</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="bg-zinc-800 my-1" />
            <DropdownMenuItem className="gap-2.5 p-2 rounded-lg text-xs cursor-pointer text-red-400 hover:text-red-300 focus:bg-red-950/40">
              <SignOut className="size-4 text-red-400" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
