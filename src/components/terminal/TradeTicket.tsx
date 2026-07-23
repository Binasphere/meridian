"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, Minus, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { DURATIONS, type Instrument } from "@/lib/market/instruments";
import {
  effectivePayoutBps,
  payoutFromStake,
  profitFromStake,
} from "@/lib/trading";
import { selectBalance, useStore } from "@/lib/store";
import { playPlace } from "@/lib/sound";
import { Button, Segmented } from "@/components/ui/primitives";
import { ActivityFeed } from "./ActivityFeed";

const QUICK_STAKES = [10_000n, 25_000n, 50_000n, 100_000n]; // KES 100 / 250 / 500 / 1,000
const STAKE_STEP = 10_000n; // KES 100
const MIN_STAKE = 10_000n;
const MAX_STAKE = 30_000_000n;

/**
 * The trade ticket.
 *
 * Two decisions drive the layout:
 *
 * 1. **The return is shown before the commit, not after.** The single most
 *    important number to a customer is what they get back if they are right,
 *    and it is rendered at full size directly above the buttons rather than
 *    buried in a tooltip.
 *
 * 2. **UP and DOWN are equally weighted.** Neither is styled as the primary
 *    action. An interface that makes one direction more inviting than the other
 *    is nudging a bet, and a 50/50 instrument that visually suggests "up" is a
 *    dark pattern regardless of intent.
 */
export function TradeTicket({ spec }: { spec: Instrument }) {
  const stakeMinor = useStore((s) => BigInt(s.stakeMinor));
  const setStakeMinor = useStore((s) => s.setStakeMinor);
  const durationSec = useStore((s) => s.durationSec);
  const setDuration = useStore((s) => s.setDuration);
  const placeTrade = useStore((s) => s.placeTrade);
  const balance = useStore(selectBalance);
  const accountKind = useStore((s) => s.accountKind);
  const liveTier = useStore((s) => s.liveTier);

  // The rate the customer will actually be booked at — instrument base plus the
  // VIP live-tier bonus, if it applies. Shown in the quote and the badge so what
  // is displayed matches what `placeTrade` freezes onto the contract.
  const payoutBps = effectivePayoutBps(spec.payoutBps, accountKind, liveTier);

  const quote = useMemo(
    () => ({
      profit: profitFromStake(stakeMinor, payoutBps),
      total: payoutFromStake(stakeMinor, payoutBps),
    }),
    [stakeMinor, payoutBps],
  );

  const tooLow = stakeMinor < MIN_STAKE;
  const tooHigh = stakeMinor > MAX_STAKE;
  const insufficient = stakeMinor > balance;
  const blocked = tooLow || tooHigh || insufficient;

  const problem = insufficient
    ? "Stake exceeds your balance"
    : tooLow
      ? `Minimum stake is ${formatMoney(MIN_STAKE, { currency: "KSh" })}`
      : tooHigh
        ? `Maximum stake is ${formatMoney(MAX_STAKE, { currency: "KSh" })}`
        : null;

  const adjust = (delta: bigint) => {
    const next = stakeMinor + delta;
    setStakeMinor(next < MIN_STAKE ? MIN_STAKE : next > MAX_STAKE ? MAX_STAKE : next);
  };

  const submit = (direction: "UP" | "DOWN") => {
    const result = placeTrade(direction);
    if (!result.ok) {
      toast.error(result.reason);
      return;
    }
    // The press is a user gesture, so this is also where the audio context is
    // unlocked for the later settlement cue.
    playPlace();
    toast.success(
      `${direction === "UP" ? "▲ Buy" : "▼ Sell"} · ${spec.short}`,
      {
        description: `${formatMoney(stakeMinor, { currency: "KSh" })} at ${result.trade.openPrice.toFixed(spec.precision)} · settles in ${
          DURATIONS.find((d) => d.seconds === durationSec)?.label ?? `${durationSec}s`
        }`,
      },
    );
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
            blocked ? "border-down/40" : "border-line focus-within:border-line-strong",
          )}
        >
          <button
            onClick={() => adjust(-STAKE_STEP)}
            disabled={stakeMinor <= MIN_STAKE}
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
              inputMode="decimal"
              value={formatMoney(stakeMinor)}
              onChange={(event) => {
                // Read digits only and treat them as minor units, so typing
                // never lands in an intermediate state like "12." that has to
                // be special-cased.
                const digits = event.target.value.replace(/\D/g, "");
                setStakeMinor(digits ? BigInt(digits) : 0n);
              }}
              className="tnum w-full bg-transparent py-2.5 text-center font-mono text-[17px] tracking-tight text-ink outline-none"
              aria-describedby={problem ? "stake-problem" : undefined}
              aria-invalid={blocked}
            />
          </div>

          <button
            onClick={() => adjust(STAKE_STEP)}
            disabled={stakeMinor >= MAX_STAKE}
            aria-label="Increase stake"
            className="grid w-10 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {QUICK_STAKES.map((amount) => (
            <button
              key={amount.toString()}
              onClick={() => setStakeMinor(amount)}
              className={cn(
                "tnum h-7 rounded-none border font-mono text-[11.5px] transition-colors",
                stakeMinor === amount
                  ? "border-line-strong bg-surface-3 text-ink"
                  : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink-secondary",
              )}
            >
              {formatMoney(amount, { compact: true })}
            </button>
          ))}
        </div>
      </div>

      {/* --- Duration ------------------------------------------------------- */}
      <div>
        <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
          Expiry
        </div>
        <Segmented
          className="w-full [&>button]:flex-1"
          options={DURATIONS.map((d) => ({ value: d.seconds, label: d.label }))}
          value={durationSec}
          onChange={setDuration}
        />
      </div>

      {/* --- Quote ---------------------------------------------------------- */}
      <div className="rounded-none border border-line bg-surface-1 p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
            Payout if correct
          </span>
          <span className="tnum rounded-none bg-up/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-up">
            +{payoutBps / 100}%
          </span>
        </div>

        <motion.div
          key={quote.total.toString()}
          initial={{ opacity: 0.55 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.18 }}
          className="tnum mt-1.5 font-mono text-[26px] leading-none tracking-tight text-ink"
        >
          {formatMoney(quote.total, { currency: "KSh" })}
        </motion.div>

        <div className="tnum mt-1.5 font-mono text-[11.5px] text-ink-muted">
          {formatMoney(stakeMinor)} stake + {formatMoney(quote.profit)} profit
        </div>
      </div>

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
