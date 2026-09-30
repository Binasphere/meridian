"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChartCandlestick,
  ChartNoAxesCombined,
  CircleUserRound,
  ListOrdered,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenTrades } from "@/lib/store";
import { useUi } from "@/lib/ui";

/**
 * The phone's tab bar: five destinations, always on the bottom edge.
 *
 * Markets is the one tab that is not a page — it opens the symbol picker over
 * the chart, because choosing a market is something you do *to* the chart.
 * From any other page it goes back to the terminal first.
 */
export function BottomTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const marketsOpen = useUi((s) => s.marketsOpen);
  const setMarketsOpen = useUi((s) => s.setMarketsOpen);
  const openCount = useOpenTrades().length;

  const onTerminal = pathname === "/";

  return (
    <nav
      aria-label="Main"
      className="grid shrink-0 grid-cols-5 border-t border-line bg-surface-1 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Tab
        href="/"
        icon={ChartCandlestick}
        label="Trade"
        active={onTerminal && !marketsOpen}
        onClick={() => setMarketsOpen(false)}
      />
      <Tab
        icon={ChartNoAxesCombined}
        label="Markets"
        active={onTerminal && marketsOpen}
        toggleMarkets
        onClick={() => {
          if (!onTerminal) {
            router.push("/");
            setMarketsOpen(true);
          } else {
            setMarketsOpen(!marketsOpen);
          }
        }}
      />
      <Tab
        href="/positions"
        icon={ListOrdered}
        label="Positions"
        active={pathname === "/positions"}
        badge={openCount > 0 ? openCount : undefined}
      />
      <Tab href="/wallet" icon={Wallet} label="Wallet" active={pathname === "/wallet"} />
      <Tab
        href="/account"
        icon={CircleUserRound}
        label="Profile"
        active={pathname === "/account"}
      />
    </nav>
  );
}

function Tab({
  href,
  icon: Icon,
  label,
  active,
  badge,
  toggleMarkets,
  onClick,
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
  toggleMarkets?: boolean;
  onClick?: () => void;
}) {
  const className = cn(
    "relative flex h-14 flex-col items-center justify-center gap-1 transition-colors",
    active ? "text-ink" : "text-ink-muted active:text-ink",
  );
  const inner = (
    <>
      {/* Position, not only colour: a bar on the top edge marks the tab. */}
      <span
        className={cn(
          "absolute inset-x-5 top-0 h-[2px] transition-opacity",
          active ? "bg-ink opacity-100" : "opacity-0",
        )}
        aria-hidden
      />
      <span className="relative">
        <Icon className="h-5 w-5" strokeWidth={active ? 2.1 : 1.7} aria-hidden />
        {badge ? (
          <span className="tnum absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center bg-cash px-1 font-mono text-[9.5px] font-semibold leading-none text-white">
            {badge}
          </span>
        ) : null}
      </span>
      <span className={cn("text-[10.5px]", active ? "font-semibold" : "font-medium")}>
        {label}
      </span>
    </>
  );

  return href ? (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {inner}
    </Link>
  ) : (
    <button
      onClick={onClick}
      aria-pressed={active}
      data-markets-toggle={toggleMarkets ? "" : undefined}
      className={className}
    >
      {inner}
    </button>
  );
}
