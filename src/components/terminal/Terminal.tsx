"use client";

import { useEffect } from "react";
import { instrument } from "@/lib/market/instruments";
import { market } from "@/lib/market/engine";
import { useAuth, useAuthHydrated } from "@/lib/auth";
import { useOpenTrades, useStore } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { Panel } from "@/components/ui/primitives";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { TopBar } from "./TopBar";
import { MarketHeader } from "./MarketHeader";
import { PriceChart } from "./PriceChart";
import { Watchlist } from "./Watchlist";
import { Positions } from "./Positions";
import { TradeTicket } from "./TradeTicket";
import { MobileBar } from "./MobileBar";
import { SettlementDriver } from "./SettlementDriver";

/**
 * The terminal.
 *
 * Three columns: markets on the left to choose from, price in the middle to
 * read, ticket on the right to act on. Nothing scrolls except the lists —
 * hunting for the Higher button is not an acceptable cost of having scrolled.
 *
 * Small screens rearrange the *same* mounted components rather than swapping in
 * a parallel mobile tree, so the chart is mounted exactly once and rotating a
 * phone does not tear down and rebuild the canvas.
 */
export function Terminal() {
  const mounted = useMounted();
  const authHydrated = useAuthHydrated();
  const currentPhone = useAuth((s) => s.currentPhone);

  const symbol = useStore((s) => s.symbol);
  const setSymbol = useStore((s) => s.setSymbol);
  const resolution = useStore((s) => s.resolution);
  const setResolution = useStore((s) => s.setResolution);
  const chartStyle = useStore((s) => s.chartStyle);
  const setChartStyle = useStore((s) => s.setChartStyle);
  const openTrades = useOpenTrades();

  // Start the market as soon as the terminal mounts, so history is accumulating
  // before the chart asks for it.
  useEffect(() => {
    if (mounted) market();
  }, [mounted]);

  // Hold the first paint until localStorage has been read. Rendering the auth
  // screen and then swapping it for the terminal a frame later would flash the
  // sign-in form at every already-signed-in user on every reload.
  if (!mounted || !authHydrated) return <Boot />;
  if (!currentPhone) return <AuthScreen />;

  const spec = instrument(symbol);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      <TopBar />
      <SettlementDriver />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-line lg:grid-cols-[236px_minmax(0,1fr)_300px]">
        {/* --- Markets ------------------------------------------------------ */}
        <Panel
          flat
          className="hidden min-h-0 overflow-hidden border-0 lg:flex lg:flex-col"
        >
          <Watchlist active={symbol} onSelect={setSymbol} />
        </Panel>

        {/* --- Chart + positions -------------------------------------------- */}
        <div className="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-px bg-line lg:grid-rows-[minmax(0,1fr)_220px]">
          <Panel flat className="flex min-h-0 flex-col overflow-hidden border-0">
            <MarketHeader
              spec={spec}
              resolution={resolution}
              onResolutionChange={setResolution}
              chartStyle={chartStyle}
              onChartStyleChange={setChartStyle}
            />
            <div className="min-h-0 flex-1">
              <PriceChart
                symbol={symbol}
                resolution={resolution}
                style={chartStyle}
                precision={spec.precision}
                openTrades={openTrades}
              />
            </div>
          </Panel>

          <Panel
            flat
            className="hidden min-h-0 flex-col overflow-hidden border-0 lg:flex"
          >
            <Positions />
          </Panel>
        </div>

        {/* --- Ticket ------------------------------------------------------- */}
        <Panel
          flat
          className="hidden min-h-0 overflow-y-auto border-0 lg:block"
        >
          <TradeTicket spec={spec} />
        </Panel>
      </div>

      {/* --- Phones --------------------------------------------------------- */}
      <MobileBar spec={spec} />
    </div>
  );
}

/** Held for the frame before localStorage is readable. */
function Boot() {
  return (
    <div className="relative grid min-h-dvh place-items-center bg-base">
      <div className="grid-noise absolute inset-0 opacity-25" aria-hidden />
    </div>
  );
}
