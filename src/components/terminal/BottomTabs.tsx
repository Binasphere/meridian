"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChartCandlestick,
  ChartNoAxesCombined,
  CircleUserRound,
  ListOrdered,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useOpenTrades } from "@/lib/store";

/** The phone's tab bar: five destinations, always on the bottom edge. */
export function BottomTabs() {
  const pathname = usePathname();
  const openCount = useOpenTrades().length;

  return (
    <nav
      aria-label="Main"
      className="grid shrink-0 grid-cols-5 border-t border-line bg-surface-1 lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <Tab href="/" icon={ChartCandlestick} label="Trade" active={pathname === "/"} />
      <Tab
        href="/markets"
        icon={ChartNoAxesCombined}
        label="Markets"
        active={pathname === "/markets"}
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
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  badge?: number;
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

  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      className={className}
    >
      {inner}
    </Link>
  );
}
