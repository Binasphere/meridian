"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import { market, type Resolution } from "./market/engine";
import {
  DEFAULT_SYMBOL,
  FIXED_DURATION_SEC,
  instrument,
} from "./market/instruments";
import {
  effectivePayoutBps,
  pnlFor,
  returnFor,
  settleContract,
  type AccountKind,
  type Direction,
  type LiveTier,
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

/**
 * What a single withdrawal request may be for, in minor units.
 *
 * One definition for the dialog, the simulation and the message the server's
 * `withdrawal_request` rejection is translated into — bounds that disagree
 * between the form and the rail behind it are a form that accepts amounts the
 * rail then refuses.
 */
export const MIN_WITHDRAWAL_MINOR = 50_000n; // KSh 500
export const MAX_WITHDRAWAL_MINOR = 15_000_000n; // KSh 150,000 per request

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
/**
 * Where an in-flight request has got to.
 *
 * A real STK push is not one wait, it is four: the request reaches Safaricom,
 * the prompt reaches the handset, the customer types a PIN, and the result comes
 * back on a callback. Each of those can be slow and the third can take a minute
 * if the customer is looking for their phone. Modelling them separately is what
 * lets the dialog say which one you are waiting on — and every payments
 * integration that collapses them into one spinner produces a customer who
 * cancels at four seconds because nothing appeared to be happening.
 */
export type CashStage =
  | "REQUESTING"
  | "AWAITING_CUSTOMER"
  | "CONFIRMING"
  | "SETTLED";

export const CASH_STAGE_LABEL: Record<CashStage, string> = {
  REQUESTING: "Sending request to M-Pesa",
  AWAITING_CUSTOMER: "Awaiting customer",
  CONFIRMING: "Confirming payment",
  SETTLED: "Complete",
};

export const CASH_STAGE_DETAIL: Record<CashStage, string> = {
  REQUESTING: "Contacting Safaricom.",
  AWAITING_CUSTOMER: "Check your phone and enter your M-Pesa PIN.",
  CONFIRMING: "Waiting for M-Pesa to confirm the transaction.",
  SETTLED: "Funds credited to your live account.",
};

export interface CashEvent {
  id: string;
  kind: CashKind;
  amountMinor: string;
  status: CashStatus;
  /** The step an in-flight request is on. */
  stage: CashStage;
  phone: string;
  /** M-Pesa-style transaction reference, issued on completion. */
  reference: string | null;
  createdAt: number;
  settledAt: number | null;
  failureReason?: string;
}

/** How long each simulated stage lasts. Roughly what Daraja actually feels like. */
const STAGE_DELAYS_MS: Record<"REQUESTING" | "AWAITING_CUSTOMER" | "CONFIRMING", number> = {
  REQUESTING: 1_100,
  AWAITING_CUSTOMER: 3_400,
  CONFIRMING: 1_500,
};

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
  /** The tier a Live contract trades at. Irrelevant on Demo. */
  liveTier: LiveTier;
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
  /**
   * The contract the countdown is showing.
   *
   * Set by `placeTrade`, so every entry point — the desktop ticket, the mobile
   * bar, anything added later — raises the countdown without having to remember
   * to. Cleared when the customer dismisses it or when the next contract is
   * placed.
   */
  focusTradeId: string | null;

  // --- Cash ---------------------------------------------------------------
  cashEvents: CashEvent[];

  // --- Actions ------------------------------------------------------------
  setAccountKind: (kind: AccountKind) => void;
  /**
   * Mirrors `profiles.live_tier` into the session.
   *
   * Called only by `auth.ts` when a profile is read — never by a component. The
   * tier is an entitlement the platform grants, so there is deliberately no way
   * for the interface to set it: the previous `setLiveTier` was wired to a pair
   * of buttons in the account panel, which meant any customer could award
   * themselves VIP payout terms.
   */
  syncLiveTier: (tier: LiveTier) => void;
  setSymbol: (symbol: string) => void;
  setResolution: (resolution: Resolution) => void;
  setChartStyle: (style: ChartStyle) => void;
  setStakeMinor: (minor: bigint) => void;

  placeTrade: (direction: Direction) => { ok: true; trade: Trade } | { ok: false; reason: string };
  dismissFocusTrade: () => void;
  settleDue: () => Trade[];
  resetDemo: () => void;
  topUpDemo: (minor: bigint) => void;
  /** Clears the local session — balances, positions, preferences. */
  signOut: () => void;

  /**
   * Raises an STK push.
   *
   * Returns the event id immediately and a promise that resolves when the
   * handset has responded, so the dialog can follow the request through its
   * stages instead of staring at one spinner until the whole thing is over.
   */
  requestDeposit: (
    amountMinor: bigint,
    phone: string,
  ) => { id: string; done: Promise<CashEvent> };
  requestWithdrawal: (
    amountMinor: bigint,
    phone: string,
  ) => Promise<CashEvent> | { ok: false; reason: string };

  // --- Server mirror ------------------------------------------------------
  /** Overwrites the LIVE balance and movement list with the server's truth. */
  syncServerWallet: (liveBalanceMinor: string, events: CashEvent[]) => void;
  /** Records the server row a LIVE contract was booked as. */
  setTradeServerId: (tradeId: string, serverId: string) => void;
  /** Voids a still-open trade whose server booking was refused; refunds the stake. */
  voidTradeLocal: (tradeId: string) => void;
}

function newId(): string {
  // crypto.randomUUID is unavailable on insecure origins in some browsers.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Live-account server sync
// ---------------------------------------------------------------------------

/**
 * The seam real money flows through.
 *
 * When Supabase is configured, `lib/wallet.ts` registers hooks here and the
 * store calls them for every LIVE contract: `open` books the stake against
 * `profiles.live_balance` on the server, `settle` reports the outcome. The
 * store's own balance stays the instant local mirror; the server's figure is
 * the one deposits credit and withdrawals draw on, and the hooks are what keep
 * the two telling the same story.
 *
 * Registered late (from the wallet module) rather than imported, because the
 * wallet module imports this one — a direct import each way would be a cycle.
 */
export interface LiveSyncHooks {
  open: (trade: Trade) => void;
  settle: (trade: Trade) => void;
}

let liveSync: LiveSyncHooks | null = null;

export function registerLiveSync(hooks: LiveSyncHooks): void {
  liveSync = hooks;
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      accountKind: "DEMO",
      liveTier: "STANDARD",
      balances: {
        DEMO: DEMO_STARTING_BALANCE.toString(),
        LIVE: LIVE_STARTING_BALANCE.toString(),
      },

      symbol: DEFAULT_SYMBOL,
      // 1 minute by default.
      //
      // Measured against the live feed: a 1m bar carries a wick 91% of the time
      // with a body/range of 0.69 — a real candle. At 5s the same instrument is
      // flat 62% of the time, because BTC's mid changes roughly 45 times a
      // minute in bursts, so most 5-second windows contain no price change at
      // all. 5s and 15s remain available for volatile periods; they are just a
      // poor thing to open onto.
      resolution: 60,
      chartStyle: "candles",

      stakeMinor: "10000", // KES 100.00
      durationSec: FIXED_DURATION_SEC,

      trades: [],
      focusTradeId: null,
      cashEvents: [],

      setAccountKind: (accountKind) => set({ accountKind }),
      syncLiveTier: (liveTier) => set({ liveTier }),
      setSymbol: (symbol) => set({ symbol }),
      setResolution: (resolution) => set({ resolution }),
      setChartStyle: (chartStyle) => set({ chartStyle }),
      setStakeMinor: (minor) => set({ stakeMinor: minor.toString() }),

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
          // Freeze the effective payout at placement — the VIP bonus (if any)
          // is baked into the contract here, so settlement, which reads
          // trade.payoutBps, needs no knowledge of tiers.
          payoutBps: effectivePayoutBps(
            spec.payoutBps,
            state.accountKind,
            state.liveTier,
          ),
          // The tier is frozen alongside the payout, for the same reason:
          // settlement applies the terms the contract was *placed* under, not
          // whatever tier the account happens to be on when it expires.
          tier: state.accountKind === "LIVE" ? state.liveTier : "STANDARD",
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
          focusTradeId: trade.id,
        });

        // A LIVE contract is also booked server-side, where the balance that
        // deposits credit and withdrawals draw on lives. If the server refuses
        // the stake, the hook voids this trade and refunds the mirror.
        if (trade.accountKind === "LIVE") liveSync?.open(trade);

        return { ok: true, trade };
      },

      dismissFocusTrade: () => set({ focusTradeId: null }),

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

          const marketClose = engine.priceAt(trade.symbol, trade.expiresAt);
          const stake = BigInt(trade.stakeMinor);

          // No price at the expiry instant means the outcome cannot be
          // substantiated. Void and refund — settling against a price that was
          // never observed is precisely the behaviour that makes a platform
          // untrustworthy.
          //
          // `settleContract` decides everything else: the market's own verdict
          // on Demo and Standard, the tier's terms on VIP.
          const settlement =
            marketClose === undefined
              ? null
              : settleContract(trade, marketClose);
          const status = settlement?.status ?? "VOIDED";
          const closePrice = settlement?.closePrice ?? null;

          const pnl = pnlFor(status, stake, trade.payoutBps);
          credited[trade.accountKind] += returnFor(
            status,
            stake,
            trade.payoutBps,
          );

          const decided: Trade = {
            ...trade,
            status,
            closePrice,
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

        // Report LIVE outcomes to the server ledger; the credit applied there
        // is derived from the booked stake and payout, not from this client.
        for (const trade of settled) {
          if (trade.accountKind === "LIVE") liveSync?.settle(trade);
        }

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
          // Back to the tier that grants nothing, so the next person to sign in
          // on this browser never inherits the last one's entitlements.
          liveTier: "STANDARD",
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
          stage: "REQUESTING",
          phone,
          reference: null,
          createdAt: Date.now(),
          settledAt: null,
        };

        set((state) => ({ cashEvents: [event, ...state.cashEvents] }));

        const advance = (stage: CashStage) =>
          set((state) => ({
            cashEvents: state.cashEvents.map((e) =>
              e.id === event.id ? { ...e, stage } : e,
            ),
          }));

        const wait = (ms: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, ms));

        const done = (async () => {
          await wait(STAGE_DELAYS_MS.REQUESTING);
          advance("AWAITING_CUSTOMER");

          await wait(STAGE_DELAYS_MS.AWAITING_CUSTOMER);
          advance("CONFIRMING");

          await wait(STAGE_DELAYS_MS.CONFIRMING);

          const completed: CashEvent = {
            ...event,
            status: "COMPLETED",
            stage: "SETTLED",
            reference: mpesaReference(),
            settledAt: Date.now(),
          };

          // The balance moves here and nowhere earlier: a pending deposit is
          // not spendable, which is the entire point of the pending state.
          set((state) => ({
            cashEvents: state.cashEvents.map((e) =>
              e.id === event.id ? completed : e,
            ),
            balances: {
              ...state.balances,
              LIVE: (BigInt(state.balances.LIVE) + amountMinor).toString(),
            },
          }));

          return completed;
        })();

        return { id: event.id, done };
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
        // The same bounds `withdrawal_request` enforces on the server, so the
        // unconfigured simulation refuses exactly what the real rail refuses.
        if (amountMinor < MIN_WITHDRAWAL_MINOR) {
          return { ok: false as const, reason: "Minimum withdrawal is KSh 500" };
        }
        if (amountMinor > MAX_WITHDRAWAL_MINOR) {
          return {
            ok: false as const,
            reason: "Maximum withdrawal is KSh 150,000 per request",
          };
        }
        if (amountMinor > available) {
          return { ok: false as const, reason: "Amount exceeds your Live balance" };
        }

        const event: CashEvent = {
          id: newId(),
          kind: "WITHDRAWAL",
          amountMinor: amountMinor.toString(),
          status: "PENDING",
          stage: "CONFIRMING",
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
              stage: "SETTLED",
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

      // --- Server mirror ----------------------------------------------------

      syncServerWallet: (liveBalanceMinor, events) =>
        set((state) => ({
          balances: { ...state.balances, LIVE: liveBalanceMinor },
          cashEvents: events,
        })),

      setTradeServerId: (tradeId, serverId) =>
        set((state) => ({
          trades: state.trades.map((t) =>
            t.id === tradeId ? { ...t, serverId } : t,
          ),
        })),

      /**
       * The server refused to book a LIVE contract the mirror had already
       * opened — usually because the real balance was lower than the mirrored
       * one. The trade is voided and the stake returned, the same treatment an
       * unsubstantiatable settlement gets.
       */
      voidTradeLocal: (tradeId) =>
        set((state) => {
          const trade = state.trades.find(
            (t) => t.id === tradeId && t.status === "OPEN",
          );
          if (!trade) return state;

          const stake = BigInt(trade.stakeMinor);
          return {
            trades: state.trades.map((t) =>
              t.id === tradeId
                ? {
                    ...t,
                    status: "VOIDED" as const,
                    settledAt: Date.now(),
                    pnlMinor: "0",
                  }
                : t,
            ),
            balances: {
              ...state.balances,
              [trade.accountKind]: (
                BigInt(state.balances[trade.accountKind]) + stake
              ).toString(),
            },
            focusTradeId:
              state.focusTradeId === tradeId ? null : state.focusTradeId,
          };
        }),
    }),
    {
      // Bumped from v1: the persisted shape lost two preference keys and the
      // default candle interval changed, so a stale v1 blob would restore a
      // resolution the chart no longer offers.
      // Bumped again: the candle-interval ladder changed, so a persisted v2
      // resolution (300/900/1800/3600) would restore a value the chart no
      // longer offers and the segmented control would show nothing selected.
      // v4: the catalogue is crypto-only now, so a persisted "VOL50" would
      // restore a symbol that no longer exists and `instrument()` would throw.
      // v6: contracts are fixed at 10s, so a persisted 60 would keep booking
      // minute-long trades for anyone who had used the app before; and cash
      // events gained a `stage`, which a v5 blob has no value for.
      name: "venti.session.v6",
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
