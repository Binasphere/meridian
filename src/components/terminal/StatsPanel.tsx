"use client";

import { useMemo } from "react";
import { formatMoney } from "@/lib/format";
import { computeStats } from "@/lib/trading";
import { useHistory } from "@/lib/store";
import { Empty, Stat } from "@/components/ui/primitives";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Session statistics.
 *
 * Deliberately includes the numbers a trader would rather not look at — the
 * break-even rate they need and how far under it they are. A platform that only
 * surfaces wins is training a habit rather than serving a customer.
 */
export function StatsPanel() {
  const history = useHistory();
  const stats = useMemo(() => computeStats(history), [history]);

  if (stats.total === 0) {
    return (
      <Empty
        icon={<BarChart3 className="h-5 w-5" />}
        title="No settled contracts yet"
        hint="Your strike rate, net result and required break-even appear here after your first settlement."
      />
    );
  }

  // Weighted break-even across the payouts actually traded, rather than a
  // headline rate that may not match what this trader has been taking.
  const averagePayoutBps =
    history.reduce((sum, t) => sum + t.payoutBps, 0) / history.length;
  const breakEven = (1 / (1 + averagePayoutBps / 10_000)) * 100;
  const above = stats.winRate >= breakEven;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Net result"
          value={formatMoney(stats.netMinor, { withSign: true })}
          tone={
            stats.netMinor > 0n ? "up" : stats.netMinor < 0n ? "down" : "neutral"
          }
          hint={`${stats.total} settled`}
        />
        <Stat
          label="Strike rate"
          value={`${stats.winRate.toFixed(1)}%`}
          hint={`${stats.won}W · ${stats.lost}L${stats.tied ? ` · ${stats.tied}T` : ""}`}
        />
      </div>

      {/* Strike rate against the rate that actually breaks even. A bar, because
          the only thing that matters is which side of the line you are on. */}
      <div className="rounded-none border border-line bg-surface-1 p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
            Versus break-even
          </span>
          <span className="tnum font-mono text-[11px] text-ink-muted">
            need {breakEven.toFixed(1)}%
          </span>
        </div>

        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-4">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              above ? "bg-up" : "bg-down",
            )}
            style={{ width: `${Math.min(100, stats.winRate)}%` }}
          />
          {/* The threshold marker sits on top, so the comparison is spatial and
              does not depend on reading two numbers. */}
          <div
            className="absolute top-0 h-full w-[2px] bg-ink"
            style={{ left: `${Math.min(100, breakEven)}%` }}
            aria-hidden
          />
        </div>

        <p
          className={cn(
            "mt-2.5 text-[11.5px] leading-relaxed",
            above ? "text-up" : "text-down",
          )}
        >
          {above
            ? `▲ ${(stats.winRate - breakEven).toFixed(1)} points above break-even.`
            : `▼ ${(breakEven - stats.winRate).toFixed(1)} points below break-even — this run loses money if it continues.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat
          label="Volume staked"
          value={formatMoney(stats.volumeMinor, { compact: true })}
        />
        <Stat
          label="Avg stake"
          value={formatMoney(
            stats.total > 0 ? stats.volumeMinor / BigInt(stats.total) : 0n,
            { compact: true },
          )}
        />
        <Stat
          label="Best"
          value={formatMoney(stats.bestMinor, { withSign: true })}
          tone={stats.bestMinor > 0n ? "up" : "neutral"}
        />
        <Stat
          label="Worst"
          value={formatMoney(stats.worstMinor, { withSign: true })}
          tone={stats.worstMinor < 0n ? "down" : "neutral"}
        />
      </div>
    </div>
  );
}
