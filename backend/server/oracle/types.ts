/**
 * The price oracle seam.
 *
 * Everything downstream — the chart, the trading panel, and critically the
 * settlement engine — talks to this interface and nothing else. The simulated
 * engine that ships by default and a real market-data provider are peers behind
 * it; swapping them is one line in `oracle/index.ts` and changes no business
 * logic.
 *
 * Two properties the settlement engine depends on and any implementation must
 * uphold:
 *
 *   1. `priceAt(symbol, ts)` is *stable*. Asked for the same instant twice, it
 *      returns the same price forever. Settlement is re-derivable and therefore
 *      auditable; a customer disputing a loss can be shown the exact tick.
 *   2. Ticks are monotonic in time per symbol. No reordering, no gaps that
 *      silently interpolate across an expiry boundary.
 */

export type Resolution = 1 | 5 | 15 | 60 | 300;

export interface Tick {
  symbol: string;
  /** Unix milliseconds. */
  ts: number;
  bid: number;
  ask: number;
  /** The reference price. Settlement always uses mid, never bid or ask. */
  mid: number;
}

export interface Candle {
  /** Unix *seconds* — lightweight-charts' expected unit. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface InstrumentSpec {
  symbol: string;
  displayName: string;
  precision: number;
  basePrice: number;
  volatility: number;
  drift: number;
  halfSpread: number;
}

export type TickListener = (tick: Tick) => void;
export type Unsubscribe = () => void;

export interface PriceOracle {
  /** Begins producing ticks. Idempotent. */
  start(): void;
  stop(): void;

  /** Symbols this oracle can quote. */
  symbols(): string[];

  /** Most recent tick, or undefined if the symbol is unknown / not yet warm. */
  lastTick(symbol: string): Tick | undefined;

  /**
   * The authoritative price at an instant, used for settlement.
   *
   * Returns the last tick at or before `ts`. Returns undefined if `ts` predates
   * the oracle's history — the engine treats that as "cannot settle yet" rather
   * than guessing, so a restart can never invent a close price.
   */
  priceAt(symbol: string, ts: number): number | undefined;

  /** Historical candles, oldest first. */
  candles(symbol: string, resolution: Resolution, limit: number): Candle[];

  subscribe(symbol: string, listener: TickListener): Unsubscribe;
}
