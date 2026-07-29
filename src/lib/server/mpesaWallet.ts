import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

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
 * State lives in a gitignored JSON file next to the project rather than in
 * module memory, because Next's dev server re-evaluates modules on edit and a
 * balance that resets mid-demo is worse than no demo.
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

const FILE = path.join(process.cwd(), ".mpesa-demo.json");

/** Newest first, and only as long as any statement screen will show. */
const MAX_HISTORY = 60;

const EMPTY: MpesaDemoState = {
  balanceMinor: DEMO_START_BALANCE_MINOR,
  transactions: [],
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function load(): Promise<MpesaDemoState> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<MpesaDemoState>;
    return {
      balanceMinor:
        typeof parsed.balanceMinor === "number" && Number.isFinite(parsed.balanceMinor)
          ? Math.round(parsed.balanceMinor)
          : DEMO_START_BALANCE_MINOR,
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
    };
  } catch {
    // No file yet (or it was hand-edited into nonsense): start fresh.
    return { ...EMPTY };
  }
}

async function save(state: MpesaDemoState): Promise<void> {
  await fs.writeFile(FILE, JSON.stringify(state, null, 2), "utf8");
}

/**
 * Serialises every read-modify-write.
 *
 * Two movements landing together — the terminal depositing while the phone
 * polls and withdraws — would otherwise each read the same balance and the
 * second write would erase the first.
 */
let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  // Keep the chain alive even when a caller's work rejects.
  queue = run.catch(() => undefined);
  return run;
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
// Public API
// ---------------------------------------------------------------------------

export function readDemoWallet(): Promise<MpesaDemoState> {
  return exclusive(load);
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

/** Applies one movement and returns the wallet as it stands afterwards. */
export function moveDemoFunds(
  movement: Movement,
): Promise<{ state: MpesaDemoState; tx: MpesaDemoTx }> {
  return exclusive(async () => {
    const state = await load();
    const amount = Math.round(movement.amountMinor);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("BAD_AMOUNT");
    }

    const signed = movement.direction === "OUT" ? -amount : amount;
    const next = state.balanceMinor + signed;
    if (next < 0) throw new InsufficientDemoFunds();

    const tx: MpesaDemoTx = {
      id: randomUUID(),
      kind: movement.kind,
      title: movement.title,
      subtitle: movement.subtitle,
      amountMinor: signed,
      balanceAfterMinor: next,
      reference: movement.reference ?? demoReference(),
      at: new Date().toISOString(),
    };

    const updated: MpesaDemoState = {
      balanceMinor: next,
      transactions: [tx, ...state.transactions].slice(0, MAX_HISTORY),
    };

    await save(updated);
    return { state: updated, tx };
  });
}

/** Puts the phone back to its opening balance with an empty statement. */
export function resetDemoWallet(): Promise<MpesaDemoState> {
  return exclusive(async () => {
    const fresh: MpesaDemoState = { ...EMPTY, transactions: [] };
    await save(fresh);
    return fresh;
  });
}
