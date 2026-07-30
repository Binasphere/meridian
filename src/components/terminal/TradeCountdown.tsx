"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp } from "lucide-react";
import coinImage from "@/app/assets/coin.png";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useNow, useAllTicks } from "@/lib/hooks";
import { useStore } from "@/lib/store";
import { isWinning, type Trade } from "@/lib/trading";

/**
 * The ten seconds after a contract is opened.
 *
 * A fixed-time contract has exactly one moment worth watching, and it is short
 * enough that asking the customer to find their position in a list and follow a
 * 20px ring is asking them to miss it. This puts the clock, the entry, the live
 * price and the direction in one place for the length of the contract, then
 * shows the outcome and gets out of the way.
 *
 * It deliberately does *not* block the terminal: the panel sits at the bottom
 * of the screen and nothing behind it is disabled. A modal here would stop
 * someone opening a second contract for ten seconds, and a countdown that takes
 * the interface hostage is a worse offence than one that is easy to ignore.
 */

/** How long the settled result stays up before the panel dismisses itself. */
const RESULT_LINGER_MS = 3_200;

export function TradeCountdown() {
  const focusTradeId = useStore((s) => s.focusTradeId);
  const dismiss = useStore((s) => s.dismissFocusTrade);
  const trade = useStore((s) =>
    s.focusTradeId ? (s.trades.find((t) => t.id === s.focusTradeId) ?? null) : null,
  );

  const settled = trade !== null && trade.status !== "OPEN";

  // Clear itself once the result has been read. Keyed on the trade id so a
  // second contract placed while the first is showing restarts the timer
  // rather than inheriting the old one's deadline.
  useEffect(() => {
    if (!settled || !focusTradeId) return;
    const timer = setTimeout(dismiss, RESULT_LINGER_MS);
    return () => clearTimeout(timer);
  }, [settled, focusTradeId, dismiss]);

  return (
    <AnimatePresence>
      {trade ? <Panel key={trade.id} trade={trade} onDismiss={dismiss} /> : null}
    </AnimatePresence>
  );
}

function Panel({ trade, onDismiss }: { trade: Trade; onDismiss: () => void }) {
  // 20 ticks a second: the digit changes on the second, but the ring has to
  // move continuously or a 10-second countdown reads as ten separate jumps.
  const now = useNow(50);
  const ticks = useAllTicks();

  const open = trade.status === "OPEN";
  const price = ticks[trade.symbol]?.mid;
  const remainingMs = Math.max(0, trade.expiresAt - now);
  const secondsLeft = Math.ceil(remainingMs / 1000);
  const progress = Math.min(
    1,
    Math.max(0, (now - trade.openedAt) / (trade.durationSec * 1000)),
  );

  const ahead = open && price !== undefined && isWinning(trade, price);
  const won = trade.status === "WON";
  const lost = trade.status === "LOST";

  const tone = open
    ? ahead
      ? "up"
      : "down"
    : won
      ? "up"
      : lost
        ? "down"
        : "neutral";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-0 z-40 mx-auto mb-3 w-[calc(100%-1.5rem)] max-w-[420px]",
        // Clear of the mobile action bar, which owns the very bottom edge.
        "sm:mb-4 max-sm:bottom-[68px]",
      )}
      role="status"
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center gap-3.5 border bg-surface-2/95 p-3.5 shadow-2xl backdrop-blur-md",
          tone === "up" && "border-up/40",
          tone === "down" && "border-down/40",
          tone === "neutral" && "border-line-strong",
        )}
      >
        <Dial
          secondsLeft={secondsLeft}
          progress={progress}
          open={open}
          tone={tone}
          status={trade.status}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex items-center gap-0.5 text-[12.5px] font-semibold",
                trade.direction === "UP" ? "text-up" : "text-down",
              )}
            >
              {trade.direction === "UP" ? (
                <ArrowUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              )}
              {trade.direction === "UP" ? "Buy" : "Sell"}
            </span>
            <span className="truncate text-[12.5px] text-ink">{trade.displayName}</span>
          </div>

          <div className="tnum mt-1 font-mono text-[11.5px] text-ink-muted">
            {formatMoney(BigInt(trade.stakeMinor), { currency: "KSh" })} · entry{" "}
            {trade.openPrice.toFixed(trade.precision)}
          </div>

          <div className="mt-1 text-[11.5px]">
            {open ? (
              price === undefined ? (
                <span className="text-ink-faint">Waiting for price…</span>
              ) : (
                <span className="tnum font-mono">
                  <span className="text-ink-muted">now </span>
                  <span className={ahead ? "text-up" : "text-down"}>
                    {price.toFixed(trade.precision)}
                  </span>
                  <span className={cn("ml-1.5", ahead ? "text-up" : "text-down")}>
                    {ahead ? "ahead" : "behind"}
                  </span>
                </span>
              )
            ) : (
              <Outcome trade={trade} />
            )}
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="self-start text-[11px] text-ink-faint transition-colors hover:text-ink-secondary"
        >
          Hide
        </button>
      </div>
    </motion.div>
  );
}

/**
 * The clock.
 *
 * The number is the signal; the ring is the texture around it. Direction of
 * travel is *down* — the arc empties as the contract runs out, because a bar
 * that fills up reads as progress towards a reward rather than as time running
 * out.
 */
function Dial({
  secondsLeft,
  progress,
  open,
  tone,
  status,
}: {
  secondsLeft: number;
  progress: number;
  open: boolean;
  tone: "up" | "down" | "neutral";
  status: Trade["status"];
}) {
  const size = 46;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const colour =
    tone === "up"
      ? "var(--color-up)"
      : tone === "down"
        ? "var(--color-down)"
        : "var(--color-ink-muted)";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-surface-4)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * progress}
        />
      </svg>

      <div className="absolute inset-0 grid place-items-center">
        {open ? (
          <span className="tnum font-mono text-[17px] leading-none text-ink">
            {secondsLeft}
          </span>
        ) : status === "WON" ? (
          /* The one win, in the one place a win is read.
             It is deliberately not anywhere else in the product: a coin in the
             persistent chrome would be decoration, but here it lands for the
             three seconds the result is up and then leaves with it. The `alt`
             carries the word the image replaced, so the live region still
             announces the outcome. */
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 18 }}
            className="block"
          >
            <Image
              src={coinImage}
              alt="Won"
              width={30}
              height={30}
              className="h-[30px] w-[30px] object-contain drop-shadow-[0_1px_4px_rgba(34,197,94,0.35)]"
              priority
            />
          </motion.span>
        ) : (
          <span
            className={cn(
              "text-[10px] font-semibold uppercase tracking-wide",
              tone === "up" && "text-up",
              tone === "down" && "text-down",
              tone === "neutral" && "text-ink-muted",
            )}
          >
            {status === "LOST" ? "Lost" : status === "TIE" ? "Tie" : "Void"}
          </span>
        )}
      </div>
    </div>
  );
}

function Outcome({ trade }: { trade: Trade }) {
  const pnl = trade.pnlMinor === null ? 0n : BigInt(trade.pnlMinor);

  if (trade.status === "TIE" || trade.status === "VOIDED") {
    return (
      <span className="text-ink-secondary">
        {trade.status === "TIE" ? "Tie — stake refunded" : "Voided — stake refunded"}
      </span>
    );
  }

  return (
    <span className="tnum font-mono">
      <span className="text-ink-muted">close </span>
      <span className="text-ink">
        {trade.closePrice === null ? "—" : trade.closePrice.toFixed(trade.precision)}
      </span>
      <span className={cn("ml-1.5 font-semibold", pnl >= 0n ? "text-up" : "text-down")}>
        {formatMoney(pnl, { currency: "KSh", withSign: true })}
      </span>
    </span>
  );
}
