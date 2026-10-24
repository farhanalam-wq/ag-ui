"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CaretUpDown,
  User,
  CreditCard,
  Key,
  Users,
  SignOut,
  CircleNotch,
} from "@phosphor-icons/react";
import { toast } from "sonner";
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
import { useSessionStore } from "@/stores/use-session-store";

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n[0]!)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Session menu, fed by the auth session store (A8). Shows "Signed out…"
 * while the first `me()` resolves; logging out calls the API, wipes both
 * session and tenant state, and lands on /login.
 */
export function NavUser() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const [loggingOut, setLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      toast.success("Signed out.");
      router.replace("/login");
    } catch {
      // Session revocation failed remotely — the local reset still happened,
      // but keep the user informed instead of pretending all is well.
      setLoggingOut(false);
      toast.error("Could not sign out fully. Try again.");
    }
  };

  // Unknown/unauthenticated: the shell guard redirects shortly; keep a stable
  // placeholder so the sidebar does not jump.
  const shown = user ?? { name: "…", email: "", avatarUrl: null };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {shown.avatarUrl ? (
                  <AvatarImage src={shown.avatarUrl} alt={shown.name} />
                ) : null}
                <AvatarFallback className="rounded-lg">
                  {shown.email ? initialsOf(shown.name) : "—"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {shown.name}
                </span>
                <span className="truncate text-xs">
                  {shown.email}
                </span>
              </div>
              <CaretUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg border-sidebar-border data-[state=open]:animate-menu-in"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {shown.avatarUrl ? (
                    <AvatarImage src={shown.avatarUrl} alt={shown.name} />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {shown.email ? initialsOf(shown.name) : "—"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {shown.name}
                  </span>
                  <span className="truncate text-xs">
                    {shown.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => router.push("/settings/account")}>
                <User />
                Account Profile
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => router.push("/settings/api")}>
                <Key />
                API & Webhooks
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/settings/billing")}>
                <CreditCard />
                Usage & Billing
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/settings/team")}>
                <Users />
                Team
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleLogout}
              disabled={loggingOut}
              className="text-destructive focus:text-destructive"
            >
              {loggingOut ? <CircleNotch className="size-4 animate-spin" /> : <SignOut />}
              {loggingOut ? "Signing out…" : "Log out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
