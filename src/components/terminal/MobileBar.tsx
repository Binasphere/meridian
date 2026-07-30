"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { FIXED_DURATION_SEC } from "@/lib/market/instruments";
import {
  clampStake,
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
  QUICK_STAKES_MINOR,
  STAKE_STEP_MINOR,
} from "@/lib/trading";
import { selectBalance, useStore } from "@/lib/store";
import { playPlace } from "@/lib/sound";

/**
 * The mobile trading bar.
 *
 * Phones are the majority of this market, so the small-screen layout is a
 * designed thing rather than a reflow of the desktop grid. The chart keeps the
 * screen, and the bar within thumb reach holds only what a contract is made of:
 * how much, and which way. Browsing markets moved onto the chart header, where
 * the instrument name is already the thing you would reach for; positions live
 * on the account pages, and the running contract announces itself.
 *
 * There is exactly one chart instance in the app — this bar and the desktop
 * rail arrange the *same* mounted chart rather than each rendering their own,
 * which is why the layout switches with CSS and not with a media-query branch
 * that would remount the canvas.
 *
 * It takes no instrument: everything the bar decides — how much, which way — is
 * the same whatever is on the chart, and `placeTrade` reads the live symbol
 * from the store when it books.
 */
export function MobileBar() {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const placeTrade = useStore((s) => s.placeTrade);
  const balance = useStore(selectBalance);

  // The same three refusals the desktop ticket applies, so a stake accepted on
  // one screen size is accepted on the other.
  const insufficient =
    stakeMinor > balance ||
    stakeMinor < MIN_STAKE_MINOR ||
    stakeMinor > MAX_STAKE_MINOR;

  const adjust = (delta: bigint) => setStakeMinor(clampStake(stakeMinor + delta));

  const submit = (direction: "UP" | "DOWN") => {
    const result = placeTrade(direction);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    playPlace();
    // The countdown panel confirms the contract; a toast would say it twice.
  };

  return (
    /* Fills whatever the chart left, and distributes it rather than pooling it
       into one dead band: the commits sit directly under the chart and the
       stake sits at the bottom, in easy thumb reach. `min-h-0` so a short
       viewport shrinks this instead of overflowing the page. */
    <div className="flex min-h-0 flex-1 flex-col justify-between overflow-y-auto border-t border-line bg-surface-1 lg:hidden">
      {/* --- Commit ---------------------------------------------------------
          Direction first, amount under it: the thumb rests at the bottom of a
          phone, and the two full-width targets are what the hand reaches for
          most. The stake is set once and re-used across contracts, so it sits
          in the calmer position underneath. */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-2 pt-2.5">
        <button
          onClick={() => submit("UP")}
          disabled={insufficient}
          className="flex h-12 items-center justify-center gap-1.5 rounded-none border border-buy bg-buy text-[15px] font-semibold text-white transition-colors active:bg-buy-hover disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          Buy
        </button>
        <button
          onClick={() => submit("DOWN")}
          disabled={insufficient}
          className="flex h-12 items-center justify-center gap-1.5 rounded-none border border-sell bg-sell text-[15px] font-semibold text-white transition-colors active:bg-sell-hover disabled:opacity-40"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
          Sell
        </button>
      </div>

      {/* --- Stake ---------------------------------------------------------- */}
      <div
        className="px-3 pb-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mb-1.5 flex items-baseline gap-3">
          <label
            htmlFor="mobile-stake"
            className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-ink-muted"
          >
            Stake
          </label>

          {/* Expiry is fixed at ten seconds — stated as a fact, not a control
              you can press and have nothing happen. */}
          <span className="tnum ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink-faint">
            <Timer className="h-3 w-3" aria-hidden />
            {FIXED_DURATION_SEC}s
          </span>
        </div>

        <div
          className={cn(
            "flex items-stretch border bg-surface-2 transition-colors",
            insufficient
              ? "border-down/40"
              : "border-line focus-within:border-line-strong",
          )}
        >
          <button
            onClick={() => adjust(-STAKE_STEP_MINOR)}
            disabled={stakeMinor <= MIN_STAKE_MINOR}
            aria-label="Decrease stake"
            className="grid w-11 shrink-0 place-items-center text-ink-muted active:bg-surface-3 disabled:opacity-30"
          >
            <Minus className="h-4 w-4" />
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 border-x border-line px-2">
            <span className="shrink-0 font-mono text-[12px] text-ink-muted">
              KSh
            </span>
            <input
              id="mobile-stake"
              inputMode="numeric"
              value={formatMoney(stakeMinor)}
              onChange={(event) => {
                // Digits only, read as minor units, so typing never lands in an
                // intermediate state like "12." that has to be special-cased.
                const digits = event.target.value.replace(/\D/g, "");
                setStakeMinor(digits ? BigInt(digits) : 0n);
              }}
              className="tnum w-full bg-transparent py-2.5 text-center font-mono text-[17px] tracking-tight text-ink outline-none"
              aria-invalid={insufficient}
            />
          </div>

          <button
            onClick={() => adjust(STAKE_STEP_MINOR)}
            disabled={stakeMinor >= MAX_STAKE_MINOR}
            aria-label="Increase stake"
            className="grid w-11 shrink-0 place-items-center text-ink-muted active:bg-surface-3 disabled:opacity-30"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          {QUICK_STAKES_MINOR.map((amount) => (
            <Chip
              key={amount.toString()}
              active={stakeMinor === amount}
              onClick={() => setStakeMinor(amount)}
            >
              {formatMoney(amount, { compact: true })}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "tnum h-8 rounded-none border font-mono text-[12px] transition-colors",
        active
          ? "border-line-strong bg-surface-3 text-ink"
          : "border-line bg-surface-1 text-ink-muted active:bg-surface-2",
      )}
    >
      {children}
    </button>
  );
}
