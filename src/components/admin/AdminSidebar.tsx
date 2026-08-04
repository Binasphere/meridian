"use client";

import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  LayoutGrid,
  LogOut,
  Radio,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The console's left panel.
 *
 * Organised as three bands with distinct jobs, top to bottom: identity (what
 * this is), navigation (where you can go), and context (what you are connected
 * to, and the way out). The order is not decorative — it answers the three
 * questions someone landing on an unfamiliar admin tool asks, in the order they
 * ask them.
 *
 * The "Not yet live" group is shown rather than hidden, greyed and
 * non-interactive. A nav item that looks clickable and does nothing is a lie; a
 * nav item that is visibly not ready is a roadmap, and it stops the panel from
 * being one lonely link.
 */

export type AdminView = "overview" | "users" | "withdrawals" | "sessions";

interface NavItem {
  id: AdminView;
  label: string;
  icon: LucideIcon;
  description: string;
}

const NAV: readonly NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutGrid,
    description: "Accounts at a glance",
  },
  { id: "users", label: "Users", icon: Users, description: "Manage accounts and tiers" },
  {
    id: "withdrawals",
    label: "Withdrawals",
    icon: Banknote,
    description: "Review requests and record payouts",
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: Radio,
    description: "TikTok lives, and what each one brought in",
  },
];

const UPCOMING: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
  { label: "Deposits", icon: Wallet },
  { label: "Trades", icon: ArrowLeftRight },
];

export function AdminSidebar({
  view,
  onNavigate,
  userCount,
  pendingWithdrawals,
  liveNow,
  projectRef,
  onSignOut,
  onClose,
}: {
  view: AdminView;
  onNavigate: (view: AdminView) => void;
  userCount: number | null;
  /** Requests awaiting payment — the number an admin signs in to deal with. */
  pendingWithdrawals: number | null;
  /** True while a host is broadcasting. Worth a marker anywhere in the console. */
  liveNow: boolean;
  projectRef: string | null;
  onSignOut: () => void;
  /** Present only when rendered as the mobile drawer. */
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col border-r border-adm-line bg-adm-raise">
      {/* --- Identity ------------------------------------------------------ */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-none bg-adm-ink text-[13px] font-semibold text-white"
          >
            M
          </span>
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold tracking-[-0.01em] text-adm-ink">
              Venti
            </div>
            <div className="text-[11px] text-adm-ink-3">Admin console</div>
          </div>
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-none p-1.5 text-adm-ink-3 transition-colors hover:bg-adm-subtle hover:text-adm-ink lg:hidden"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* --- Navigation ---------------------------------------------------- */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="adm-eyebrow px-2 pb-2 pt-3">Manage</p>
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = item.id === view;
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? "page" : undefined}
                  title={item.description}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-[13.5px] font-medium",
                    "transition-colors duration-150",
                    active
                      ? "bg-adm-accent-tint text-adm-accent-deep"
                      : "text-adm-ink-2 hover:bg-adm-subtle hover:text-adm-ink",
                  )}
                >
                  <Icon
                    size={16}
                    className={active ? "text-adm-accent" : "text-adm-ink-4"}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "users" && userCount !== null ? (
                    <span
                      className={cn(
                        "tnum rounded-none px-1.5 py-0.5 text-[11px] font-semibold",
                        active
                          ? "bg-white/70 text-adm-accent-deep"
                          : "bg-adm-subtle text-adm-ink-3",
                      )}
                    >
                      {userCount}
                    </span>
                  ) : null}
                  {item.id === "withdrawals" &&
                  pendingWithdrawals !== null &&
                  pendingWithdrawals > 0 ? (
                    // Its own colour even when inactive: a pending payout is
                    // the one number in this nav that is work waiting.
                    <span className="tnum rounded-none bg-adm-accent-tint px-1.5 py-0.5 text-[11px] font-semibold text-adm-accent-deep">
                      {pendingWithdrawals}
                    </span>
                  ) : null}
                  {item.id === "sessions" && liveNow ? (
                    // A live broadcast is time-bounded in a way nothing else in
                    // this console is: whatever the admin came here for, it is
                    // worth knowing that one is running right now.
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-adm-neg">
                      <span aria-hidden className="h-1.5 w-1.5 animate-pulse bg-adm-neg" />
                      Live
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="adm-eyebrow px-2 pb-2 pt-5">Not yet live</p>
        <ul className="space-y-0.5">
          {UPCOMING.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-none px-2.5 py-2 text-[13.5px] font-medium text-adm-ink-4"
              >
                <Icon size={16} />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-none border border-adm-line bg-adm-surface px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-adm-ink-4">
                  Soon
                </span>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* --- Context ------------------------------------------------------- */}
      <div className="shrink-0 border-t border-adm-line p-3">
        <div className="rounded-none border border-adm-line bg-adm-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 bg-adm-pos" />
            <span className="adm-eyebrow">Supabase</span>
          </div>
          <p
            className="mt-1 truncate font-mono text-[11px] text-adm-ink-2"
            title={projectRef ?? undefined}
          >
            {projectRef ?? "not configured"}
          </p>
        </div>

        <div className="mt-2 space-y-0.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-none px-2.5 py-2 text-[13px] font-medium text-adm-ink-2 transition-colors hover:bg-adm-subtle hover:text-adm-ink"
          >
            <ArrowUpRight size={15} className="text-adm-ink-4" />
            Open terminal
          </Link>
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-[13px] font-medium text-adm-ink-2 transition-colors hover:bg-adm-subtle hover:text-adm-ink"
          >
            <LogOut size={15} className="text-adm-ink-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
