"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { market, type Tick } from "./market/engine";

/**
 * React bindings for the market engine.
 *
 * The engine pushes ~4 updates per second per symbol. These hooks exist to keep
 * that firehose from turning into 4 full-tree re-renders a second: each one
 * subscribes as narrowly as it can and holds its own state, so a price change
 * repaints the price and nothing else.
 */

export interface PricePoint {
  tick: Tick | null;
  /** Direction of the most recent change — drives the flash and the arrow. */
  motion: "up" | "down" | "flat";
}

/** Live price for one symbol. */
export function useTick(symbol: string): PricePoint {
  const [point, setPoint] = useState<PricePoint>({ tick: null, motion: "flat" });
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const engine = market();

    const apply = (tick: Tick) => {
      const last = previous.current;
      const motion: PricePoint["motion"] =
        last === null || tick.mid === last
          ? "flat"
          : tick.mid > last
            ? "up"
            : "down";
      previous.current = tick.mid;
      setPoint({ tick, motion });
    };

    // Seed synchronously so the first paint has a price rather than a dash.
    const seed = engine.lastTick(symbol);
    if (seed) {
      previous.current = seed.mid;
      setPoint({ tick: seed, motion: "flat" });
    }

    return engine.subscribe(symbol, apply);
  }, [symbol]);

  return point;
}

/**
 * Live prices for every symbol, for the watchlist.
 *
 * One subscription and one state object rather than twelve hooks — twelve
 * independent subscriptions would each schedule their own render and the
 * watchlist would repaint twelve times per tick instead of once.
 */
export function useAllTicks(): Record<string, Tick> {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});

  useEffect(() => {
    const engine = market();

    const seed: Record<string, Tick> = {};
    for (const symbol of engine.symbols()) {
      const tick = engine.lastTick(symbol);
      if (tick) seed[symbol] = tick;
    }
    setTicks(seed);

    // Coalesce the whole tick round into a single state update on the next
    // frame. Without this the engine's per-symbol callbacks would each trigger
    // a render pass.
    let pending: Record<string, Tick> = {};
    let frame = 0;

    const flush = () => {
      frame = 0;
      const batch = pending;
      pending = {};
      setTicks((current) => ({ ...current, ...batch }));
    };

    return engine.subscribeAll((tick) => {
      pending[tick.symbol] = tick;
      if (!frame) frame = requestAnimationFrame(flush);
    });
  }, []);

  return ticks;
}

/** A clock that re-renders on an interval — for countdowns and elapsed times. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/**
 * True once the component has mounted on the client.
 *
 * Anything driven by localStorage or by the market engine renders differently
 * on the server than on the client, which React reports as a hydration error.
 * Gating on this renders a stable placeholder for the first paint instead.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/** Previous value of something, for comparing across renders. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
