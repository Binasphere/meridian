"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { AuthScreen } from "./AuthScreen";

/**
 * The sign-in gate.
 *
 * An anonymous visitor lands straight in the terminal on the demo account —
 * authentication is not a wall, it is a door that specific actions knock on:
 * switching to the Live account, depositing, opening the account panel. Each
 * of those calls `show()`, and this overlay presents the ordinary AuthScreen
 * over the terminal instead of navigating away from it.
 *
 * The gate dismisses itself the moment a session exists, so signing in lands
 * the visitor back on exactly what they were doing — and the close button
 * lets a visitor who only wanted to look decline without losing the terminal.
 */

interface AuthGateState {
  open: boolean;
  show: () => void;
  hide: () => void;
}

export const useAuthGate = create<AuthGateState>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}));

export function SignInGate() {
  const open = useAuthGate((s) => s.open);
  const hide = useAuthGate((s) => s.hide);
  const currentPhone = useAuth((s) => s.currentPhone);

  // Signing in is the gate's whole purpose; the moment it happens, get out of
  // the way rather than leaving a stale form over a live session.
  useEffect(() => {
    if (currentPhone) hide();
  }, [currentPhone, hide]);

  if (!open || currentPhone) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-base">
      <AuthScreen />
      <button
        onClick={hide}
        aria-label="Back to terminal"
        className="absolute right-3 top-3 grid h-9 w-9 place-items-center border border-line bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
