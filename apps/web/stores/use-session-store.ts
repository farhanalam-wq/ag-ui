"use client";

import { create } from "zustand";
import { apiClient, type AuthUser } from "@/lib/api-client";
import { useCompanyStore } from "@/stores/use-company-store";

type SessionStatus = "unknown" | "authenticated" | "unauthenticated";

interface SessionState {
  user: AuthUser | null;
  /** `unknown` until the first `ensure()` resolves; guards against flicker. */
  status: SessionStatus;
  /**
   * Idempotent session loader: resolves the current user once (dedupes
   * concurrent callers) and caches the definitive status. Safe to call from
   * every mount point — this is the single session-check path.
   */
  ensure: () => Promise<AuthUser | null>;
  setUser: (user: AuthUser | null) => void;
  /** Revokes the API session, clears client state, and returns to /login. */
  logout: () => Promise<void>;
}

// Module-level in-flight guard so concurrent mounters share one request.
let inflight: Promise<AuthUser | null> | null = null;

export const useSessionStore = create<SessionState>()((set, get) => ({
  user: null,
  status: "unknown",
  ensure: () => {
    if (get().status !== "unknown") {
      return Promise.resolve(get().user);
    }
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const user = await apiClient.authMe();
        set({ user, status: user ? "authenticated" : "unauthenticated" });
        return user;
      } catch {
        // Network/5xx: stay unknown rather than bouncing the user to login.
        set({ status: "unauthenticated" });
        return null;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  },
  setUser: (user) =>
    set({ user, status: user ? "authenticated" : "unauthenticated" }),
  logout: async () => {
    try {
      await apiClient.authLogout();
    } catch {
      // Best effort: the cookie is cleared client-side regardless via status.
    }
    set({ user: null, status: "unauthenticated" });
    // Tenant state belongs to the dead session — wipe it so the next login
    // cannot trip over stale selectedId/companies.
    useCompanyStore.setState({ companies: [], selectedId: null, isLoading: true });
  },
}));
