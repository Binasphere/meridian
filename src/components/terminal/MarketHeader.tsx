"use client";

import { useTick } from "@/lib/hooks";
import type { Instrument } from "@/lib/market/instruments";
import type { ChartStyle } from "@/lib/store";
import type { Resolution } from "@/lib/market/engine";
import { Segmented } from "@/components/ui/primitives";

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
 * Reduced to what you need while a contract is live: which market, what price,
 * and the chart controls. Payout rate, instrument class, trailing change and
 * feed provenance all moved to the account panel — they are things you check
 * once when choosing a market, not things you read while a countdown is
 * running, and every one of them was competing with the price for attention.
 */
export function MarketHeader({
  spec,
  resolution,
  onResolutionChange,
  chartStyle,
  onChartStyleChange,
}: {
  spec: Instrument;
  resolution: Resolution;
  onResolutionChange: (resolution: Resolution) => void;
  chartStyle: ChartStyle;
  onChartStyleChange: (style: ChartStyle) => void;
}) {
  const { tick } = useTick(spec.symbol);

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 sm:gap-4 sm:px-4">
      <div className="min-w-0">
        <h1 className="truncate text-[13px] font-medium tracking-tight text-ink sm:text-[14px]">
          {spec.displayName}
        </h1>
        <div className="truncate font-mono text-[10.5px] text-ink-faint">
          {spec.symbol}
        </div>
      </div>

      <LivePrice price={tick?.mid ?? null} precision={spec.precision} />

      {/* On a narrow phone the interval control can be wider than the space
          left after the price; let this group scroll horizontally rather than
          clip the header. min-w-0 is what allows it to shrink below its
          content and reveal the internal scroll. */}
      <div className="ml-auto flex min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Segmented
          className="hidden shrink-0 sm:inline-flex"
          options={[
            { value: "candles" as const, label: "Candles" },
            { value: "area" as const, label: "Area" },
          ]}
          value={chartStyle}
          onChange={onChartStyleChange}
        />
        <Segmented
          className="shrink-0"
          options={RESOLUTION_OPTIONS}
          value={resolution}
          onChange={onResolutionChange}
        />
      </div>
    </div>
  );
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
      <div className="tnum shrink-0 font-mono text-[20px] text-ink-faint sm:text-[26px]">
        —
      </div>
    );
  }

  const text = price.toFixed(precision);
  const cut = Math.max(0, text.length - 2);

  return (
    <div className="tnum shrink-0 font-mono text-[20px] leading-none tracking-tight sm:text-[26px]">
      <span className="text-ink-secondary">{text.slice(0, cut)}</span>
      <span className="text-ink">{text.slice(cut)}</span>
    </div>
  );
}
