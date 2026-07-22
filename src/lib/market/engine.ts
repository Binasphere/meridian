import { INSTRUMENTS, type Instrument } from "./instruments";

/**
 * The market simulation.
 *
 * Prices follow geometric Brownian motion with two additions that matter for
 * something a person leaves open for an hour:
 *
 *   - **Mean reversion** toward the instrument's base price. A pure random walk
 *     has no anchor; left running it drifts to absurd levels and the chart's
 *     price axis stops meaning anything.
 *   - **Rare jumps.** Real markets gap. Without them the series is visually too
 *     smooth and never exercises "the price moved hard against my position".
 *
 * With zero drift the probability of finishing above the entry price is exactly
 * 0.5, so a contract here is a genuine coin flip and the house edge is visible
 * in one place only: the payout being below 100%. Nothing in this file looks at
 * open positions, and it could not tilt an outcome if it wanted to — it does
 * not know they exist.
 *
 * Isomorphic on purpose: no Node or DOM APIs, so the identical model runs in
 * the browser today and behind the `PriceOracle` interface on the server later.
 */

/**
 * Candle intervals, in seconds. 5 minutes is the floor.
 *
 * Sub-minute candles look busy but carry almost no information at these
 * volatilities — a 1-second candle is mostly a single tick with no body. Five
 * minutes is the shortest interval where the open/high/low/close actually
 * describe a range worth reading.
 */
export type Resolution = 300 | 900 | 1800 | 3600;
export const RESOLUTIONS: Resolution[] = [300, 900, 1800, 3600];

export interface Tick {
  symbol: string;
  ts: number;
  bid: number;
  ask: number;
  mid: number;
}

export interface Candle {
  /** Unix *seconds* — what lightweight-charts expects. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const TICK_MS = 250;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const MAX_TICKS = 15_000;
const MAX_CANDLES = 900;

/**
 * Backfill, so the chart opens onto real history rather than three candles.
 *
 * Three days at a 30-second step. The step is coarse because the shortest
 * candle is now five minutes — 30s still puts ten samples inside every candle,
 * which is plenty to shape a body and wicks, at a twentieth of the work a 1s
 * warmup would cost. Settlement is unaffected: contracts run 30s to 15m and
 * always settle against live 250ms ticks, never against warmup history.
 */
const WARMUP_SECONDS = 3 * 24 * 60 * 60;
const WARMUP_STEP_MS = 30_000;

/**
 * Target spread of log-price around an instrument's base, as a standard
 * deviation. The mean-reversion rate is derived from it per instrument rather
 * than fixed, because a single rate that anchors a 300%-volatility synthetic
 * would pin EUR/USD rigid, and one that lets EUR/USD breathe would let the
 * synthetic wander to nothing over a weekend.
 *
 * For the Ornstein–Uhlenbeck process d(logP) = −θ(logP − logBase)dt + σdW the
 * stationary standard deviation is σ/√(2θ), so θ = σ² / (2·band²) puts each
 * instrument in the same ±6% neighbourhood of its quoted level regardless of
 * how violent it is minute to minute.
 */
const ANCHOR_BAND = 0.05;

/**
 * Jumps.
 *
 * A jump arrives on average once every `JUMP_MEAN_INTERVAL_SEC` of wall-clock
 * time and is worth `JUMP_EQUIV_SECONDS` of ordinary diffusion.
 *
 * Both are expressed in absolute time on purpose. Sizing a jump relative to the
 * *integration step* — the obvious way to write it — makes its variance per
 * unit time proportional to the step, so the 30-second warmup would inject
 * ~120× the jump energy of a live 250ms tick and the backfilled history would
 * be visibly wilder than everything that follows it.
 */
const JUMP_MEAN_INTERVAL_SEC = 40 * 60;
const JUMP_EQUIV_SECONDS = 90;

/** mulberry32 — small, fast, well-distributed. Seeded so runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller: uniform -> standard normal. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

interface SymbolState {
  spec: Instrument;
  rand: () => number;
  price: number;
  ticks: Tick[];
  candles: Map<Resolution, Candle[]>;
}

export type TickListener = (tick: Tick) => void;
export type Unsubscribe = () => void;

export class MarketEngine {
  private readonly states = new Map<string, SymbolState>();
  private readonly listeners = new Map<string, Set<TickListener>>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(specs: Instrument[] = INSTRUMENTS, seed = Date.now() & 0xffffffff) {
    specs.forEach((spec, i) => {
      // Independent PRNG stream per symbol, so adding or removing an instrument
      // does not perturb the price history of the others.
      const state: SymbolState = {
        spec,
        rand: mulberry32(seed + i * 0x9e3779b1),
        price: spec.basePrice,
        ticks: [],
        candles: new Map(RESOLUTIONS.map((r) => [r, [] as Candle[]])),
      };
      this.states.set(spec.symbol, state);
      this.warmup(state);
    });
  }

  private warmup(state: SymbolState): void {
    const now = Date.now();
    for (
      let ts = now - WARMUP_SECONDS * 1000;
      ts <= now;
      ts += WARMUP_STEP_MS
    ) {
      this.record(state, this.advance(state, WARMUP_STEP_MS, ts));
    }
  }

  private advance(state: SymbolState, stepMs: number, ts: number): Tick {
    const { spec, rand } = state;
    const dt = stepMs / 1000 / SECONDS_PER_YEAR;
    const sigma = spec.volatility;

    // Ornstein–Uhlenbeck pull toward base, in log space so it composes with GBM.
    //
    // This is invisible on the timescale a contract lives at. Even at the edge
    // of the band the pull over a 60-second contract is under 2% of one
    // standard deviation of the random term, so the probability of finishing
    // above the entry stays within a rounding error of 0.5 — the instrument
    // remains a fair coin, which is the property the payout rate is priced
    // against.
    const theta = (sigma * sigma) / (2 * ANCHOR_BAND * ANCHOR_BAND);
    const reversion = theta * Math.log(spec.basePrice / state.price) * dt;
    const diffusion = sigma * Math.sqrt(dt) * gaussian(rand);
    const drift = (spec.drift - (sigma * sigma) / 2) * dt;

    // Poisson-ish jump, sized in absolute time so it is step-invariant.
    const jump =
      rand() < stepMs / 1000 / JUMP_MEAN_INTERVAL_SEC
        ? gaussian(rand) *
          sigma *
          Math.sqrt(JUMP_EQUIV_SECONDS / SECONDS_PER_YEAR)
        : 0;

    state.price *= Math.exp(drift + diffusion + reversion + jump);

    // Whatever the walk does, a price never reaches zero.
    const floor = spec.basePrice * 0.05;
    if (state.price < floor) state.price = floor;

    const mid = round(state.price, spec.precision);
    return {
      symbol: spec.symbol,
      ts,
      mid,
      bid: round(mid - spec.halfSpread, spec.precision),
      ask: round(mid + spec.halfSpread, spec.precision),
    };
  }

  private record(state: SymbolState, tick: Tick): void {
    state.ticks.push(tick);
    if (state.ticks.length > MAX_TICKS) {
      // Trim in blocks; shifting one element per tick would be O(n) each time.
      state.ticks.splice(0, state.ticks.length - MAX_TICKS);
    }

    const seconds = Math.floor(tick.ts / 1000);
    for (const resolution of RESOLUTIONS) {
      const series = state.candles.get(resolution)!;
      const bucket = Math.floor(seconds / resolution) * resolution;
      const last = series[series.length - 1];

      if (last && last.time === bucket) {
        last.high = Math.max(last.high, tick.mid);
        last.low = Math.min(last.low, tick.mid);
        last.close = tick.mid;
      } else {
        series.push({
          time: bucket,
          // Open at the previous close — a gap between one candle's close and
          // the next one's open is an artifact readers correctly read as
          // missing data.
          open: last ? last.close : tick.mid,
          high: tick.mid,
          low: tick.mid,
          close: tick.mid,
        });
        if (series.length > MAX_CANDLES) {
          series.splice(0, series.length - MAX_CANDLES);
        }
      }
    }
  }

  start(): void {
    if (this.timer) return;
    let previous = Date.now();

    this.timer = setInterval(() => {
      const now = Date.now();
      // Use real elapsed time rather than assuming TICK_MS — otherwise a
      // backgrounded tab (where timers are throttled to ~1/s) would quietly
      // produce a lower-volatility series than a foreground one.
      const elapsed = Math.min(now - previous, 5_000);
      previous = now;

      for (const state of this.states.values()) {
        const tick = this.advance(state, elapsed, now);
        this.record(state, tick);

        const subscribers = this.listeners.get(state.spec.symbol);
        if (subscribers) {
          for (const listener of subscribers) {
            try {
              listener(tick);
            } catch {
              // A throwing subscriber must never stall the market.
            }
          }
        }
      }
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  symbols(): string[] {
    return [...this.states.keys()];
  }

  lastTick(symbol: string): Tick | undefined {
    const ticks = this.states.get(symbol)?.ticks;
    return ticks && ticks.length > 0 ? ticks[ticks.length - 1] : undefined;
  }

  /**
   * The price at an instant — the settlement price.
   *
   * Binary search for the last tick at or before `ts`. Stable: asked twice for
   * the same instant it returns the same answer forever, which is what makes a
   * settlement re-derivable and therefore disputable. Returns undefined rather
   * than extrapolating when `ts` predates retained history.
   */
  priceAt(symbol: string, ts: number): number | undefined {
    const ticks = this.states.get(symbol)?.ticks;
    if (!ticks || ticks.length === 0) return undefined;
    if (ts < ticks[0]!.ts) return undefined;
    if (ts >= ticks[ticks.length - 1]!.ts) return ticks[ticks.length - 1]!.mid;

    let lo = 0;
    let hi = ticks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (ticks[mid]!.ts <= ts) lo = mid;
      else hi = mid - 1;
    }
    return ticks[lo]!.mid;
  }

  candles(symbol: string, resolution: Resolution, limit = 400): Candle[] {
    const series = this.states.get(symbol)?.candles.get(resolution);
    if (!series) return [];
    // Copy — callers must not mutate the live aggregation.
    return series.slice(-limit).map((c) => ({ ...c }));
  }

  /** Change over a trailing window, for the watchlist. */
  changePercent(symbol: string, windowSeconds = 900): number {
    const state = this.states.get(symbol);
    if (!state || state.ticks.length === 0) return 0;

    const now = state.ticks[state.ticks.length - 1]!;
    const then = this.priceAt(symbol, now.ts - windowSeconds * 1000);
    if (then === undefined || then === 0) return 0;
    return ((now.mid - then) / then) * 100;
  }

  /** A trailing series for a sparkline, downsampled to `points` values. */
  sparkline(symbol: string, points = 40, windowSeconds = 900): number[] {
    const state = this.states.get(symbol);
    if (!state || state.ticks.length === 0) return [];

    const end = state.ticks[state.ticks.length - 1]!.ts;
    const start = end - windowSeconds * 1000;
    const step = (end - start) / (points - 1);

    const out: number[] = [];
    for (let i = 0; i < points; i++) {
      const value = this.priceAt(symbol, start + step * i);
      if (value !== undefined) out.push(value);
    }
    return out;
  }

  subscribe(symbol: string, listener: TickListener): Unsubscribe {
    let set = this.listeners.get(symbol);
    if (!set) {
      set = new Set();
      this.listeners.set(symbol, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
    };
  }

  /** Subscribe to every symbol at once — used by the watchlist. */
  subscribeAll(listener: TickListener): Unsubscribe {
    const unsubs = this.symbols().map((s) => this.subscribe(s, listener));
    return () => unsubs.forEach((u) => u());
  }
}

/**
 * One engine per browser tab, kept on globalThis so React's Fast Refresh and
 * StrictMode's double-mount do not spin up a second market whose prices
 * disagree with the first.
 */
const globalForEngine = globalThis as unknown as {
  __meridianMarket?: MarketEngine;
};

export function market(): MarketEngine {
  // Guard rather than silently working: constructing the engine during server
  // rendering would run the full warmup on every request and leave a timer
  // ticking in the Node process forever. Making that a loud error keeps the
  // engine out of render paths, where it does not belong — call it from an
  // effect, an event handler, or a store action.
  if (typeof window === "undefined") {
    throw new Error(
      "market() is client-only. Call it from useEffect, an event handler, or a store action — never during render.",
    );
  }

  if (!globalForEngine.__meridianMarket) {
    const engine = new MarketEngine();
    engine.start();
    globalForEngine.__meridianMarket = engine;
  }
  return globalForEngine.__meridianMarket;
}
