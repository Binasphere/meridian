"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Viewer preferences that are not part of the trading state.
 *
 * Kept apart from `store.ts` so a change here never has to bump that store's
 * persisted version (and with it, reset anyone's demo history).
 */

export type Theme = "light" | "dark";

interface PrefsState {
  theme: Theme;
  sound: boolean;
  /**
   * The M-Pesa number each account deposits from, keyed by the account's
   * registered number. Absent means "the registered number". Withdrawals never
   * read this — they are paid to the registered number only.
   */
  depositPhones: Record<string, string>;
  setTheme: (theme: Theme) => void;
  setSound: (on: boolean) => void;
  setDepositPhone: (account: string, phone: string | null) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "light",
      sound: true,
      depositPhones: {},
      setTheme: (theme) => set({ theme }),
      setSound: (sound) => set({ sound }),
      setDepositPhone: (account, phone) =>
        set((s) => {
          const next = { ...s.depositPhones };
          if (phone && phone !== account) next[account] = phone;
          else delete next[account];
          return { depositPhones: next };
        }),
    }),
    {
      name: "venti-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Read outside React — the sound module checks this before every cue. */
export function soundEnabled(): boolean {
  return usePrefs.getState().sound;
}

/** The number a deposit is raised against, for an account. */
export function useDepositPhone(accountPhone: string | undefined): string | undefined {
  const saved = usePrefs((s) =>
    accountPhone ? s.depositPhones[accountPhone] : undefined,
  );
  return saved ?? accountPhone;
}

/**
 * Mirrors the theme onto `<html data-theme>`. The inline script in the layout
 * sets it before first paint; this keeps it in step after a toggle.
 */
export function useApplyTheme() {
  const theme = usePrefs((s) => s.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute("content", theme === "light" ? "#ffffff" : "#08090d");
  }, [theme]);
  return theme;
}
