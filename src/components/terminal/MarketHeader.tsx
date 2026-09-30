"use client";

import { useEffect, useRef, useState } from "react";
import { ChartArea, ChartCandlestick, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTick } from "@/lib/hooks";
import { market, type Resolution } from "@/lib/market/engine";
import type { Instrument } from "@/lib/market/instruments";
import type { ChartStyle } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { Watchlist } from "./Watchlist";
import { CoinIcon } from "./CoinIcon";

const RESOLUTION_OPTIONS: ReadonlyArray<{ value: Resolution; label: string }> = [
  { value: 5, label: "5s" },
  { value: 15, label: "15s" },
  { value: 60, label: "1m" },
  { value: 300, label: "5m" },
  { value: 900, label: "15m" },
];

/**
 * The chart header.
 *
 * Two rows. The first says which market and what it costs; the second holds
 * the chart's own controls — interval and style — on a line of their own, so
 * the price never has to share its width with a row of buttons.
 *
 * The pair name is the way to a different market on every screen size: it
 * opens a list anchored beneath it, searchable, the way a trading app's symbol
 * picker behaves. The bottom tab bar's Markets tab opens the same list.
 */
export function MarketHeader({
  spec,
  onSelectSymbol,
  resolution,
  onResolutionChange,
  chartStyle,
  onChartStyleChange,
}: {
  spec: Instrument;
  onSelectSymbol: (symbol: string) => void;
  resolution: Resolution;
  onResolutionChange: (resolution: Resolution) => void;
  chartStyle: ChartStyle;
  onChartStyleChange: (style: ChartStyle) => void;
}) {
  const { tick } = useTick(spec.symbol);
  const change = useChange(spec.symbol);
  const open = useUi((s) => s.marketsOpen);
  const setOpen = useUi((s) => s.setMarketsOpen);

  return (
    <div className="shrink-0 border-b border-line">
      {/* --- Market + price ------------------------------------------------ */}
      <div className="relative flex h-14 items-center gap-3 px-3 sm:px-4">
        <button
          onClick={() => setOpen(!open)}
          aria-label="Change market"
          aria-expanded={open}
          className={cn(
            "flex h-10 min-w-0 items-center gap-2 border px-2.5 text-left transition-colors",
            open
              ? "border-accent bg-surface-1"
              : "border-line bg-surface-1 hover:border-line-strong",
          )}
        >
          <CoinIcon short={spec.short} size={22} />
          <h1 className="truncate text-[14px] font-semibold tracking-tight text-ink">
            {spec.short}/USD
          </h1>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>

        <div className="ml-auto flex items-baseline gap-2">
          <LivePrice price={tick?.mid ?? null} precision={spec.precision} />
          <span
            className={cn(
              "tnum font-mono text-[11.5px] font-medium",
              change > 0 ? "text-up" : change < 0 ? "text-down" : "text-ink-faint",
            )}
          >
            {change >= 0 ? "+" : "−"}
            {Math.abs(change).toFixed(2)}%
          </span>
        </div>

        {open ? (
          <MarketPicker
            active={spec.symbol}
            onClose={() => setOpen(false)}
            onSelect={(symbol) => {
              onSelectSymbol(symbol);
              setOpen(false);
            }}
          />
        ) : null}
      </div>

      {/* --- Interval + style ------------------------------------------------ */}
      <div className="flex h-10 items-center gap-1 border-t border-line px-2 sm:px-3">
        <div role="tablist" aria-label="Candle interval" className="flex items-center gap-1">
          {RESOLUTION_OPTIONS.map((option) => {
            const active = option.value === resolution;
            return (
              <button
                key={option.value}
                role="tab"
                aria-selected={active}
                onClick={() => onResolutionChange(option.value)}
                className={cn(
                  "tnum h-7 min-w-[38px] border px-2 font-mono text-[12px] transition-colors",
                  active
                    ? "border-line-strong bg-surface-1 font-semibold text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1" role="tablist" aria-label="Chart style">
          {(
            [
              { value: "candles", label: "Candles", Icon: ChartCandlestick },
              { value: "area", label: "Area", Icon: ChartArea },
            ] as const
          ).map(({ value, label, Icon }) => {
            const active = chartStyle === value;
            return (
              <button
                key={value}
                role="tab"
                aria-selected={active}
                aria-label={label}
                title={label}
                onClick={() => onChartStyleChange(value)}
                className={cn(
                  "grid h-7 w-8 place-items-center border transition-colors",
                  active
                    ? "border-line-strong bg-surface-1 text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * The markets list, dropped from the pair button.
 *
 * Anchored rather than a full-screen sheet: the chart stays in view behind it,
 * so choosing a market reads as changing what the chart shows rather than
 * leaving it. Escape and a tap outside both close it.
 */
function MarketPicker({
  active,
  onSelect,
  onClose,
}: {
  active: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Focus the search on a mouse; on a phone that would throw up the keyboard
  // over the list the customer came to scroll.
  const [finePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches,
  );

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!ref.current || !target) return;
      if (ref.current.contains(target)) return;
      // The pair button toggles on its own; closing here too would reopen it.
      if (target.closest('[aria-label="Change market"]')) return;
      // The bottom tab that opened it does the same.
      if (target.closest("[data-markets-toggle]")) return;
      onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Markets"
      className={cn(
        "rise-in absolute left-3 top-[52px] z-40 flex flex-col sm:left-4",
        "h-[min(460px,62dvh)] w-[min(360px,calc(100vw-24px))]",
        "border border-line bg-surface-1 shadow-[0_12px_32px_-8px_rgba(8,12,24,0.28)]",
      )}
    >
      <Watchlist
        active={active}
        onSelect={onSelect}
        variant="picker"
        autoFocus={finePointer}
      />
    </div>
  );
}

/** Trailing 15-minute change, refreshed on the watchlist's slow cadence. */
function useChange(symbol: string): number {
  const [change, setChange] = useState(0);
  useEffect(() => {
    const engine = market();
    const compute = () => setChange(engine.changePercent(symbol, 900));
    compute();
    const id = setInterval(compute, 2_000);
    return () => clearInterval(id);
  }, [symbol]);
  return change;
}

/**
 * The live price.
 *
 * Static colour, no flash, no background. The last two digits are set a shade
 * brighter than the leading ones — those are the digits that actually move, and
 * separating them lets the eye track motion without recolouring anything.
 */
function LivePrice({
  price,
  precision,
}: {
  price: number | null;
  precision: number;
}) {
  if (price === null) {
    return (
      <div className="tnum shrink-0 font-mono text-[20px] text-ink-faint sm:text-[24px]">
        —
      </div>
    );
  }

  const text = price.toFixed(precision);
  const cut = Math.max(0, text.length - 2);

  return (
    <div className="tnum shrink-0 font-mono text-[20px] font-medium leading-none tracking-tight sm:text-[24px]">
      <span className="text-ink-secondary">{text.slice(0, cut)}</span>
      <span className="text-ink">{text.slice(cut)}</span>
    </div>
  );
}
