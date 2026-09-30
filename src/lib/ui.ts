"use client";

import { create } from "zustand";

/**
 * Which overlay is open.
 *
 * The drawer, the markets list and the money dialogs are each reachable from
 * several places — the header, the drawer, the bottom tabs, the account pages —
 * so their open state lives here rather than in whichever component happened to
 * own the button. Not persisted: a reload closes everything.
 */
interface UiState {
  drawerOpen: boolean;
  marketsOpen: boolean;
  cash: "deposit" | "withdraw" | null;
  depositNumberOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  setMarketsOpen: (open: boolean) => void;
  setCash: (mode: "deposit" | "withdraw" | null) => void;
  setDepositNumberOpen: (open: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  drawerOpen: false,
  marketsOpen: false,
  cash: null,
  depositNumberOpen: false,
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setMarketsOpen: (marketsOpen) => set({ marketsOpen }),
  setCash: (cash) => set({ cash }),
  setDepositNumberOpen: (depositNumberOpen) => set({ depositNumberOpen }),
}));
