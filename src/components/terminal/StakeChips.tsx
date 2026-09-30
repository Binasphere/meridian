"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";

/** One tap to fill the stake. All inside the MIN/MAX stake bounds. */
export const QUICK_STAKES_MINOR = [10_000n, 50_000n, 100_000n, 500_000n] as const;

export function StakeChips({
  value,
  onPick,
  className,
}: {
  value: bigint;
  onPick: (minor: bigint) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-4 gap-1.5", className)}>
      {QUICK_STAKES_MINOR.map((amount) => (
        <button
          key={amount.toString()}
          type="button"
          onClick={() => onPick(amount)}
          aria-pressed={value === amount}
          className={cn(
            "tnum h-8 border font-mono text-[12px] transition-colors",
            value === amount
              ? "border-ink bg-ink font-semibold text-surface-1"
              : "border-line-strong text-ink-secondary hover:text-ink",
          )}
        >
          {formatMoney(amount, { whole: true })}
        </button>
      ))}
    </div>
  );
}
