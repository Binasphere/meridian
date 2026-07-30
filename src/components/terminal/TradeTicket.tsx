"use client";

import { ArrowDown, ArrowUp, Minus, Plus, Timer, Wallet } from "lucide-react";
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
import { Button } from "@/components/ui/primitives";
import { ActivityFeed } from "./ActivityFeed";

/**
 * The trade ticket.
 *
 * Two decisions drive the layout:
 *
 * 1. **The ticket states the stake and the expiry, and nothing else.** Neither
 *    the payout rate nor the amount a win would return appears before the
 *    commit; both land with the result.
 *
 * 2. **UP and DOWN are equally weighted.** Neither is styled as the primary
 *    action. An interface that makes one direction more inviting than the other
 *    is nudging a bet, and a 50/50 instrument that visually suggests "up" is a
 *    dark pattern regardless of intent.
 */
// No instrument prop: with the rate gone, nothing on the ticket varies by
// market. The stake, the expiry and the two buttons are the same contract
// whichever symbol is on the chart.
export function TradeTicket() {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const placeTrade = useStore((s) => s.placeTrade);
  const balance = useStore(selectBalance);
  const accountKind = useStore((s) => s.accountKind);

  const tooLow = stakeMinor < MIN_STAKE_MINOR;
  const tooHigh = stakeMinor > MAX_STAKE_MINOR;
  const insufficient = stakeMinor > balance;
  const blocked = tooLow || tooHigh || insufficient;

  // An empty field is not yet a mistake — it blocks the commit without being
  // told off for it. The bounds are stated under the field either way.
  const empty = stakeMinor === 0n;

  const problem = insufficient
    ? "Stake exceeds your balance"
    : empty
      ? null
      : tooLow
        ? `Minimum stake is ${formatMoney(MIN_STAKE_MINOR, { currency: "KSh", whole: true })}`
        : tooHigh
          ? `Maximum stake is ${formatMoney(MAX_STAKE_MINOR, { currency: "KSh", whole: true })}`
          : null;

  const adjust = (delta: bigint) => setStakeMinor(clampStake(stakeMinor + delta));

  const submit = (direction: "UP" | "DOWN") => {
    const result = placeTrade(direction);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    // The press is a user gesture, so this is also where the audio context is
    // unlocked for the later settlement cue.
    playPlace();
    // No toast on placement. The countdown panel is now the confirmation, and
    // stacking a toast on top of it says the same thing twice — while the toast
    // outlives the ten seconds it is describing.
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* --- Stake ---------------------------------------------------------- */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label
            htmlFor="stake"
            className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
          >
            Stake
          </label>
          <span className="tnum font-mono text-[11px] text-ink-faint">
            Bal {formatMoney(balance, { currency: "KSh", compact: true })}
          </span>
        </div>

        <div
          className={cn(
            "flex items-stretch overflow-hidden rounded-none border bg-surface-1 transition-colors",
            // `problem`, not `blocked`: an empty field blocks the commit but is
            // not yet a mistake, and outlining it in red says it is.
            problem ? "border-down/40" : "border-line focus-within:border-line-strong",
          )}
        >
          <button
            onClick={() => adjust(-STAKE_STEP_MINOR)}
            disabled={stakeMinor <= MIN_STAKE_MINOR}
            aria-label="Decrease stake"
            className="grid w-10 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>

          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 border-x border-line px-2">
            <span className="shrink-0 font-mono text-[12px] text-ink-muted">
              KSh
            </span>
            <input
              id="stake"
              inputMode="numeric"
              placeholder="0"
              // Whole shillings, in and out. Typing 1000 means a thousand
              // shillings and reads back as one immediately — see wholeToMinor.
              value={empty ? "" : formatMoney(stakeMinor, { whole: true })}
              onChange={(event) => setStakeMinor(wholeToMinor(event.target.value))}
              className="tnum w-full bg-transparent py-2.5 text-center font-mono text-[17px] tracking-tight text-ink outline-none placeholder:text-ink-faint"
              aria-describedby="stake-bounds"
              aria-invalid={!!problem}
            />
          </div>

          <button
            onClick={() => adjust(STAKE_STEP_MINOR)}
            disabled={stakeMinor >= MAX_STAKE_MINOR}
            aria-label="Increase stake"
            className="grid w-10 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* The bounds, stated up front rather than only in the error that
            appears once you have already got them wrong. This replaced the row
            of one-tap amounts: a quick-stake chip is the interface suggesting a
            number, and on a product that takes money the amount should come
            from the person typing it and nowhere else. */}
        <p
          id="stake-bounds"
          className="tnum mt-2 font-mono text-[10.5px] text-ink-faint"
        >
          Min {formatMoney(MIN_STAKE_MINOR, { currency: "KSh", whole: true })} ·
          Max {formatMoney(MAX_STAKE_MINOR, { currency: "KSh", whole: true })}
        </p>
      </div>

      {/* --- Expiry ----------------------------------------------------------
          Stated, not chosen. Every contract runs ten seconds, so this is a fact
          about the product rather than a control — and a segmented control with
          one option is a control that lies about having a choice. */}
      <div className="flex items-center justify-between border border-line bg-surface-1 px-3 py-2.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Expiry
        </span>
        <span className="tnum flex items-center gap-1.5 font-mono text-[13px] text-ink">
          <Timer className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
          {FIXED_DURATION_SEC}s
        </span>
      </div>

      {/* --- Rate ------------------------------------------------------------
          Neither the payout amount nor the rate is shown before the commit.
          The rate is still what `placeTrade` freezes onto the position and
          what settlement pays against — it is simply not surfaced here. What
          a contract returned lands with the result. */}

      {problem ? (
        <div
          id="stake-problem"
          role="alert"
          className="flex items-center gap-1.5 text-[11.5px] text-down"
        >
          <Wallet className="h-3 w-3 shrink-0" aria-hidden />
          {problem}
        </div>
      ) : null}

      {/* --- Commit --------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2.5">
        <DirectionButton
          direction="UP"
          disabled={blocked}
          onClick={() => submit("UP")}
        />
        <DirectionButton
          direction="DOWN"
          disabled={blocked}
          onClick={() => submit("DOWN")}
        />
      </div>

      <p className="text-center text-[10.5px] leading-relaxed text-ink-faint">
        {accountKind === "DEMO"
          ? "Practice account · no real money at risk"
          : "Live account · capital at risk"}
      </p>

      <ActivityFeed />
    </div>
  );
}

function DirectionButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "UP" | "DOWN";
  disabled: boolean;
  onClick: () => void;
}) {
  const isUp = direction === "UP";
  const Icon = isUp ? ArrowUp : ArrowDown;

  return (
    <Button
      onClick={onClick}
      disabled={disabled}
      size="lg"
      className={cn(
        "h-[52px] flex-col gap-0 rounded-none border font-semibold",
        // Both directions get identical visual weight. Neither is "primary".
        // Deep, solid fills rather than soft tints — see --color-buy/--color-sell.
        isUp
          ? "border-buy bg-buy text-white hover:bg-buy-hover"
          : "border-sell bg-sell text-white hover:bg-sell-hover",
      )}
    >
      <span className="flex items-center gap-1.5 text-[15px]">
        <Icon className="h-4 w-4" aria-hidden />
        {isUp ? "Buy" : "Sell"}
      </span>
    </Button>
  );
}
