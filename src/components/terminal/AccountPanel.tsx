"use client";

import { useState } from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BadgeCheck,
  ChartNoAxesColumn,
  ChevronRight,
  CircleHelp,
  LogOut,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { formatPhone, useAuth, useCurrentAccount } from "@/lib/auth";
import { instrumentOrDefault } from "@/lib/market/instruments";
import { VIP_PAYOUT_BONUS_BPS } from "@/lib/trading";
import { useHistory, useStore } from "@/lib/store";
import { CashDialog } from "./CashDialog";

/**
 * The account panel.
 *
 * Navigation, not content. Every row is a real route — linkable, refreshable,
 * and reachable with the back button — because a statement or a withdrawal
 * receipt is exactly the kind of thing a customer wants to bookmark or send to
 * someone, and a view nested inside a trading panel has no URL to give them.
 *
 * The panel earns its place by being the fast path: it opens over the terminal,
 * shows the balance and the two money actions immediately, and gets out of the
 * way. Anything needing more than a glance is a page.
 */
export function AccountPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [cash, setCash] = useState<"deposit" | "withdraw" | null>(null);

  const account = useCurrentAccount();
  const signOutAuth = useAuth((s) => s.signOut);
  const clearSession = useStore((s) => s.signOut);

  const balances = useStore((s) => s.balances);
  const accountKind = useStore((s) => s.accountKind);
  const liveTier = useStore((s) => s.liveTier);
  const setLiveTier = useStore((s) => s.setLiveTier);
  const symbol = useStore((s) => s.symbol);
  const history = useHistory();
  const spec = instrumentOrDefault(symbol);

  const close = () => onOpenChange(false);

  return (
    <>
      <Dialog.Root open={open} onOpenChange={onOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
          <Dialog.Content
            className={cn(
              "panel-slide fixed inset-y-0 right-0 z-50 flex w-full max-w-[360px] flex-col",
              "border-l border-line bg-surface-1 shadow-2xl focus:outline-none",
            )}
          >
            <div className="flex h-14 shrink-0 items-center border-b border-line px-3">
              <Dialog.Title className="text-[13px] font-medium text-ink">
                Account
              </Dialog.Title>
              <Dialog.Close
                aria-label="Close"
                className="ml-auto grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* --- Identity ---------------------------------------------- */}
              <div className="flex items-center gap-3 border-b border-line p-3.5">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center border border-line bg-surface-3 text-[13px] font-semibold text-ink"
                  aria-hidden
                >
                  {account
                    ? (account.username?.slice(0, 2) ?? account.phone.slice(-2)).toUpperCase()
                    : "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium text-ink">
                    {account
                      ? (account.username ?? formatPhone(account.phone))
                      : "Not signed in"}
                  </div>
                  <div className="tnum truncate font-mono text-[11px] text-ink-muted">
                    {account ? formatPhone(account.phone) : "—"}
                  </div>
                </div>
                {account ? (
                  <span
                    className={cn(
                      "shrink-0 border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                      liveTier === "VIP"
                        ? "border-accent/40 bg-accent-soft text-accent"
                        : "border-line bg-surface-3 text-ink-muted",
                    )}
                  >
                    {liveTier === "VIP" ? "VIP" : "Standard"}
                  </span>
                ) : null}
              </div>

              {/* --- Live account tier ------------------------------------- */}
              <div className="border-b border-line p-3.5">
                <div className="mb-2 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
                  Live account tier
                </div>
                <div className="grid grid-cols-2 gap-px border border-line bg-line">
                  {(["STANDARD", "VIP"] as const).map((tier) => (
                    <button
                      key={tier}
                      onClick={() => setLiveTier(tier)}
                      aria-pressed={liveTier === tier}
                      className={cn(
                        "flex flex-col items-center gap-0.5 py-2.5 text-[12.5px] font-medium transition-colors",
                        liveTier === tier
                          ? "bg-surface-3 text-ink"
                          : "bg-surface-2 text-ink-muted hover:text-ink",
                      )}
                    >
                      <span>{tier === "VIP" ? "VIP" : "Standard"}</span>
                      <span className="text-[9.5px] uppercase tracking-wide text-ink-faint">
                        {tier === "VIP"
                          ? `+${VIP_PAYOUT_BONUS_BPS / 100}% payout`
                          : "base payout"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* --- Money, immediately ------------------------------------- */}
              <div className="grid grid-cols-2 gap-px border-b border-line bg-line">
                <button
                  onClick={() => setCash("deposit")}
                  className="flex items-center justify-center gap-1.5 bg-cash py-3 text-[13px] font-semibold text-white transition-colors hover:bg-cash-hover"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
                  Deposit
                </button>
                <button
                  onClick={() => setCash("withdraw")}
                  className="flex items-center justify-center gap-1.5 bg-surface-2 py-3 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3"
                >
                  <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden />
                  Withdraw
                </button>
              </div>

              {/* --- Routes --------------------------------------------------
                  Four destinations, not eight. Balances, moving money and the
                  statement are one task and now live on one page; splitting
                  them made each page a thin card and every answer an extra
                  navigation away. */}
              <nav className="divide-y divide-line">
                <PanelLink
                  href="/wallet"
                  icon={Wallet}
                  label="Wallet"
                  hint="Balances · deposits · statement"
                  value={formatMoney(BigInt(balances[accountKind]), {
                    currency: "KSh",
                  })}
                  onNavigate={close}
                />
                <PanelLink
                  href="/performance"
                  icon={ChartNoAxesColumn}
                  label="Performance"
                  hint="Strike rate · selected market"
                  value={
                    history.length > 0
                      ? `${history.length} settled`
                      : spec.symbol
                  }
                  onNavigate={close}
                />
                <PanelLink
                  href="/account"
                  icon={BadgeCheck}
                  label="Account"
                  hint="Profile · verification · settings"
                  value={liveTier === "VIP" ? "VIP" : "Standard"}
                  onNavigate={close}
                />
                <PanelLink
                  href="/help"
                  icon={CircleHelp}
                  label="Help & support"
                  onNavigate={close}
                />
              </nav>
            </div>

            <div className="shrink-0 border-t border-line p-3">
              <button
                onClick={() => {
                  clearSession();
                  signOutAuth();
                  close();
                }}
                className={cn(
                  "flex h-11 w-full items-center justify-center gap-2 border border-down/30 bg-down/10",
                  "text-[13.5px] font-semibold text-down transition-colors hover:bg-down/20",
                )}
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Log out
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {cash ? (
        <CashDialog
          mode={cash}
          open={cash !== null}
          onOpenChange={(next) => !next && setCash(null)}
        />
      ) : null}
    </>
  );
}

function PanelLink({
  href,
  icon: Icon,
  label,
  hint,
  value,
  onNavigate,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  hint?: string;
  value?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      // Next prefetches links in the viewport, so the page is already compiled
      // and its chunk downloaded by the time the row is clicked.
      prefetch
      onClick={onNavigate}
      className="flex w-full items-center gap-2.5 px-3.5 py-3 transition-colors hover:bg-surface-2"
    >
      <Icon className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-ink">{label}</span>
        {hint ? (
          <span className="block truncate text-[10.5px] text-ink-faint">
            {hint}
          </span>
        ) : null}
      </span>
      {value ? (
        <span className="tnum shrink-0 font-mono text-[11px] text-ink-faint">
          {value}
        </span>
      ) : null}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />
    </Link>
  );
}
