"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/format";
import { useStore } from "@/lib/store";

/**
 * Drives settlement.
 *
 * Runs on an interval rather than a timer per contract: a hundred open
 * positions should be one sweep, not a hundred pending timeouts. `settleDue` is
 * idempotent, so a missed or doubled sweep — a backgrounded tab, a throttled
 * timer — changes nothing.
 *
 * Rendered once by the terminal. It draws nothing.
 */
export function SettlementDriver() {
  const settleDue = useStore((s) => s.settleDue);

  useEffect(() => {
    const id = setInterval(() => {
      for (const trade of settleDue()) {
        const pnl = BigInt(trade.pnlMinor ?? "0");
        const closed = trade.closePrice?.toFixed(trade.precision) ?? "—";

        if (trade.status === "WON") {
          toast.success(`▲ Won · ${trade.symbol}`, {
            description: `${formatMoney(pnl, { currency: "KSh", withSign: true })} · closed at ${closed}`,
          });
        } else if (trade.status === "LOST") {
          toast.error(`▼ Lost · ${trade.symbol}`, {
            description: `${formatMoney(pnl, { currency: "KSh" })} · closed at ${closed}`,
          });
        } else {
          toast(`Refunded · ${trade.symbol}`, {
            description:
              trade.status === "TIE"
                ? "Closed exactly at entry — stake returned in full."
                : "Contract voided — stake returned in full.",
          });
        }
      }
    }, 250);

    return () => clearInterval(id);
  }, [settleDue]);

  return null;
}
