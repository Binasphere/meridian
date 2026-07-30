/**
 * Contract mechanics.
 *
 * Pure functions, no state, no I/O — the rules of the product expressed in one
 * place so they can be reasoned about and tested directly. The store calls
 * these; so will the server when settlement moves behind an API.
 *
 * Money is always a `bigint` of minor units (cents). No balance, stake, or
 * payout is ever a JavaScript `number`: binary floating point cannot represent
 * 0.1, and a ledger that drifts a cent per thousand trades is a broken ledger.
 */

export type Direction = "UP" | "DOWN";
export type TradeStatus = "OPEN" | "WON" | "LOST" | "TIE" | "VOIDED";

export interface Trade {
  id: string;
  symbol: string;
  displayName: string;
  precision: number;
  direction: Direction;
  status: TradeStatus;
  /** Minor units, as a string so the state survives JSON persistence. */
  stakeMinor: string;
  payoutBps: number;
  openPrice: number;
  closePrice: number | null;
  durationSec: number;
  openedAt: number;
  expiresAt: number;
  settledAt: number | null;
  pnlMinor: string | null;
  accountKind: AccountKind;
  /**
   * The id of the server-side `trades` row backing a LIVE contract, set once
   * the booking RPC returns. Absent on demo trades and on anything placed
   * while Supabase is unconfigured.
   */
  serverId?: string | null;
}

export type AccountKind = "DEMO" | "LIVE";

/**
 * Live-account tier.
 *
 * A separate axis from `AccountKind`: the practice/real split decides which
 * balance a contract draws on, the tier decides the terms a real contract
 * trades at. Demo is always practised at Standard terms so results transfer.
 */
export type LiveTier = "STANDARD" | "VIP";

/** Extra payout, in bps, the VIP tier adds on top of an instrument's base. */
export const VIP_PAYOUT_BONUS_BPS = 200;

/**
 * The payout actually applied to a contract, given who is placing it.
 *
 * The instrument sets the base rate; VIP adds a fixed bonus on top. The bonus
 * is a live-account perk only — the demo account always trades at the base rate,
 * so a strategy practised on demo matches a Standard live account rather than
 * flattering itself with VIP terms.
 */
export function effectivePayoutBps(
  basePayoutBps: number,
  kind: AccountKind,
  tier: LiveTier,
): number {
  return kind === "LIVE" && tier === "VIP"
    ? basePayoutBps + VIP_PAYOUT_BONUS_BPS
    : basePayoutBps;
}

// ---------------------------------------------------------------------------
// Withdrawal eligibility
// ---------------------------------------------------------------------------
// Withdrawals are open to every live account. The control is no longer a tier
// gate: each request lands in the admin console's queue, where a human reviews
// it and pays it out via M-Pesa — the review *is* the check. The old VIP-only
// gate existed while withdrawals were instant and simulated; an instant path
// out of the platform needed the verification tier in front of it, a manually
// approved one does not.

const BPS_DENOMINATOR = 10_000n;

/**
 * Profit on a winning stake.
 *
 * Floor division rounds the customer's profit *down* to the cent. Rounding up
 * would hand out a fraction of a cent on every single win, which at volume is a
 * real and unbudgeted liability.
 */
export function profitFromStake(stakeMinor: bigint, payoutBps: number): bigint {
  return (stakeMinor * BigInt(payoutBps)) / BPS_DENOMINATOR;
}

/** Total returned on a win: the stake back, plus profit. */
export function payoutFromStake(stakeMinor: bigint, payoutBps: number): bigint {
  return stakeMinor + profitFromStake(stakeMinor, payoutBps);
}

// ---------------------------------------------------------------------------
// Stake bounds
// ---------------------------------------------------------------------------

/**
 * What a contract may be staked at, in minor units.
 *
 * Shared by the desktop ticket and the mobile bar, which are two arrangements
 * of one control rather than two controls — a phone that accepted a stake the
 * desktop refuses would be a different product on a smaller screen.
 */
export const MIN_STAKE_MINOR = 10_000n; // KSh 100
export const MAX_STAKE_MINOR = 20_000_000n; // KSh 200,000
export const STAKE_STEP_MINOR = 10_000n; // KSh 100

/** The one-tap amounts, in minor units: KSh 100 / 250 / 500 / 1,000. */
export const QUICK_STAKES_MINOR = [10_000n, 25_000n, 50_000n, 100_000n];

/** Clamps a stake into the permitted range. */
export function clampStake(stakeMinor: bigint): bigint {
  if (stakeMinor < MIN_STAKE_MINOR) return MIN_STAKE_MINOR;
  if (stakeMinor > MAX_STAKE_MINOR) return MAX_STAKE_MINOR;
  return stakeMinor;
}

/**
 * Decides an expired contract.
 *
 * UP wins strictly above the entry, DOWN strictly below. An exactly equal close
 * is a TIE and refunds the stake in full. Treating equality as a loss would be
 * a hidden edge for the house, and on low-precision instruments it happens
 * often enough to matter.
 */
export function decide(
  direction: Direction,
  openPrice: number,
  closePrice: number,
): Extract<TradeStatus, "WON" | "LOST" | "TIE"> {
  if (closePrice === openPrice) return "TIE";
  const wentUp = closePrice > openPrice;
  return (direction === "UP") === wentUp ? "WON" : "LOST";
}

/** Signed P&L for a decided contract. */
export function pnlFor(
  status: TradeStatus,
  stakeMinor: bigint,
  payoutBps: number,
): bigint {
  switch (status) {
    case "WON":
      return profitFromStake(stakeMinor, payoutBps);
    case "LOST":
      return -stakeMinor;
    default:
      return 0n; // TIE and VOIDED both return the stake exactly.
  }
}

/** How much flows back to the customer's balance. A loss returns nothing. */
export function returnFor(
  status: TradeStatus,
  stakeMinor: bigint,
  payoutBps: number,
): bigint {
  switch (status) {
    case "WON":
      return payoutFromStake(stakeMinor, payoutBps);
    case "TIE":
    case "VOIDED":
      return stakeMinor;
    default:
      return 0n;
  }
}

/** Live "is this contract currently winning?" for an open position. */
export function isWinning(trade: Trade, currentPrice: number): boolean {
  return trade.direction === "UP"
    ? currentPrice > trade.openPrice
    : currentPrice < trade.openPrice;
}

export interface SessionStats {
  total: number;
  won: number;
  lost: number;
  tied: number;
  winRate: number;
  netMinor: bigint;
  volumeMinor: bigint;
  bestMinor: bigint;
  worstMinor: bigint;
}

export function computeStats(trades: Trade[]): SessionStats {
  const settled = trades.filter((t) => t.status !== "OPEN");

  let won = 0;
  let lost = 0;
  let tied = 0;
  let netMinor = 0n;
  let volumeMinor = 0n;
  let bestMinor = 0n;
  let worstMinor = 0n;

  for (const trade of settled) {
    const pnl = BigInt(trade.pnlMinor ?? "0");
    netMinor += pnl;
    volumeMinor += BigInt(trade.stakeMinor);

    if (pnl > bestMinor) bestMinor = pnl;
    if (pnl < worstMinor) worstMinor = pnl;

    if (trade.status === "WON") won += 1;
    else if (trade.status === "LOST") lost += 1;
    else tied += 1;
  }

  // Ties are excluded from the denominator: a refunded contract was neither
  // won nor lost, and counting it as a loss understates the strike rate.
  const decided = won + lost;

  return {
    total: settled.length,
    won,
    lost,
    tied,
    winRate: decided === 0 ? 0 : (won / decided) * 100,
    netMinor,
    volumeMinor,
    bestMinor,
    worstMinor,
  };
}
