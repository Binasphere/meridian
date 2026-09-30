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
  setTheme: (theme: Theme) => void;
  setSound: (on: boolean) => void;
}

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      theme: "dark",
      sound: true,
      setTheme: (theme) => set({ theme }),
      setSound: (sound) => set({ sound }),
    }),
    {
      name: "venti-prefs",
      version: 3,
      // v2: deposit numbers moved to the server profile.
      // v3: dark became the default; everyone starts there once, and can
      //     switch to light from the menu.
      migrate: (state) => {
        const { depositPhones: _dropped, ...rest } = (state ?? {}) as Record<string, unknown>;
        void _dropped;
        return { ...rest, theme: "dark" } as unknown as PrefsState;
      },
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/** Read outside React — the sound module checks this before every cue. */
export function soundEnabled(): boolean {
  return usePrefs.getState().sound;
}

/**
 * The number a deposit is raised against: the account's saved deposit number
 * (kept on the server profile), else its registered number.
 */
export function depositPhoneOf(
  account: { phone: string; depositPhone?: string } | null | undefined,
): string | undefined {
  return account?.depositPhone || account?.phone || undefined;
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
    meta?.setAttribute("content", theme === "light" ? "#ffffff" : "#171716");
  }, [theme]);
  return theme;
}
