import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * The demo M-Pesa wallets.
 *
 * A companion phone app (the "M-Pesa clone") stands in for a real handset
 * during a demo: a VIP account deposits and the money leaves the phone's
 * balance, withdraws and it arrives back. This module is the single source of
 * truth both sides read, so neither can drift from the other.
 *
 * Each VIP has **their own** wallet. The admin assigns a PIN and an opening
 * balance from the console; the customer types that PIN into the clone once and
 * the handset is handed a `device_token` it keeps from then on. So a room can
 * hold several handsets, each bound to a different account, and none of them
 * needs a Supabase session.
 *
 * It is a **presentation rail and nothing else**. It does not touch PayHero,
 * it moves no real money, and it is reachable only by accounts the admin has
 * put on the VIP tier. The Standard path — a real STK push settled by the
 * PayHero callback — is untouched and remains the only way actual cash moves.
 *
 * State lives in Supabase (see `supabase/mpesa-demo.sql`) rather than in module
 * memory or a file on disk. Memory does not survive Next's dev server
 * re-evaluating modules on edit; a file does not survive being deployed
 * anywhere real. A balance that resets mid-demo is worse than no demo.
 */

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

/** A wallet as the handset's device token identifies it. */
export interface MpesaDemoWallet {
  userId: string;
  deviceToken: string;
  balanceMinor: number;
}

/** Thrown when the phone cannot cover a debit; routes map it to a 400. */
export class InsufficientDemoFunds extends Error {
  constructor() {
    super("INSUFFICIENT_FUNDS");
    this.name = "InsufficientDemoFunds";
  }
}

/** Thrown when the account has no wallet — the admin has not set one up. */
export class NoDemoWallet extends Error {
  constructor() {
    super(
      "No M-PESA demo wallet for this account. An admin sets the PIN and opening balance in the console.",
    );
    this.name = "NoDemoWallet";
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

function db() {
  const client = supabaseAdmin();
  if (!client) throw new DemoWalletUnavailable();
  return client;
}

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
// Linking
// ---------------------------------------------------------------------------

/**
 * Exchanges a PIN for the wallet it opens, or null when none does.
 *
 * The caller must not distinguish "wrong PIN" from "no such PIN" in what it
 * sends back — one answer for both is what stops the handset being used to
 * enumerate which PINs have been issued.
 */
export async function linkDemoWallet(pin: string): Promise<MpesaDemoWallet | null> {
  if (!/^\d{4}$/.test(pin)) return null;

  const { data, error } = await db().rpc("mpesa_demo_link", { p_pin: pin });
  if (error) throw new Error(error.message);
  return (data as MpesaDemoWallet | null) ?? null;
}

/** The wallet a handset's device token identifies, or null when unknown. */
export async function walletByToken(token: string): Promise<MpesaDemoWallet | null> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;

  const { data, error } = await db().rpc("mpesa_demo_by_token", { p_token: token });
  if (error) throw new Error(error.message);
  return (data as MpesaDemoWallet | null) ?? null;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

async function statement(userId: string): Promise<MpesaDemoTx[]> {
  const { data } = await db()
    .from("mpesa_demo_tx")
    .select(TX_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  return ((data ?? []) as TxRow[]).map(toTx);
}

/** One VIP's wallet as it stands, with their recent statement. */
export async function readDemoWallet(userId: string): Promise<MpesaDemoState> {
  const [{ data: wallet }, transactions] = await Promise.all([
    db()
      .from("mpesa_demo_wallet")
      .select("balance_minor")
      .eq("user_id", userId)
      .maybeSingle(),
    statement(userId),
  ]);

  if (!wallet) throw new NoDemoWallet();

  return { balanceMinor: Number(wallet.balance_minor), transactions };
}

// ---------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------

interface Movement {
  userId: string;
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
  const amount = Math.round(movement.amountMinor);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("BAD_AMOUNT");

  const { data, error } = await db().rpc("mpesa_demo_move", {
    p_user: movement.userId,
    p_kind: movement.kind,
    p_amount: amount,
    p_direction: movement.direction,
    p_title: movement.title,
    p_subtitle: movement.subtitle,
    p_reference: movement.reference ?? demoReference(),
  });

  if (error) {
    if (error.message.includes("INSUFFICIENT_FUNDS")) throw new InsufficientDemoFunds();
    if (error.message.includes("NO_WALLET")) throw new NoDemoWallet();
    throw new Error(error.message);
  }

  const result = data as { balanceMinor: number; tx: TxRow };

  return {
    state: {
      balanceMinor: Number(result.balanceMinor),
      // Re-read rather than appended to locally, so what comes back reflects
      // anything the phone booked while this movement was in flight.
      transactions: await statement(movement.userId),
    },
    tx: toTx(result.tx),
  };
}

/** Puts one phone back to a chosen balance with an empty statement. */
export async function resetDemoWallet(
  userId: string,
  balanceMinor?: number,
): Promise<MpesaDemoState> {
  const { data, error } = await db().rpc("mpesa_demo_reset", {
    p_user: userId,
    p_balance: balanceMinor ?? null,
  });

  if (error) {
    if (error.message.includes("NO_WALLET")) throw new NoDemoWallet();
    throw new Error(error.message);
  }

  return { balanceMinor: Number(data), transactions: [] };
}
