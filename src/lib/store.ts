"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { market, type Resolution } from "./market/engine";
import { instrument } from "./market/instruments";
import {
  decide,
  pnlFor,
  returnFor,
  type AccountKind,
  type Direction,
  type Trade,
} from "./trading";

/**
 * Client-side application state.
 *
 * This is the *simulation* of the platform's back end: balances, contract
 * placement and settlement all run in the browser so the interface can be built
 * and demonstrated with no infrastructure at all. The shape is deliberately the
 * shape the real API will have — amounts as minor-unit strings, settlement
 * driven off a price at an instant rather than the price "now" — so swapping
 * `placeTrade`/`settleDue` for network calls is a contained change.
 *
 * What is *not* simulated, and never will be: any mechanism for fabricating
 * other people's activity. See `chat.ts`.
 */

const DEMO_STARTING_BALANCE = 10_000_000n; // KES 100,000.00
const LIVE_STARTING_BALANCE = 0n;

export type ChartStyle = "candles" | "area";

export type CashKind = "DEPOSIT" | "WITHDRAWAL";
export type CashStatus = "PENDING" | "COMPLETED" | "FAILED";

/**
 * A cash movement in or out of the Live account.
 *
 * Modelled on an M-Pesa STK push: the request is created immediately in
 * `PENDING`, the customer approves on their handset, and the result lands a few
 * seconds later. The demo simulates that delay rather than crediting instantly,
 * because the pending state is a real state the UI has to handle — and every
 * payments integration that pretends otherwise breaks the first time a customer
 * is slow to type their PIN.
 */
export interface CashEvent {
  id: string;
  kind: CashKind;
  amountMinor: string;
  status: CashStatus;
  phone: string;
  /** M-Pesa-style transaction reference, issued on completion. */
  reference: string | null;
  createdAt: number;
  settledAt: number | null;
  failureReason?: string;
}

const CASH_SETTLE_DELAY_MS = 4_000;

function mpesaReference(): string {
  // Safaricom references are 10 uppercase alphanumerics, e.g. "SJ42K9L1MN".
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export interface Balances {
  DEMO: string;
  LIVE: string;
}

interface State {
  // --- Account ------------------------------------------------------------
  accountKind: AccountKind;
  balances: Balances;

  // --- Market selection ---------------------------------------------------
  symbol: string;
  resolution: Resolution;
  chartStyle: ChartStyle;

  // --- Ticket -------------------------------------------------------------
  stakeMinor: string;
  durationSec: number;

  // --- Positions ----------------------------------------------------------
  trades: Trade[];

  // --- Cash ---------------------------------------------------------------
  cashEvents: CashEvent[];

  // --- Actions ------------------------------------------------------------
  setAccountKind: (kind: AccountKind) => void;
  setSymbol: (symbol: string) => void;
  setResolution: (resolution: Resolution) => void;
  setChartStyle: (style: ChartStyle) => void;
  setStakeMinor: (minor: bigint) => void;
  setDuration: (seconds: number) => void;

  placeTrade: (direction: Direction) => { ok: true; trade: Trade } | { ok: false; reason: string };
  settleDue: () => Trade[];
  resetDemo: () => void;
  topUpDemo: (minor: bigint) => void;
  /** Clears the local session — balances, positions, preferences. */
  signOut: () => void;

  /** Raises an STK push. Resolves when the simulated handset responds. */
  requestDeposit: (amountMinor: bigint, phone: string) => Promise<CashEvent>;
  requestWithdrawal: (
    amountMinor: bigint,
    phone: string,
  ) => Promise<CashEvent> | { ok: false; reason: string };
}

function newId(): string {
  // crypto.randomUUID is unavailable on insecure origins in some browsers.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      accountKind: "DEMO",
      balances: {
        DEMO: DEMO_STARTING_BALANCE.toString(),
        LIVE: LIVE_STARTING_BALANCE.toString(),
      },

      symbol: "VOL50",
      resolution: 300,
      chartStyle: "candles",

      stakeMinor: "10000", // KES 100.00
      durationSec: 60,

      trades: [],
      cashEvents: [],

      setAccountKind: (accountKind) => set({ accountKind }),
      setSymbol: (symbol) => set({ symbol }),
      setResolution: (resolution) => set({ resolution }),
      setChartStyle: (chartStyle) => set({ chartStyle }),
      setStakeMinor: (minor) => set({ stakeMinor: minor.toString() }),
      setDuration: (durationSec) => set({ durationSec }),

      /**
       * Opens a contract.
       *
       * The entry price is read from the engine at this moment and frozen onto
       * the trade. Nothing the UI does later can change it — the same property
       * the server will enforce, modelled here so the interface is built
       * against honest mechanics from the start.
       */
      placeTrade: (direction) => {
        const state = get();
        const spec = instrument(state.symbol);
        const stake = BigInt(state.stakeMinor);
        const balance = BigInt(state.balances[state.accountKind]);

        if (stake <= 0n) return { ok: false, reason: "Enter a stake" };
        if (stake > balance) {
          return { ok: false, reason: "Insufficient balance" };
        }

        const tick = market().lastTick(state.symbol);
        if (!tick) {
          return { ok: false, reason: "No price available" };
        }

        const now = Date.now();
        const trade: Trade = {
          id: newId(),
          symbol: spec.symbol,
          displayName: spec.displayName,
          precision: spec.precision,
          direction,
          status: "OPEN",
          stakeMinor: stake.toString(),
          payoutBps: spec.payoutBps,
          openPrice: tick.mid,
          closePrice: null,
          durationSec: state.durationSec,
          openedAt: now,
          expiresAt: now + state.durationSec * 1000,
          settledAt: null,
          pnlMinor: null,
          accountKind: state.accountKind,
        };

        // The stake leaves the balance at open, exactly as it would leave the
        // account in a double-entry ledger.
        set({
          trades: [trade, ...state.trades].slice(0, 500),
          balances: {
            ...state.balances,
            [state.accountKind]: (balance - stake).toString(),
          },
        });

        return { ok: true, trade };
      },

      /**
       * Settles everything that has expired. Returns the trades just decided,
       * so the caller can raise a toast per settlement.
       *
       * Settlement reads the price *at the expiry instant*, never the price
       * now. Using "now" would mean a tab that stalled for two seconds settles
       * against a different price than one that did not — the outcome would
       * depend on the observer, which is exactly what must never be true.
       */
      settleDue: () => {
        const state = get();
        const now = Date.now();
        const engine = market();

        const due = state.trades.filter(
          (t) => t.status === "OPEN" && t.expiresAt <= now,
        );
        if (due.length === 0) return [];

        const settled: Trade[] = [];
        const credited: Record<AccountKind, bigint> = { DEMO: 0n, LIVE: 0n };

        const next = state.trades.map((trade) => {
          if (trade.status !== "OPEN" || trade.expiresAt > now) return trade;

          const closePrice = engine.priceAt(trade.symbol, trade.expiresAt);
          const stake = BigInt(trade.stakeMinor);

          // No price at the expiry instant means the outcome cannot be
          // substantiated. Void and refund — inventing a close price to settle
          // against is precisely the behaviour that makes a platform
          // untrustworthy.
          const status =
            closePrice === undefined
              ? "VOIDED"
              : decide(trade.direction, trade.openPrice, closePrice);

          const pnl = pnlFor(status, stake, trade.payoutBps);
          credited[trade.accountKind] += returnFor(
            status,
            stake,
            trade.payoutBps,
          );

          const decided: Trade = {
            ...trade,
            status,
            closePrice: closePrice ?? null,
            settledAt: now,
            pnlMinor: pnl.toString(),
          };
          settled.push(decided);
          return decided;
        });

        set({
          trades: next,
          balances: {
            DEMO: (BigInt(state.balances.DEMO) + credited.DEMO).toString(),
            LIVE: (BigInt(state.balances.LIVE) + credited.LIVE).toString(),
          },
        });

        return settled;
      },

      resetDemo: () =>
        set((state) => ({
          balances: {
            ...state.balances,
            DEMO: DEMO_STARTING_BALANCE.toString(),
          },
          trades: state.trades.filter((t) => t.accountKind !== "DEMO"),
        })),

      topUpDemo: (minor) =>
        set((state) => ({
          balances: {
            ...state.balances,
            DEMO: (BigInt(state.balances.DEMO) + minor).toString(),
          },
        })),

      signOut: () =>
        set({
          accountKind: "DEMO",
          balances: {
            DEMO: DEMO_STARTING_BALANCE.toString(),
            LIVE: LIVE_STARTING_BALANCE.toString(),
          },
          trades: [],
          cashEvents: [],
        }),

      /**
       * Simulates an M-Pesa STK push.
       *
       * The event is recorded as PENDING immediately so the UI has something to
       * render while the "handset" is being approved, then completes and credits
       * the Live balance. Only the completion touches the balance — a pending
       * deposit is not spendable, which is the whole point of the state.
       */
      requestDeposit: (amountMinor, phone) => {
        const event: CashEvent = {
          id: newId(),
          kind: "DEPOSIT",
          amountMinor: amountMinor.toString(),
          status: "PENDING",
          phone,
          reference: null,
          createdAt: Date.now(),
          settledAt: null,
        };

        set((state) => ({ cashEvents: [event, ...state.cashEvents] }));

        return new Promise<CashEvent>((resolve) => {
          setTimeout(() => {
            const completed: CashEvent = {
              ...event,
              status: "COMPLETED",
              reference: mpesaReference(),
              settledAt: Date.now(),
            };

            set((state) => ({
              cashEvents: state.cashEvents.map((e) =>
                e.id === event.id ? completed : e,
              ),
              balances: {
                ...state.balances,
                LIVE: (BigInt(state.balances.LIVE) + amountMinor).toString(),
              },
            }));

            resolve(completed);
          }, CASH_SETTLE_DELAY_MS);
        });
      },

      /**
       * Withdrawal.
       *
       * The balance is debited when the request is *raised*, not when it
       * settles. Otherwise a customer could queue several withdrawals against
       * the same funds while the first is still pending.
       */
      requestWithdrawal: (amountMinor, phone) => {
        const state = get();
        const available = BigInt(state.balances.LIVE);

        if (amountMinor <= 0n) {
          return { ok: false as const, reason: "Enter an amount" };
        }
        if (amountMinor > available) {
          return { ok: false as const, reason: "Amount exceeds your Live balance" };
        }

        const event: CashEvent = {
          id: newId(),
          kind: "WITHDRAWAL",
          amountMinor: amountMinor.toString(),
          status: "PENDING",
          phone,
          reference: null,
          createdAt: Date.now(),
          settledAt: null,
        };

        set((current) => ({
          cashEvents: [event, ...current.cashEvents],
          balances: {
            ...current.balances,
            LIVE: (BigInt(current.balances.LIVE) - amountMinor).toString(),
          },
        }));

        return new Promise<CashEvent>((resolve) => {
          setTimeout(() => {
            const completed: CashEvent = {
              ...event,
              status: "COMPLETED",
              reference: mpesaReference(),
              settledAt: Date.now(),
            };
            set((current) => ({
              cashEvents: current.cashEvents.map((e) =>
                e.id === event.id ? completed : e,
              ),
            }));
            resolve(completed);
          }, CASH_SETTLE_DELAY_MS);
        });
      },
    }),
    {
      // Bumped from v1: the persisted shape lost two preference keys and the
      // default candle interval changed, so a stale v1 blob would restore a
      // resolution the chart no longer offers.
      name: "meridian.session.v2",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

/**
 * Whether persisted state has been read yet.
 *
 * See the note on `useAuthHydrated` in `auth.ts` — a `hydrated` field set from
 * `onRehydrateStorage` cannot work with synchronous storage, because the
 * callback runs inside `create()` while the store binding is still in the
 * temporal dead zone.
 */
export function useStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (useStore.persist.hasHydrated()) setHydrated(true);
    return useStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}

/**
 * Selectors.
 *
 * `selectBalance` returns a bigint, which `Object.is` compares by value, so a
 * plain `useStore(selectBalance)` is safe.
 *
 * The two list selectors are not: `filter` allocates a new array on every call,
 * and Zustand v5 reads the selector through `useSyncExternalStore`, which
 * requires a stable snapshot. A freshly-allocated array never equals the
 * previous one, so React sees the snapshot change on every render and warns
 * about — or spins in — an infinite loop. `useShallow` compares element by
 * element instead, and the trade objects themselves are stable references.
 */
export const selectBalance = (state: State) =>
  BigInt(state.balances[state.accountKind]);

const openTradesSelector = (state: State) =>
  state.trades.filter(
    (t) => t.status === "OPEN" && t.accountKind === state.accountKind,
  );

const historySelector = (state: State) =>
  state.trades.filter(
    (t) => t.status !== "OPEN" && t.accountKind === state.accountKind,
  );

export const useOpenTrades = () => useStore(useShallow(openTradesSelector));
export const useHistory = () => useStore(useShallow(historySelector));
