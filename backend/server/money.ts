/**
 * Money.
 *
 * Every monetary value in this system is a `bigint` count of *minor units*
 * (cents). There is no code path where a balance, a stake, or a payout is a
 * JavaScript `number`, because binary floating point cannot represent 0.1 and
 * a trading ledger that drifts by a cent per thousand trades is a broken
 * ledger.
 *
 * The one place rounding is unavoidable is computing a payout from a basis
 * point rate. That rounding is defined here, once, and it rounds *toward the
 * house* so the platform can never be arbitraged by dust.
 */

export const CURRENCY = "KES" as const;
export const MINOR_UNITS_PER_MAJOR = 100n;

/** Basis points: 10_000 bps = 100%. */
export const BPS_DENOMINATOR = 10_000n;

/**
 * Profit on a winning stake, in minor units.
 *
 * Floor division deliberately rounds the customer's profit *down* to the cent.
 * The alternative (rounding up) hands out a fraction of a cent on every win,
 * which at scale is a real and unbudgeted liability.
 */
export function profitFromStake(stakeMinor: bigint, payoutBps: number): bigint {
  if (stakeMinor < 0n) throw new RangeError("stake must be non-negative");
  if (!Number.isInteger(payoutBps) || payoutBps < 0) {
    throw new RangeError("payoutBps must be a non-negative integer");
  }
  return (stakeMinor * BigInt(payoutBps)) / BPS_DENOMINATOR;
}

/** Total returned to the customer on a win: original stake plus profit. */
export function payoutFromStake(stakeMinor: bigint, payoutBps: number): bigint {
  return stakeMinor + profitFromStake(stakeMinor, payoutBps);
}

/** `1234567n` -> `"12,345.67"`. Never used for arithmetic, only display. */
export function formatMinor(
  minor: bigint,
  opts: { withSign?: boolean; currency?: string | null } = {},
): string {
  const { withSign = false, currency = null } = opts;
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;

  const major = abs / MINOR_UNITS_PER_MAJOR;
  const cents = abs % MINOR_UNITS_PER_MAJOR;

  const grouped = major.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = `${grouped}.${cents.toString().padStart(2, "0")}`;

  const sign = negative ? "-" : withSign ? "+" : "";
  return currency ? `${sign}${currency} ${body}` : `${sign}${body}`;
}

/**
 * Parses user input ("1,250.5", "1250", " 100.00 ") into minor units.
 * Returns null for anything that is not a well-formed non-negative amount with
 * at most two decimal places — the caller decides what to do about it.
 */
export function parseMajorToMinor(input: string): bigint | null {
  const cleaned = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;

  const [whole = "0", frac = ""] = cleaned.split(".");
  const cents = frac.padEnd(2, "0");
  return BigInt(whole) * MINOR_UNITS_PER_MAJOR + BigInt(cents);
}

/**
 * `bigint` has no JSON representation, so every amount crossing the API
 * boundary is serialised as a decimal string. Clients parse it back with
 * BigInt() or render it directly — but never as a JS number.
 */
export function minorToString(minor: bigint): string {
  return minor.toString();
}
