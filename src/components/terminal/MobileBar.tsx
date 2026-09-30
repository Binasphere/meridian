"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Timer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, wholeToMinor } from "@/lib/format";
import { FIXED_DURATION_SEC } from "@/lib/market/instruments";
import {
  clampStake,
  MAX_STAKE_MINOR,
  MIN_STAKE_MINOR,
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
 * how much, and which way. Markets, positions, wallet and profile are the tab
 * bar's job, directly beneath it.
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

  // An empty field blocks the commit without being marked wrong for it —
  // outlining a box someone has not finished filling in is scolding them for
  // the form's own state.
  const empty = stakeMinor === 0n;
  const wrong = insufficient && !empty;

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
    /* Stake, then direction: the two commits sit at the bottom of the screen,
       directly above the tab bar, where the thumb already rests. The balance
       is in the header chip, so nothing else needs to live down here. */
    <div className="shrink-0 border-t border-line bg-surface-1 lg:hidden">
      {/* --- Stake ---------------------------------------------------------- */}
      <div className="px-3 pt-2.5">
        <div className="mb-1.5 flex items-baseline gap-3">
          <label
            htmlFor="mobile-stake"
            className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-muted"
          >
            Stake
          </label>

          {/* Expiry is fixed at ten seconds — stated as a fact, not a control
              you can press and have nothing happen. */}
          <span className="tnum ml-auto flex shrink-0 items-center gap-1 font-mono text-[11px] text-ink-muted">
            <Timer className="h-3 w-3" aria-hidden />
            {FIXED_DURATION_SEC}s expiry
          </span>
        </div>

        <div
          className={cn(
            "flex h-11 items-stretch border bg-surface-1 transition-colors",
            wrong
              ? "border-down/60"
              : "border-line-strong focus-within:border-accent",
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
              placeholder="0"
              // Whole shillings, in and out — the same contract the desktop
              // ticket types under. See wholeToMinor.
              value={empty ? "" : formatMoney(stakeMinor, { whole: true })}
              onChange={(event) => setStakeMinor(wholeToMinor(event.target.value))}
              // Already ≥16px, so the touch floor in globals.css would only shrink it.
              data-keep-size
              className="tnum w-full min-w-0 bg-transparent text-center font-mono text-[17px] font-medium tracking-tight text-ink outline-none placeholder:text-ink-faint"
              aria-describedby="mobile-stake-bounds"
              aria-invalid={wrong}
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

        <p
          id="mobile-stake-bounds"
          className={cn(
            "tnum mt-1 text-center font-mono text-[10.5px]",
            wrong && stakeMinor > balance ? "text-down" : "text-ink-faint",
          )}
        >
          {wrong && stakeMinor > balance
            ? "Stake exceeds your balance"
            : `Min ${formatMoney(MIN_STAKE_MINOR, { currency: "KSh", whole: true })} · Max ${formatMoney(MAX_STAKE_MINOR, { currency: "KSh", whole: true })}`}
        </p>
      </div>

      {/* --- Commit --------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2 px-3 pb-2.5 pt-2">
        <button
          onClick={() => submit("UP")}
          disabled={insufficient}
          className="flex h-[52px] items-center justify-center gap-1.5 bg-buy text-[15px] font-semibold text-white transition-colors active:bg-buy-hover disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          Buy
        </button>
        <button
          onClick={() => submit("DOWN")}
          disabled={insufficient}
          className="flex h-[52px] items-center justify-center gap-1.5 bg-sell text-[15px] font-semibold text-white transition-colors active:bg-sell-hover disabled:opacity-40"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
          Sell
        </button>
      </div>
    </div>
  );
}
