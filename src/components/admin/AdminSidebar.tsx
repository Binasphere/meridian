"use client";

import {
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  Globe,
  LayoutGrid,
  LogOut,
  Radio,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { roleCan, type AdminCapability, type AdminRole } from "@/lib/admin/types";

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

export type AdminView =
  | "overview"
  | "users"
  | "withdrawals"
  | "sessions"
  | "domains"
  | "admins";

interface NavItem {
  id: AdminView;
  label: string;
  icon: LucideIcon;
  description: string;
  /**
   * The capability this view needs. Absent means every signed-in admin may see
   * it — which is true of Domains, a page of public addresses and a notice.
   */
  needs?: AdminCapability;
}

const NAV: readonly NavItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: LayoutGrid,
    description: "Accounts at a glance",
    needs: "finance",
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    description: "Manage accounts and tiers",
    needs: "finance",
  },
  {
    id: "withdrawals",
    label: "Withdrawals",
    icon: Banknote,
    description: "Review requests and record payouts",
    needs: "finance",
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: Radio,
    description: "TikTok lives, and what each one brought in",
    needs: "sessions",
  },
  {
    id: "domains",
    label: "Domains",
    icon: Globe,
    description: "The addresses this platform answers on",
  },
  {
    id: "admins",
    label: "Admins",
    icon: ShieldCheck,
    description: "Who can sign in to this console",
  },
];

/**
 * The views a role may open, in nav order.
 *
 * Exported because the panel needs the same answer to pick a landing view: a
 * session manager whose console defaulted to Overview would open on a 403.
 */
export function visibleViews(role: AdminRole | null): AdminView[] {
  return NAV.filter((item) => !item.needs || roleCan(role, item.needs)).map(
    (item) => item.id,
  );
}

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
  role,
  onSignOut,
  onClose,
}: {
  view: AdminView;
  onNavigate: (view: AdminView) => void;
  /** Decides which nav items exist at all. */
  role: AdminRole | null;
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
    <div className="flex h-full flex-col border-r border-adm-nav-line bg-adm-nav">
      {/* --- Identity ------------------------------------------------------
          Deliberately unbranded. This console administers every domain on the
          platform, so naming it after one of the products was wrong the moment
          there were two — it read as "the Venti console" to someone who had
          just filtered the page to Candix. What it is, is the admin console;
          which product you are looking at is the filter in the header, and
          that is the only place a product name belongs here. */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-none bg-adm-nav-raise text-adm-nav-ink"
          >
            <ShieldCheck size={15} />
          </span>
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold tracking-[-0.01em] text-adm-nav-ink">
              Admin console
            </div>
            <div className="text-[11px] text-adm-nav-ink-3">All domains</div>
          </div>
        </div>

        {onClose ? (
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-none p-1.5 text-adm-nav-ink-3 transition-colors hover:bg-adm-nav-raise hover:text-adm-nav-ink lg:hidden"
          >
            <X size={16} />
          </button>
        ) : null}
      </div>

      {/* --- Navigation ---------------------------------------------------- */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        <p className="adm-eyebrow px-2 pb-2 pt-3 text-adm-nav-ink-3">Manage</p>
        <ul className="space-y-0.5">
          {NAV.filter(
            // Not greyed out like the "Not yet live" group below: those are
            // features that do not exist yet, which is worth showing. A view
            // this role may never open is not a roadmap, it is a locked door,
            // and drawing one only invites someone to rattle it.
            (item) => !item.needs || roleCan(role, item.needs),
          ).map((item) => {
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
                      ? "bg-adm-nav-raise text-adm-nav-ink"
                      : "text-adm-nav-ink-2 hover:bg-adm-nav-raise hover:text-adm-nav-ink",
                  )}
                >
                  <Icon
                    size={16}
                    className={active ? "text-adm-nav-accent" : "text-adm-nav-ink-3"}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.id === "users" && userCount !== null ? (
                    <span
                      className={cn(
                        "tnum rounded-none px-1.5 py-0.5 text-[11px] font-semibold",
                        active
                          ? "bg-adm-nav-accent/20 text-adm-nav-ink"
                          : "bg-white/10 text-adm-nav-ink-3",
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
                    <span className="tnum rounded-none bg-adm-neg px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      {pendingWithdrawals}
                    </span>
                  ) : null}
                  {item.id === "sessions" && liveNow ? (
                    // A live broadcast is time-bounded in a way nothing else in
                    // this console is: whatever the admin came here for, it is
                    // worth knowing that one is running right now.
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-[#ff8a80]">
                      <span aria-hidden className="h-1.5 w-1.5 animate-pulse bg-[#ff8a80]" />
                      Live
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <p className="adm-eyebrow px-2 pb-2 pt-5 text-adm-nav-ink-3">Not yet live</p>
        <ul className="space-y-0.5">
          {UPCOMING.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.label}
                className="flex cursor-not-allowed items-center gap-2.5 rounded-none px-2.5 py-2 text-[13.5px] font-medium text-adm-nav-ink-3/60"
              >
                <Icon size={16} />
                <span className="flex-1">{item.label}</span>
                <span className="rounded-none border border-adm-nav-line bg-adm-nav-raise px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-adm-nav-ink-3">
                  Soon
                </span>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* --- Context ------------------------------------------------------- */}
      <div className="shrink-0 border-t border-adm-nav-line p-3">
        <div className="rounded-none border border-adm-nav-line bg-adm-nav-raise px-3 py-2.5">
          <div className="flex items-center gap-1.5">
            <span aria-hidden className="h-1.5 w-1.5 bg-[#4ade80]" />
            <span className="adm-eyebrow text-adm-nav-ink-3">Supabase</span>
          </div>
          <p
            className="mt-1 truncate font-mono text-[11px] text-adm-nav-ink-2"
            title={projectRef ?? undefined}
          >
            {projectRef ?? "not configured"}
          </p>
        </div>

        <div className="mt-2 space-y-0.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-none px-2.5 py-2 text-[13px] font-medium text-adm-nav-ink-2 transition-colors hover:bg-adm-nav-raise hover:text-adm-nav-ink"
          >
            <ArrowUpRight size={15} className="text-adm-nav-ink-3" />
            Open terminal
          </Link>
          <button
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-none px-2.5 py-2 text-[13px] font-medium text-adm-nav-ink-2 transition-colors hover:bg-adm-nav-raise hover:text-adm-nav-ink"
          >
            <LogOut size={15} className="text-adm-nav-ink-3" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
