"use client";

import { useState } from "react";
import { ArrowDownToLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useAuth, useCurrentAccount } from "@/lib/auth";
import type { AccountKind } from "@/lib/trading";
import { selectBalance, useStore, useStoreHydrated } from "@/lib/store";
import { LiveDot } from "@/components/ui/primitives";
import { Wordmark } from "@/components/Wordmark";
import { useAuthGate } from "@/components/auth/SignInGate";
import { AccountPanel } from "./AccountPanel";
import { CashDialog } from "./CashDialog";

/**
 * The terminal's top bar.
 *
 * Three things and nothing else: which account is active, what the balance is,
 * and the way in and out. Everything else moved behind the account panel.
 *
 * Signed out, the same bar stands, but every affordance that presumes an
 * account — the Live switch, Deposit, the account button — summons the
 * sign-in gate instead of acting. The demo remains fully usable throughout.
 */
export function TopBar() {
  const [panelOpen, setPanelOpen] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);

  const accountKind = useStore((s) => s.accountKind);
  const balance = useStore(selectBalance);
  const hydrated = useStoreHydrated();
  const account = useCurrentAccount();
  const signedIn = useAuth((s) => s.currentPhone) !== null;
  const showGate = useAuthGate((s) => s.show);

  return (
    <>
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface-1 px-3 sm:px-4">
        <Wordmark className="h-[18px] shrink-0" />

        <div className="hidden items-center gap-1.5 md:flex">
          <LiveDot />
          <span className="text-[11px] font-medium text-ink-secondary">Live</span>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-2.5">
          <AccountSwitcher />

          <div className="hidden text-right sm:block">
            <div className="text-[9.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
              {accountKind === "DEMO" ? "Demo balance" : "Live balance"}
            </div>
            <div className="tnum -mt-0.5 font-mono text-[15px] font-medium leading-tight text-ink">
              {hydrated ? formatMoney(balance, { currency: "KSh" }) : "—"}
            </div>
          </div>

          <DepositButton
            onClick={() => (signedIn ? setDepositOpen(true) : showGate())}
          />

          {signedIn ? (
            <button
              onClick={() => setPanelOpen(true)}
              aria-label="Open account panel"
              className={cn(
                "grid h-9 w-9 shrink-0 place-items-center border border-line bg-surface-3",
                "text-[11px] font-semibold text-ink transition-colors hover:bg-surface-4",
              )}
            >
              {account ? account.phone.slice(-2) : "—"}
            </button>
          ) : (
            <button
              onClick={showGate}
              className={cn(
                "flex h-9 shrink-0 items-center border border-line bg-surface-3 px-3",
                "text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-4",
              )}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <AccountPanel open={panelOpen} onOpenChange={setPanelOpen} />
      <CashDialog
        mode="deposit"
        open={depositOpen}
        onOpenChange={setDepositOpen}
      />
    </>
  );
}

/**
 * Demo / Live switch.
 *
 * A two-state segmented control rather than a dropdown: which account you are
 * on changes what a mistake costs, so it should be readable at rest, not one
 * click away.
 */
function AccountSwitcher() {
  const accountKind = useStore((s) => s.accountKind);
  const setAccountKind = useStore((s) => s.setAccountKind);
  const balances = useStore((s) => s.balances);
  const hydrated = useStoreHydrated();
  const signedIn = useAuth((s) => s.currentPhone) !== null;
  const showGate = useAuthGate((s) => s.show);

  const options: Array<{ kind: AccountKind; label: string }> = [
    { kind: "DEMO", label: "Demo" },
    { kind: "LIVE", label: "Live" },
  ];

  return (
    <div
      role="tablist"
      aria-label="Account"
      className="flex items-center gap-0.5 border border-line bg-surface-1 p-0.5"
    >
      {options.map(({ kind, label }) => {
        const active = kind === accountKind;
        return (
          <button
            key={kind}
            role="tab"
            aria-selected={active}
            // The Live account is a signed-in thing; reaching for it while
            // signed out asks for the account rather than silently refusing.
            onClick={() =>
              kind === "LIVE" && !signedIn ? showGate() : setAccountKind(kind)
            }
            title={
              hydrated
                ? `${label} · ${formatMoney(BigInt(balances[kind]), { currency: "KSh" })}`
                : label
            }
            className={cn(
              "flex h-8 items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors duration-150",
              active
                ? "bg-surface-4 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.07)]"
                : "text-ink-muted hover:text-ink-secondary",
            )}
          >
            {active ? (
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  kind === "DEMO" ? "bg-accent" : "bg-up",
                )}
                aria-hidden
              />
            ) : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Deposit.
 *
 * Green because it is the one affirmative money-in action in the chrome — and
 * it sits in the header, well away from the trading panel, so it cannot be
 * confused with the "up" direction on a contract.
 */
function DepositButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 px-3 sm:px-3.5",
        "bg-cash text-[13px] font-semibold text-white hover:bg-cash-hover",
        "transition-colors duration-150 active:scale-[0.97]",
      )}
    >
      <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden />
      <span className="hidden sm:inline">Deposit</span>
    </button>
  );
}
