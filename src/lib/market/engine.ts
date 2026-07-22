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
 * Candle intervals, in seconds.
 *
 * The ladder is chosen against the *contract durations*, which is the only
 * thing that makes an interval useful or useless here. Contracts run 30s to
 * 15m, and you want a contract to span roughly 5–20 candles: fewer and the
 * chart says nothing about the period you are trading, more and your entry
 * scrolls off the left before expiry.
 *
 *   5s  → a 30s contract spans 6 candles, a 1m spans 12   (the default)
 *   15s → a 1m spans 4, a 5m spans 20
 *   1m  → a 5m spans 5, a 15m spans 15
 *   5m  → context for 15m contracts
 *   15m → session context
 *
 * 5 seconds is the floor rather than 1: at a 250ms tick a 5s candle aggregates
 * 20 ticks, which is enough for a real body and wicks. A 1s candle is four
 * ticks — mostly a doji with no information in it.
 */
export type Resolution = 5 | 15 | 60 | 300 | 900;
export const RESOLUTIONS: Resolution[] = [5, 15, 60, 300, 900];

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
/**
 * Retained tick history.
 *
 * Only two things read raw ticks: settlement (`priceAt`, which needs the last
 * few minutes) and the 15-minute sparkline/change window. Long history lives in
 * the aggregated candles, not here, so this can stay small — 8,000 ticks is
 * ~33 minutes of live 4Hz data, comfortably more than either caller needs.
 */
const MAX_TICKS = 8_000;
const MAX_CANDLES = 900;
/** Headroom before trimming, so the splice is amortised rather than per-bar. */
const TRIM_SLACK = 300;

/**
 * Backfill, so the chart opens onto real history rather than three candles.
 *
 * 24 hours at a 5-second step — the step has to match the shortest candle, or
 * the backfilled 5s candles would each be a single sample with no body. That is
 * 17,280 steps per instrument, which measures at ~160ms for the whole
 * catalogue.
 *
 * 24 hours is chosen against the *longest* interval: it gives the 15m chart 96
 * candles of history. The shorter intervals hit the `MAX_CANDLES` cap long
 * before that and keep their most recent 900.
 *
 * Settlement is unaffected either way — contracts run 30s to 15m and always
 * settle against live 250ms ticks, never against warmup history.
 */
const WARMUP_SECONDS = 24 * 60 * 60;

/**
 * The warmup runs in two phases, because one step size cannot serve both ends
 * of the interval ladder.
 *
 * A step equal to the shortest bucket puts exactly one sample in each of those
 * candles, and a candle built from one sample has no range — no wicks, no
 * shape, nothing to read. A step fine enough for 5s candles across the whole
 * 24 hours would be 86,400 iterations per instrument and cost seconds of
 * blocked main thread at startup.
 *
 * So: a 1-second step over the recent window (enough to fill the 900-candle cap
 * at 5s with five samples each), and a coarse 30-second step before that, which
 * only the 5m and 15m series still care about by then.
 */
const WARMUP_FINE_SECONDS = 90 * 60;
const WARMUP_FINE_STEP_MS = 1_000;
const WARMUP_COARSE_STEP_MS = 30_000;

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

  /**
   * Symbols whose prices arrive from a real feed rather than the simulation.
   *
   * The simulation loop skips these entirely — a live symbol must never have a
   * generated tick mixed into its history, or `priceAt` would settle a contract
   * against a price that never traded.
   */
  private readonly live = new Set<string>();

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
    const fineFrom = now - WARMUP_FINE_SECONDS * 1000;

    // Distant past: coarse. Only the 5m/15m series still hold these.
    for (
      let ts = now - WARMUP_SECONDS * 1000;
      ts < fineFrom;
      ts += WARMUP_COARSE_STEP_MS
    ) {
      this.record(state, this.advance(state, WARMUP_COARSE_STEP_MS, ts));
    }

    // Recent past: fine, so the short intervals get real bodies and wicks.
    for (let ts = fineFrom; ts <= now; ts += WARMUP_FINE_STEP_MS) {
      this.record(state, this.advance(state, WARMUP_FINE_STEP_MS, ts));
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
        // Open at the previous close — a gap between one candle's close and the
        // next one's open is an artifact readers correctly read as missing data.
        const open = last ? last.close : tick.mid;

        // Fill any buckets skipped since the last bar, flat at the last close.
        //
        // Necessary for more than long silences: Binance omits 1s klines for
        // seconds in which nothing traded, so the *backfill itself* arrives
        // full of holes. Without this the seeded series is non-contiguous and
        // the chart draws bars bunched at uneven spacing, which reads exactly
        // like the chart freezing and then jumping.
        if (last) {
          let time = last.time + resolution;
          // Filling further back than the retained window is pure waste — every
          // one of those bars is trimmed before anyone sees it.
          let budget = MAX_CANDLES;
          while (time < bucket && budget-- > 0) {
            series.push({
              time,
              open: last.close,
              high: last.close,
              low: last.close,
              close: last.close,
            });
            time += resolution;
          }
        }

        series.push({
          time: bucket,
          open,
          // High and low must bracket BOTH open and close. Seeding them from
          // the tick alone produces a malformed candle whenever a bucket
          // receives only one sample: the open sits outside the high–low range,
          // which is not a candle any renderer can draw honestly.
          high: Math.max(open, tick.mid),
          low: Math.min(open, tick.mid),
          close: tick.mid,
        });

        // Trim in blocks. Splicing a single element every time the cap is
        // exceeded is O(n) per bar, which during a gap-filling backfill turns
        // into millions of element moves per symbol.
        if (series.length > MAX_CANDLES + TRIM_SLACK) {
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
        // Live symbols are driven by `ingest`; generating a tick for one here
        // would interleave invented prices with real trades. They still need
        // their candle buckets rolled forward, though.
        if (this.live.has(state.spec.symbol)) {
          this.carryForward(state, now);
          continue;
        }

        const tick = this.advance(state, elapsed, now);
        this.record(state, tick);
        this.emit(state.spec.symbol, tick);
      }
    }, TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Rolls candle buckets forward through periods with no price updates.
   *
   * A candle bucket is otherwise only created when a tick arrives, so a market
   * that goes quiet leaves the newest bar sitting as "current" while real time
   * moves on. The chart appears to freeze — bars stack at one position — and
   * then lurches forward several buckets at once when a trade finally prints.
   *
   * The fill is a flat bar at the last close, which is the honest statement:
   * nothing traded, the price did not move. Deliberately no tick is recorded,
   * so `priceAt` never gains a price that was not actually observed — settlement
   * still only ever sees real quotes.
   */
  private carryForward(state: SymbolState, now: number): void {
    const seconds = Math.floor(now / 1000);

    for (const resolution of RESOLUTIONS) {
      const series = state.candles.get(resolution)!;
      const last = series[series.length - 1];
      if (!last) continue;

      const bucket = Math.floor(seconds / resolution) * resolution;
      if (bucket <= last.time) continue;

      const close = last.close;
      let time = last.time + resolution;
      // Bounded: waking from sleep could otherwise ask for tens of thousands of
      // bars in one pass. The remainder fills on subsequent ticks.
      let budget = 300;
      while (time <= bucket && budget-- > 0) {
        series.push({ time, open: close, high: close, low: close, close });
        time += resolution;
      }

      if (series.length > MAX_CANDLES + TRIM_SLACK) {
        series.splice(0, series.length - MAX_CANDLES);
      }
    }
  }

  private emit(symbol: string, tick: Tick): void {
    const subscribers = this.listeners.get(symbol);
    if (!subscribers) return;
    for (const listener of subscribers) {
      try {
        listener(tick);
      } catch {
        // A throwing subscriber must never stall the market.
      }
    }
  }

  symbols(): string[] {
    return [...this.states.keys()];
  }

  /** True when this symbol's prices come from a real exchange feed. */
  isLive(symbol: string): boolean {
    return this.live.has(symbol);
  }

  /**
   * Hands a symbol over to an external feed.
   *
   * Clears the simulated history first: the generated series and the real one
   * are different price paths, and splicing them would leave a visible
   * discontinuity in the chart and — far worse — leave `priceAt` able to return
   * an invented price for a timestamp inside a live contract's window.
   */
  goLive(symbol: string): void {
    const state = this.states.get(symbol);
    if (!state) return;

    this.live.add(symbol);
    state.ticks.length = 0;
    for (const series of state.candles.values()) series.length = 0;
  }

  /** Returns a symbol to the simulation, e.g. when a feed drops for good. */
  goSimulated(symbol: string): void {
    const state = this.states.get(symbol);
    if (!state) return;

    this.live.delete(symbol);
    // Resume the walk from the last real price rather than snapping back to
    // base, so the handover is continuous on the chart.
    const last = state.ticks[state.ticks.length - 1];
    if (last) state.price = last.mid;
  }

  /**
   * Records a real observed price.
   *
   * Ticks must arrive in non-decreasing time order per symbol — out-of-order
   * ticks are dropped rather than inserted, because `priceAt` binary-searches
   * the array and an unsorted array would silently return wrong settlement
   * prices. Exchange feeds do occasionally deliver out of order.
   */
  ingest(symbol: string, price: number, ts: number, emit = true): void {
    const state = this.states.get(symbol);
    if (!state) return;

    const last = state.ticks[state.ticks.length - 1];
    if (last && ts < last.ts) return;

    // Store one decimal finer than the instrument quotes.
    //
    // The mid of a one-tick-wide book sits on a *half* tick — BTC bid 65969.96
    // / ask 65969.97 gives 65969.965. Rounding that to the instrument's own
    // 2dp precision quantises every half-tick move to either zero or a full
    // cent, which erases most of the genuine variation inside a short bar and
    // is a large part of why 5s candles were drawing as flat bodies. The extra
    // digit is real observed price, not invented resolution; display still
    // formats at the instrument's precision.
    const mid = round(price, state.spec.precision + 1);
    const tick: Tick = {
      symbol,
      ts,
      mid,
      bid: round(mid - state.spec.halfSpread, state.spec.precision),
      ask: round(mid + state.spec.halfSpread, state.spec.precision),
    };

    state.price = mid;
    this.record(state, tick);
    if (emit) this.emit(symbol, tick);
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
  __meridianFeed?: { stop(): void };
};

/**
 * Connect real crypto prices on boot.
 *
 * Set to false to run entirely on the simulation — useful offline, in tests, or
 * anywhere the exchange is unreachable.
 */
export const USE_LIVE_CRYPTO = true;

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

    if (USE_LIVE_CRYPTO) {
      // Imported lazily so the exchange adapter is not in the bundle's critical
      // path, and so a failure to load it cannot stop the terminal booting.
      void import("./binance")
        .then(({ BinanceFeed }) => {
          const feed = new BinanceFeed(engine, (status) => {
            notifyFeedStatus(status);
          });
          globalForEngine.__meridianFeed = feed;
          return feed.start();
        })
        .catch((error) => {
          console.warn("[market] live feed unavailable, staying simulated:", error);
          notifyFeedStatus("failed");
        });
    }
  }
  return globalForEngine.__meridianMarket;
}

// --- Feed status ----------------------------------------------------------

export type FeedStatus = "connecting" | "live" | "reconnecting" | "failed";

const feedStatusListeners = new Set<(status: FeedStatus) => void>();
let currentFeedStatus: FeedStatus = USE_LIVE_CRYPTO ? "connecting" : "failed";

function notifyFeedStatus(status: FeedStatus): void {
  currentFeedStatus = status;
  for (const listener of feedStatusListeners) listener(status);
}

export function feedStatus(): FeedStatus {
  return currentFeedStatus;
}

export function onFeedStatus(listener: (status: FeedStatus) => void): () => void {
  feedStatusListeners.add(listener);
  return () => feedStatusListeners.delete(listener);
}
