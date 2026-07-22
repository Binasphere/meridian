"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAllTicks, useLiveSymbols } from "@/lib/hooks";
import { market } from "@/lib/market/engine";
import {
  INSTRUMENTS,
  KIND_LABEL,
  KIND_ORDER,
  type InstrumentKind,
} from "@/lib/market/instruments";
import { Sparkline } from "./Sparkline";
import { Empty } from "@/components/ui/primitives";

/**
 * The instrument list.
 *
 * Rows are dense because a watchlist is scanned, not read: symbol, price,
 * change and shape need to land in one saccade. Everything else is suppressed.
 */
export function Watchlist({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (symbol: string) => void;
}) {
  const ticks = useAllTicks();
  const liveSymbols = useLiveSymbols();
  const [query, setQuery] = useState("");
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const [changes, setChanges] = useState<Record<string, number>>({});

  // Sparklines and trailing changes redraw on their own slow cadence, in an
  // effect rather than during render. Two reasons: recomputing twelve of each
  // at the 4Hz tick rate is pure waste when neither visibly changes in 250ms,
  // and touching the engine during render would run it on the server.
  useEffect(() => {
    const engine = market();
    const compute = () => {
      const nextSparks: Record<string, number[]> = {};
      const nextChanges: Record<string, number> = {};
      for (const spec of INSTRUMENTS) {
        nextSparks[spec.symbol] = engine.sparkline(spec.symbol, 32, 900);
        nextChanges[spec.symbol] = engine.changePercent(spec.symbol, 900);
      }
      setSparks(nextSparks);
      setChanges(nextChanges);
    };
    compute();
    const id = setInterval(compute, 2_000);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = INSTRUMENTS.filter(
      (i) =>
        !needle ||
        i.symbol.toLowerCase().includes(needle) ||
        i.displayName.toLowerCase().includes(needle),
    );

    // Fixed group order, so the list does not reshuffle as the filter narrows.
    const byKind = new Map<InstrumentKind, typeof INSTRUMENTS>();
    for (const spec of matched) {
      const list = byKind.get(spec.kind) ?? [];
      list.push(spec);
      byKind.set(spec.kind, list);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map(
      (k) => [k, byKind.get(k)!] as const,
    );
  }, [query]);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-2.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search markets"
            aria-label="Search markets"
            className={cn(
              "h-8 w-full rounded-none border border-line bg-surface-1 pl-8 pr-2.5",
              "text-[13px] text-ink placeholder:text-ink-faint",
              "transition-colors focus:border-line-strong focus:outline-none",
            )}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {groups.length === 0 ? (
          <Empty title="No markets match" hint="Try a different symbol." />
        ) : (
          groups.map(([kind, specs]) => (
            <div key={kind} className="mb-1">
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
                {KIND_LABEL[kind]}
              </div>

              {specs.map((spec) => {
                const tick = ticks[spec.symbol];
                const change = changes[spec.symbol] ?? 0;
                const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
                const isActive = spec.symbol === active;

                return (
                  <button
                    key={spec.symbol}
                    onClick={() => onSelect(spec.symbol)}
                    aria-current={isActive}
                    className={cn(
                      "group relative flex w-full items-center gap-2.5 px-3 py-2 text-left",
                      "transition-colors duration-100",
                      isActive ? "bg-surface-3" : "hover:bg-surface-2/70",
                    )}
                  >
                    {/* Active marker in the gutter — position, not colour, so
                        it survives every accessibility mode. */}
                    <span
                      className={cn(
                        "absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-none transition-opacity",
                        isActive ? "bg-accent opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate text-[13px] font-medium",
                            isActive ? "text-ink" : "text-ink-secondary",
                          )}
                        >
                          {spec.short}
                        </span>
                        {/* Every instrument is quoted live, so "sim" appears
                            only when the exchange connection has dropped and
                            this symbol has fallen back to the failover walk.
                            Silent degradation is the thing to avoid. */}
                        {liveSymbols.has(spec.symbol) ? (
                          <span
                            title="Live price from Binance"
                            className="border border-up/25 bg-up/10 px-1 text-[9px] font-semibold uppercase tracking-wide text-up"
                          >
                            live
                          </span>
                        ) : (
                          <span
                            title="Exchange feed unavailable — showing a simulated fallback"
                            className="border border-warning/25 bg-warning/10 px-1 text-[9px] font-semibold uppercase tracking-wide text-warning"
                          >
                            sim
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[10.5px] text-ink-faint">
                        {spec.payoutBps / 100}% payout
                      </div>
                    </div>

                    <Sparkline
                      points={sparks[spec.symbol] ?? []}
                      tone={tone}
                      width={48}
                      height={18}
                    />

                    <div className="w-[74px] shrink-0 text-right">
                      <div className="tnum truncate font-mono text-[12.5px] text-ink">
                        {tick ? tick.mid.toFixed(spec.precision) : "—"}
                      </div>
                      <div
                        className={cn(
                          "tnum flex items-center justify-end gap-0.5 font-mono text-[10.5px]",
                          tone === "up" && "text-up",
                          tone === "down" && "text-down",
                          tone === "flat" && "text-ink-faint",
                        )}
                      >
                        {tone === "up" ? (
                          <TrendingUp className="h-2.5 w-2.5" aria-hidden />
                        ) : tone === "down" ? (
                          <TrendingDown className="h-2.5 w-2.5" aria-hidden />
                        ) : null}
                        {change >= 0 ? "+" : "−"}
                        {Math.abs(change).toFixed(2)}%
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
