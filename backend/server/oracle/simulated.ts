import type {
  Candle,
  InstrumentSpec,
  PriceOracle,
  Resolution,
  Tick,
  TickListener,
  Unsubscribe,
} from "./types";

const TICK_MS = 250;
const RESOLUTIONS: Resolution[] = [1, 5, 15, 60, 300];
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/** How much tick history to retain per symbol (~2.8 hours at 250ms). */
const MAX_TICKS = 40_000;
const MAX_CANDLES = 1_500;

/** Backfilled history so a fresh boot opens onto a populated chart. */
const WARMUP_SECONDS = 2 * 60 * 60;

/**
 * mulberry32 — small, fast, well-distributed 32-bit PRNG.
 *
 * Seeded deliberately: given ORACLE_SEED the entire price history of a run is
 * reproducible, which is what makes a settlement dispute investigable and lets
 * the engine tests assert on real generated series instead of fixtures.
 */
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

/** Box–Muller transform: uniform -> standard normal. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface SymbolState {
  spec: InstrumentSpec;
  rand: () => number;
  price: number;
  ticks: Tick[];
  candles: Map<Resolution, Candle[]>;
  listeners: Set<TickListener>;
}

/**
 * A server-authoritative synthetic market.
 *
 * Prices follow geometric Brownian motion with two additions that matter for a
 * platform that stays open for days rather than minutes:
 *
 *   - **Mean reversion** toward the instrument's base price. Pure GBM is a
 *     random walk with no anchor; left running over a weekend it wanders to
 *     absurd levels and the chart's price axis becomes meaningless.
 *   - **Rare jumps.** Real markets gap. Without them the series is visually too
 *     smooth and never exercises the "price moved hard against an open
 *     position" path.
 *
 * The client receives ticks but never *produces* them: nothing a browser sends
 * can influence a price, which is the property that makes settlement trustable.
 */
export class SimulatedOracle implements PriceOracle {
  private readonly states = new Map<string, SymbolState>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(specs: InstrumentSpec[], seed = Date.now() & 0xffffffff) {
    specs.forEach((spec, i) => {
      // Each symbol gets its own PRNG stream so adding or removing an
      // instrument does not perturb the price history of the others.
      const rand = mulberry32(seed + i * 0x9e3779b1);
      const state: SymbolState = {
        spec,
        rand,
        price: spec.basePrice,
        ticks: [],
        candles: new Map(RESOLUTIONS.map((r) => [r, [] as Candle[]])),
        listeners: new Set(),
      };
      this.states.set(spec.symbol, state);
      this.warmup(state);
    });
  }

  /** Generates history ending at "now" so the chart is never born empty. */
  private warmup(state: SymbolState): void {
    const now = Date.now();
    const start = now - WARMUP_SECONDS * 1000;
    // Warm up at 1s rather than 250ms: four times less memory for history that
    // no longer needs sub-second fidelity, and candle aggregation is identical.
    const stepMs = 1000;

    for (let ts = start; ts <= now; ts += stepMs) {
      const tick = this.advance(state, stepMs, ts);
      this.record(state, tick);
    }
  }

  /** Evolves the price one step and returns the resulting tick. */
  private advance(state: SymbolState, stepMs: number, ts: number): Tick {
    const { spec, rand } = state;
    const dt = stepMs / 1000 / SECONDS_PER_YEAR;
    const sigma = spec.volatility;
    const mu = spec.drift;

    // Ornstein–Uhlenbeck pull toward base, expressed in log space so it
    // composes cleanly with the GBM term.
    const reversionStrength = 0.35; // per year
    const logGap = Math.log(spec.basePrice / state.price);
    const reversion = reversionStrength * logGap * dt;

    const diffusion = sigma * Math.sqrt(dt) * gaussian(rand);
    const drift = (mu - (sigma * sigma) / 2) * dt;

    // Poisson-ish jump: ~1 per 40 minutes of simulated time, sized at a few
    // multiples of a normal step.
    const jumpProbability = stepMs / 1000 / (40 * 60);
    const jump =
      rand() < jumpProbability ? gaussian(rand) * sigma * Math.sqrt(dt) * 25 : 0;

    state.price *= Math.exp(drift + diffusion + reversion + jump);

    // A price must never reach zero or go negative, whatever the random walk
    // does. Clamping at 5% of base is far outside normal excursions.
    const floor = spec.basePrice * 0.05;
    if (state.price < floor) state.price = floor;

    const mid = round(state.price, spec.precision);
    const half = spec.halfSpread;
    return {
      symbol: spec.symbol,
      ts,
      mid,
      bid: round(mid - half, spec.precision),
      ask: round(mid + half, spec.precision),
    };
  }

  private record(state: SymbolState, tick: Tick): void {
    state.ticks.push(tick);
    if (state.ticks.length > MAX_TICKS) {
      // Trim in blocks; shifting one element per tick is O(n) each time.
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
          // Opening at the previous close keeps the series continuous — gaps
          // between a candle's close and the next candle's open are an artifact
          // readers correctly interpret as missing data.
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
    if (this.running) return;
    this.running = true;

    let previous = Date.now();
    this.timer = setInterval(() => {
      const now = Date.now();
      // Use the real elapsed time rather than assuming TICK_MS. Event-loop lag
      // would otherwise make realised volatility quietly depend on server load.
      const elapsed = Math.min(now - previous, 5_000);
      previous = now;

      for (const state of this.states.values()) {
        const tick = this.advance(state, elapsed, now);
        this.record(state, tick);
        for (const listener of state.listeners) {
          try {
            listener(tick);
          } catch {
            // A misbehaving subscriber must never stall the market.
          }
        }
      }
    }, TICK_MS);

    // Do not hold the process open on this timer alone.
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
  }

  symbols(): string[] {
    return [...this.states.keys()];
  }

  lastTick(symbol: string): Tick | undefined {
    const ticks = this.states.get(symbol)?.ticks;
    return ticks && ticks.length > 0 ? ticks[ticks.length - 1] : undefined;
  }

  /**
   * Last tick at or before `ts`, by binary search.
   *
   * Returns undefined when `ts` is older than retained history rather than
   * extrapolating. The engine turns that into a VOID + full refund, so a
   * restart that loses history can never settle a trade against a guess.
   */
  priceAt(symbol: string, ts: number): number | undefined {
    const state = this.states.get(symbol);
    if (!state || state.ticks.length === 0) return undefined;

    const ticks = state.ticks;
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

  candles(symbol: string, resolution: Resolution, limit: number): Candle[] {
    const series = this.states.get(symbol)?.candles.get(resolution);
    if (!series) return [];
    // Copy: callers must not be able to mutate the live aggregation.
    return series.slice(-limit).map((c) => ({ ...c }));
  }

  subscribe(symbol: string, listener: TickListener): Unsubscribe {
    const state = this.states.get(symbol);
    if (!state) return () => {};
    state.listeners.add(listener);
    return () => state.listeners.delete(listener);
  }
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
