import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The demo M-Pesa wallet.
 *
 * A companion phone app (the "M-Pesa clone") stands in for a real handset
 * during a demo: a VIP account deposits here and the money leaves the phone's
 * balance, withdraws and it arrives back. This module is the single source of
 * truth both sides read, so neither can drift from the other.
 *
 * It is a **presentation rail and nothing else**. It does not touch PayHero,
 * it moves no real money, and it is reachable only by accounts the admin has
 * put on the VIP tier. The Standard path — a real STK push settled by the
 * PayHero callback — is untouched and remains the only way actual cash moves.
 *
 * State lives in Supabase (`mpesa_demo_wallet`, see `supabase/mpesa-demo.sql`)
 * rather than in module memory or a file on disk. Memory does not survive
 * Next's dev server re-evaluating modules on edit; a file does not survive
 * being deployed anywhere real, because a serverless host hands each
 * invocation a fresh filesystem and Render wipes its disk on every cold start.
 * A balance that resets mid-demo is worse than no demo, so it lives where both
 * the terminal and the payments service can reach the same row.
 */

/** KSh 256,700.00 — where the phone starts before anything is demonstrated. */
export const DEMO_START_BALANCE_MINOR = 25_670_000;

export type MpesaDemoKind = "DEPOSIT" | "WITHDRAWAL" | "AGENT_WITHDRAWAL";

export interface MpesaDemoTx {
  id: string;
  kind: MpesaDemoKind;
  title: string;
  subtitle: string;
  /** Signed, in cents: negative is money leaving the phone. */
  amountMinor: number;
  balanceAfterMinor: number;
  reference: string;
  at: string;
}

export interface MpesaDemoState {
  balanceMinor: number;
  transactions: MpesaDemoTx[];
}

/** Thrown when the phone cannot cover a debit; routes map it to a 400. */
export class InsufficientDemoFunds extends Error {
  constructor() {
    super("INSUFFICIENT_FUNDS");
    this.name = "InsufficientDemoFunds";
  }
}

/** Thrown when Supabase is not configured; routes map it to a 503. */
export class DemoWalletUnavailable extends Error {
  constructor() {
    super("The demo wallet is unavailable — Supabase is not configured.");
    this.name = "DemoWalletUnavailable";
  }
}

/** Newest first, and only as long as any statement screen will show. */
const MAX_HISTORY = 60;

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

interface TxRow {
  id: string;
  kind: MpesaDemoKind;
  title: string;
  subtitle: string;
  amount_minor: number | string;
  balance_after_minor: number | string;
  reference: string;
  created_at: string;
}

function toTx(row: TxRow): MpesaDemoTx {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    subtitle: row.subtitle,
    amountMinor: Number(row.amount_minor),
    balanceAfterMinor: Number(row.balance_after_minor),
    reference: row.reference,
    at: row.created_at,
  };
}

const TX_COLUMNS =
  "id, kind, title, subtitle, amount_minor, balance_after_minor, reference, created_at";

// ---------------------------------------------------------------------------
// Reference codes
// ---------------------------------------------------------------------------

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** An M-Pesa-shaped receipt, e.g. `TIL4KX92MB`. */
export function demoReference(): string {
  let out = "T";
  for (let i = 0; i < 9; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The wallet as it stands, with the recent statement.
 *
 * Never throws for a missing row: a project where the migration has not been
 * run yet reads as the opening balance, which is what the phone would show
 * anyway, rather than as a broken screen.
 */
export async function readDemoWallet(): Promise<MpesaDemoState> {
  const db = supabaseAdmin();
  if (!db) throw new DemoWalletUnavailable();

  const [{ data: wallet }, { data: rows }] = await Promise.all([
    db.from("mpesa_demo_wallet").select("balance_minor").eq("id", true).maybeSingle(),
    db
      .from("mpesa_demo_tx")
      .select(TX_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY),
  ]);

  return {
    balanceMinor: Number(wallet?.balance_minor ?? DEMO_START_BALANCE_MINOR),
    transactions: ((rows ?? []) as TxRow[]).map(toTx),
  };
}

interface Movement {
  kind: MpesaDemoKind;
  /** Positive, in cents. Direction comes from `direction`. */
  amountMinor: number;
  direction: "IN" | "OUT";
  title: string;
  subtitle: string;
  reference?: string;
}

/**
 * Applies one movement and returns the wallet as it stands afterwards.
 *
 * The balance change and the statement line are one SQL function under a row
 * lock — see `mpesa_demo_move`. Two movements landing together (the terminal
 * depositing while the phone withdraws) serialise there rather than racing.
 */
export async function moveDemoFunds(
  movement: Movement,
): Promise<{ state: MpesaDemoState; tx: MpesaDemoTx }> {
  const db = supabaseAdmin();
  if (!db) throw new DemoWalletUnavailable();

  const amount = Math.round(movement.amountMinor);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("BAD_AMOUNT");

  const { data, error } = await db.rpc("mpesa_demo_move", {
    p_kind: movement.kind,
    p_amount: amount,
    p_direction: movement.direction,
    p_title: movement.title,
    p_subtitle: movement.subtitle,
    p_reference: movement.reference ?? demoReference(),
  });

  if (error) {
    if (error.message.includes("INSUFFICIENT_FUNDS")) {
      throw new InsufficientDemoFunds();
    }
    throw new Error(error.message);
  }

  const result = data as { balanceMinor: number; tx: TxRow };
  const tx = toTx(result.tx);

  // The statement is re-read rather than appended to locally, so what comes
  // back reflects anything the phone booked while this movement was in flight.
  const { data: rows } = await db
    .from("mpesa_demo_tx")
    .select(TX_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  return {
    state: {
      balanceMinor: Number(result.balanceMinor),
      transactions: ((rows ?? []) as TxRow[]).map(toTx),
    },
    tx,
  };
}

/** Puts the phone back to its opening balance with an empty statement. */
export async function resetDemoWallet(): Promise<MpesaDemoState> {
  const db = supabaseAdmin();
  if (!db) throw new DemoWalletUnavailable();

  const { data, error } = await db.rpc("mpesa_demo_reset");
  if (error) throw new Error(error.message);

  return { balanceMinor: Number(data ?? DEMO_START_BALANCE_MINOR), transactions: [] };
}
