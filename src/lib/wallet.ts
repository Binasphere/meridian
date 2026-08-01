"use client";

import { toast } from "sonner";
import { BACKEND_ORIGIN } from "./backend";
import { instrumentOrDefault } from "./market/instruments";
import { supabase } from "./supabase/client";
import {
  registerLiveSync,
  useStore,
  type CashEvent,
  type CashStage,
} from "./store";
import type { Trade } from "./trading";

/**
 * The live wallet, when Supabase is configured.
 *
 * `store.ts` keeps the instant, client-side view of balances so the terminal
 * stays responsive; this module is what keeps that view honest. The server's
 * `profiles.live_balance` is the balance — it is what deposits credit, what
 * withdrawal requests draw on, and what the admin console shows — so every
 * real movement goes through here and the store is re-synced from the server
 * afterwards.
 *
 * When Supabase is not configured, none of this runs and the store's built-in
 * simulation carries the demo, exactly as before.
 */

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface CashRow {
  id: string;
  kind: "DEPOSIT" | "WITHDRAWAL";
  amount_minor: number | string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  phone: string;
  reference: string | null;
  checkout_id: string | null;
  failure_reason: string | null;
  created_at: string;
  settled_at: string | null;
}

function stageFor(row: CashRow): CashStage {
  if (row.status !== "PENDING") return "SETTLED";
  if (row.kind === "WITHDRAWAL") return "CONFIRMING";
  // A deposit with a checkout id has reached the handset; before that we are
  // still raising the push.
  return row.checkout_id ? "AWAITING_CUSTOMER" : "REQUESTING";
}

function toCashEvent(row: CashRow): CashEvent {
  return {
    id: row.id,
    kind: row.kind,
    amountMinor: String(row.amount_minor),
    status: row.status,
    stage: stageFor(row),
    phone: row.phone,
    reference: row.reference,
    createdAt: Date.parse(row.created_at),
    settledAt: row.settled_at ? Date.parse(row.settled_at) : null,
    failureReason: row.failure_reason ?? undefined,
  };
}

const CASH_COLUMNS =
  "id, kind, amount_minor, status, phone, reference, checkout_id, failure_reason, created_at, settled_at";

// ---------------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------------

/** Whether money is real here: Supabase configured, server wallet in charge. */
export function serverWalletActive(): boolean {
  return supabase() !== null;
}

/**
 * Re-reads the live balance and movement history for the signed-in user and
 * mirrors them into the store. RLS scopes both queries to the caller, which is
 * why neither needs a `where`.
 */
export async function refreshWallet(): Promise<void> {
  const db = supabase();
  if (!db) return;

  const [{ data: profile }, { data: rows }] = await Promise.all([
    db.from("profiles").select("live_balance").maybeSingle(),
    db
      .from("cash_events")
      .select(CASH_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  // No row means no session; leave the store to its signed-out state.
  if (!profile) return;

  useStore
    .getState()
    .syncServerWallet(
      String(profile.live_balance ?? 0),
      ((rows ?? []) as CashRow[]).map(toCashEvent),
    );
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

const DEPOSIT_POLL_MS = 2_500;
const DEPOSIT_DEADLINE_MS = 120_000;

/**
 * Raises a real STK push and follows it to settlement.
 *
 * `onStage` drives the dialog's step display. Resolves with the settled event,
 * or with `timedOut: true` when the customer has not acted within two minutes
 * — the deposit is still live server-side and lands whenever the callback
 * does, so a timeout is "you can close this", not a failure. Rejects when the
 * push could not be raised or M-Pesa reported failure.
 */
export async function startServerDeposit(
  amountMinor: bigint,
  onStage: (stage: CashStage) => void,
): Promise<{ event: CashEvent; timedOut: boolean }> {
  const db = supabase();
  if (!db) throw new Error("Deposits are unavailable");

  const { data: sessionData } = await db.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in to deposit");

  onStage("REQUESTING");

  const response = await fetch(`${BACKEND_ORIGIN}/api/payments/deposit`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ amountMinor: amountMinor.toString() }),
  });

  const body = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: string;
  };
  if (!response.ok || !body.id) {
    throw new Error(body.error ?? "Could not start the deposit");
  }

  onStage("AWAITING_CUSTOMER");

  const deadline = Date.now() + DEPOSIT_DEADLINE_MS;
  let last: CashRow | null = null;

  while (Date.now() < deadline) {
    await wait(DEPOSIT_POLL_MS);

    const { data } = await db
      .from("cash_events")
      .select(CASH_COLUMNS)
      .eq("id", body.id)
      .maybeSingle();
    if (!data) continue;

    last = data as CashRow;
    if (last.status === "COMPLETED") {
      onStage("SETTLED");
      await refreshWallet();
      return { event: toCashEvent(last), timedOut: false };
    }
    if (last.status === "FAILED") {
      await refreshWallet();
      throw new Error(last.failure_reason ?? "Payment failed");
    }
  }

  await refreshWallet();
  if (!last) throw new Error("Could not confirm the deposit");
  return { event: toCashEvent(last), timedOut: true };
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

/**
 * Raises a withdrawal request.
 *
 * The RPC debits the balance and books the PENDING event atomically; what
 * comes back here is a request sitting in the admin's queue. Paying it is a
 * human action — an admin sends the money via M-Pesa and confirms with the
 * reference — so the event stays PENDING until then.
 */
export async function startServerWithdrawal(
  amountMinor: bigint,
): Promise<CashEvent> {
  const db = supabase();
  if (!db) throw new Error("Withdrawals are unavailable");

  const { data, error } = await db.rpc("withdrawal_request", {
    p_amount: Number(amountMinor),
  });

  if (error || typeof data !== "string") {
    const message = error?.message ?? "";
    if (message.includes("INSUFFICIENT_FUNDS")) {
      throw new Error("Amount exceeds your Live balance");
    }
    if (message.includes("AMOUNT_TOO_LARGE")) {
      throw new Error("Maximum withdrawal is KSh 150,000 per request");
    }
    if (message.includes("BAD_AMOUNT")) {
      throw new Error("Minimum withdrawal is KSh 100");
    }
    if (message.includes("NOT_SIGNED_IN")) {
      throw new Error("Sign in to withdraw");
    }
    throw new Error("Could not submit the request");
  }

  await refreshWallet();

  const { data: row } = await db
    .from("cash_events")
    .select(CASH_COLUMNS)
    .eq("id", data)
    .maybeSingle();

  return row
    ? toCashEvent(row as CashRow)
    : {
        id: data,
        kind: "WITHDRAWAL",
        amountMinor: amountMinor.toString(),
        status: "PENDING",
        stage: "CONFIRMING",
        phone: "",
        reference: null,
        createdAt: Date.now(),
        settledAt: null,
      };
}

// ---------------------------------------------------------------------------
// Live contracts
// ---------------------------------------------------------------------------

/**
 * Booking in flight: local trade id → the server id it resolves to (or null
 * when the booking was refused). Settlement awaits this, so a 10-second
 * contract that settles before its booking round-trip finishes still settles
 * the right server row.
 */
const bookings = new Map<string, Promise<string | null>>();

function openLive(trade: Trade): void {
  const db = supabase();
  if (!db) return;

  const booking = (async (): Promise<string | null> => {
    const book = (payoutBps: number) =>
      db.rpc("live_trade_open", {
        p_symbol: trade.symbol,
        p_direction: trade.direction,
        p_stake: Number(BigInt(trade.stakeMinor)),
        p_payout_bps: payoutBps,
        p_open_price: trade.openPrice,
        p_duration: trade.durationSec,
      });

    let { data, error } = await book(trade.payoutBps);

    // --- The payout-ceiling fallback ---------------------------------------
    //
    // `live_trade_open` refuses any rate above its own ceiling, and that
    // ceiling lives in the database rather than in this build. A deploy that
    // raises the VIP rate before the migration is applied would otherwise
    // have every VIP contract refused and refunded — the customer watching
    // contracts vanish as they place them.
    //
    // So a BAD_PAYOUT is treated as "this database is older than this build"
    // rather than as a failure: the contract is re-booked at the instrument's
    // own rate, which no ceiling this schema has ever had would reject. The
    // customer trades. Once the migration lands, the first call succeeds and
    // this branch stops being reached — no redeploy, no edit.
    if (error && /BAD_PAYOUT/.test(error.message)) {
      const base = instrumentOrDefault(trade.symbol).payoutBps;
      console.warn(
        `[wallet] server refused ${trade.payoutBps} bps; the payout ceiling in ` +
          `live_trade_open is behind this build. Re-booking at ${base} bps. ` +
          `Run the go-live migration to restore the full rate.`,
      );
      ({ data, error } = await book(base));

      // The mirror must promise what was actually booked. The server credits
      // from its own row at settlement, so a local trade still claiming the
      // higher rate would show a win larger than the balance it produced.
      if (!error) useStore.getState().setTradePayoutBps(trade.id, base);
    }

    if (error || typeof data !== "string") {
      // The server refused the stake, so the local trade must not stand.
      useStore.getState().voidTradeLocal(trade.id);
      toast.error(
        error?.message.includes("INSUFFICIENT_FUNDS")
          ? "Insufficient live balance — contract voided"
          : "Contract could not be booked — stake refunded",
      );
      void refreshWallet();
      return null;
    }

    useStore.getState().setTradeServerId(trade.id, data);
    return data;
  })();

  bookings.set(trade.id, booking);
}

function settleLive(trade: Trade): void {
  const db = supabase();
  if (!db) return;

  void (async () => {
    const serverId =
      trade.serverId ?? (await bookings.get(trade.id)) ?? null;
    bookings.delete(trade.id);
    if (!serverId) return;

    await db.rpc("live_trade_settle", {
      p_trade: serverId,
      p_status: trade.status,
      p_close_price: trade.closePrice,
    });
    void refreshWallet();
  })();
}

// Wire the store's live-account seams to the server. The store calls these
// only for LIVE trades; when Supabase is unconfigured each function returns
// immediately and the simulation stands alone.
registerLiveSync({ open: openLive, settle: settleLive });
