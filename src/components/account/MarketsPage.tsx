"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { market } from "@/lib/market/engine";
import { useStore } from "@/lib/store";
import { Watchlist } from "@/components/terminal/Watchlist";

/**
 * Every market, as a page of its own. Choosing one opens it on the terminal.
 */
export function MarketsPage() {
  const router = useRouter();
  const symbol = useStore((s) => s.symbol);
  const setSymbol = useStore((s) => s.setSymbol);

  // Prices stream from the same engine the terminal uses.
  useEffect(() => {
    market();
  }, []);

  return (
    <div className="mx-auto h-[calc(100dvh-220px)] max-w-[720px] border border-line bg-surface-1 lg:h-full">
      <Watchlist
        active={symbol}
        variant="picker"
        onSelect={(next) => {
          setSymbol(next);
          router.push("/");
        }}
      />
    </div>
  );
}
