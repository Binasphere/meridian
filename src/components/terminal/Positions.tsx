"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, Inbox, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCountdown, formatMoney, formatTime } from "@/lib/format";
import { useAllTicks, useNow } from "@/lib/hooks";
import { computeStats, isWinning, type Trade } from "@/lib/trading";
import { useHistory, useOpenTrades } from "@/lib/store";
import { Empty, Segmented } from "@/components/ui/primitives";

type Tab = "open" | "history";

export function Positions() {
  const [tab, setTab] = useState<Tab>("open");
  const open = useOpenTrades();
  const history = useHistory();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-line px-3">
        <Segmented
          options={[
            {
              value: "open" as const,
              label: (
                <span className="flex items-center gap-1.5">
                  Positions
                  {open.length > 0 ? (
                    <span className="tnum rounded-none bg-accent/20 px-1 font-mono text-[10px] text-accent">
                      {open.length}
                    </span>
                  ) : null}
                </span>
              ),
            },
            { value: "history" as const, label: "History" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <SessionSummary trades={history} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "open" ? (
          <OpenList trades={open} />
        ) : (
          <HistoryList trades={history} />
        )}
      </div>
    </div>
  );
}

function SessionSummary({ trades }: { trades: Trade[] }) {
  const stats = useMemo(() => computeStats(trades), [trades]);
  if (stats.total === 0) return null;

  const positive = stats.netMinor > 0n;
  const negative = stats.netMinor < 0n;

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="text-ink-faint">
        <span className="tnum font-mono text-ink-secondary">
          {stats.winRate.toFixed(0)}%
        </span>{" "}
        win rate
      </span>
      <span
        className={cn(
          "tnum font-mono font-medium",
          positive && "text-up",
          negative && "text-down",
          !positive && !negative && "text-ink-secondary",
        )}
      >
        {positive ? "▲ " : negative ? "▼ " : ""}
        {formatMoney(stats.netMinor, { withSign: true })}
      </span>
    </div>
  );
}

function OpenList({ trades }: { trades: Trade[] }) {
  const now = useNow(200);
  const ticks = useAllTicks();

  if (trades.length === 0) {
    return (
      <Empty
        icon={<Timer className="h-5 w-5" />}
        title="No open positions"
        hint="Place a contract and it will appear here with a live countdown."
      />
    );
  }

  return (
    <div className="divide-y divide-line">
      <AnimatePresence initial={false}>
        {trades.map((trade) => {
          const price = ticks[trade.symbol]?.mid;
          const winning = price !== undefined && isWinning(trade, price);
          const remaining = trade.expiresAt - now;
          const elapsed = now - trade.openedAt;
          const progress = Math.min(
            1,
            Math.max(0, elapsed / (trade.durationSec * 1000)),
          );
          const stake = BigInt(trade.stakeMinor);
          const delta =
            price === undefined ? 0 : price - trade.openPrice;

          return (
            <motion.div
              key={trade.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 px-3 py-2.5"
            >
              <CountdownRing progress={progress} winning={winning} />

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "flex items-center gap-0.5 text-[12px] font-semibold",
                      trade.direction === "UP" ? "text-up" : "text-down",
                    )}
                  >
                    {trade.direction === "UP" ? (
                      <ArrowUp className="h-3 w-3" aria-hidden />
                    ) : (
                      <ArrowDown className="h-3 w-3" aria-hidden />
                    )}
                    {trade.symbol}
                  </span>
                  <span className="tnum font-mono text-[11px] text-ink-faint">
                    @ {trade.openPrice.toFixed(trade.precision)}
                  </span>
                </div>
                <div className="tnum mt-0.5 font-mono text-[11px] text-ink-muted">
                  {formatMoney(stake, { currency: "KSh" })} ·{" "}
                  {price === undefined ? (
                    "—"
                  ) : (
                    <span className={winning ? "text-up" : "text-down"}>
                      {delta >= 0 ? "+" : "−"}
                      {Math.abs(delta).toFixed(trade.precision)}
                    </span>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div
                  className={cn(
                    "tnum font-mono text-[13px] font-medium",
                    remaining < 5_000 ? "text-warning" : "text-ink",
                  )}
                >
                  {formatCountdown(remaining)}
                </div>
                {/* The verdict is spelled out, not implied by colour alone. */}
                <div
                  className={cn(
                    "text-[10px] font-medium uppercase tracking-wide",
                    winning ? "text-up" : "text-down",
                  )}
                >
                  {winning ? "▲ winning" : "▼ losing"}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/**
 * Time-to-expiry as a ring.
 *
 * A depleting ring reads as "time running out" pre-attentively in a way a
 * number cannot; the number stays beside it for the precision.
 */
function CountdownRing({
  progress,
  winning,
}: {
  progress: number;
  winning: boolean;
}) {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="relative h-8 w-8 shrink-0">
      <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90" aria-hidden>
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke="var(--color-surface-4)"
          strokeWidth="2"
        />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={winning ? "var(--color-up)" : "var(--color-down)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * progress}
          className="transition-[stroke-dashoffset] duration-200 ease-linear"
        />
      </svg>
    </div>
  );
}

function HistoryList({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <Empty
        icon={<Inbox className="h-5 w-5" />}
        title="Nothing settled yet"
        hint="Every contract you close is listed here with its entry, exit and result."
      />
    );
  }

  return (
    <table className="w-full text-left">
      <thead className="sticky top-0 z-10 bg-surface-1/95 backdrop-blur">
        <tr className="text-[10px] uppercase tracking-[0.08em] text-ink-faint">
          <th className="px-3 py-1.5 font-medium">Market</th>
          <th className="px-3 py-1.5 font-medium">Entry</th>
          <th className="px-3 py-1.5 font-medium">Exit</th>
          <th className="px-3 py-1.5 text-right font-medium">Stake</th>
          <th className="px-3 py-1.5 text-right font-medium">Result</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {trades.map((trade) => {
          const pnl = BigInt(trade.pnlMinor ?? "0");
          const won = trade.status === "WON";
          const lost = trade.status === "LOST";

          return (
            <tr key={trade.id} className="text-[12px]">
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "font-mono text-[11px]",
                      trade.direction === "UP" ? "text-up" : "text-down",
                    )}
                    aria-label={trade.direction === "UP" ? "Buy" : "Sell"}
                  >
                    {trade.direction === "UP" ? "▲" : "▼"}
                  </span>
                  <span className="font-medium text-ink-secondary">
                    {trade.symbol}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-ink-faint">
                  {trade.settledAt ? formatTime(new Date(trade.settledAt).toISOString()) : "—"}
                </div>
              </td>
              <td className="tnum px-3 py-2 font-mono text-[11px] text-ink-muted">
                {trade.openPrice.toFixed(trade.precision)}
              </td>
              <td className="tnum px-3 py-2 font-mono text-[11px] text-ink-muted">
                {trade.closePrice === null
                  ? "—"
                  : trade.closePrice.toFixed(trade.precision)}
              </td>
              <td className="tnum px-3 py-2 text-right font-mono text-[11px] text-ink-muted">
                {formatMoney(trade.stakeMinor)}
              </td>
              <td className="px-3 py-2 text-right">
                <div
                  className={cn(
                    "tnum font-mono text-[12px] font-medium",
                    won && "text-up",
                    lost && "text-down",
                    !won && !lost && "text-ink-secondary",
                  )}
                >
                  {formatMoney(pnl, { withSign: true })}
                </div>
                <div className="text-[9.5px] uppercase tracking-wide text-ink-faint">
                  {trade.status === "TIE"
                    ? "refunded"
                    : trade.status === "VOIDED"
                      ? "voided"
                      : trade.status.toLowerCase()}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
