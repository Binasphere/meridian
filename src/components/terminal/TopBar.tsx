"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDownToLine, Check, ChevronDown, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { AccountKind } from "@/lib/trading";
import { useStore, useStoreHydrated } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { Wordmark } from "@/components/Wordmark";
import { useAuthGate } from "@/components/auth/SignInGate";

/**
 * The terminal's top bar.
 *
 * Menu on the left, brand beside it; on the right, the account you are on with
 * its balance, and the one money action. Everything else lives in the drawer.
 *
 * Signed out, the same bar stands, but Deposit and the Live account summon the
 * sign-in gate instead of acting. The demo remains fully usable throughout.
 */
export function TopBar() {
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const setCash = useUi((s) => s.setCash);
  const signedIn = useAuth((s) => s.currentPhone) !== null;
  const showGate = useAuthGate((s) => s.show);

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface-1 px-2 sm:gap-3 sm:px-3">
      <button
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
        className="grid h-10 w-10 shrink-0 place-items-center text-ink transition-colors hover:bg-surface-3"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <Wordmark className="h-[18px] shrink-0" />

      <div className="ml-auto flex items-center gap-2">
        <AccountMenu />

        {signedIn ? (
          <button
            onClick={() => setCash("deposit")}
            aria-label="Deposit"
            className={cn(
              "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 bg-cash text-white",
              "w-10 sm:w-auto sm:px-4",
              "text-[13px] font-semibold transition-colors hover:bg-cash-hover active:scale-[0.97]",
            )}
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Deposit</span>
          </button>
        ) : (
          <button
            onClick={showGate}
            className="h-10 shrink-0 bg-ink px-4 text-[13px] font-semibold text-surface-1 transition-opacity hover:opacity-90"
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}

/**
 * The balance chip, and the Demo / Live switch behind it.
 *
 * Which account you are on changes what a mistake costs, so the chip names it
 * at rest — DEMO or LIVE above the balance — and switching is one tap away.
 */
function AccountMenu() {
  const accountKind = useStore((s) => s.accountKind);
  const setAccountKind = useStore((s) => s.setAccountKind);
  const balances = useStore((s) => s.balances);
  const hydrated = useStoreHydrated();
  const signedIn = useAuth((s) => s.currentPhone) !== null;
  const showGate = useAuthGate((s) => s.show);

  const options: Array<{ kind: AccountKind; label: string; hint: string }> = [
    { kind: "DEMO", label: "Demo account", hint: "Practice funds" },
    { kind: "LIVE", label: "Live account", hint: "Real money" },
  ];

  const amount = (kind: AccountKind) =>
    hydrated ? formatMoney(BigInt(balances[kind]), { currency: "KSh" }) : "—";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={cn(
          "flex h-10 items-center gap-2 border border-line bg-surface-1 pl-2.5 pr-2 text-left",
          "transition-colors hover:border-line-strong data-[state=open]:border-accent",
        )}
      >
        <span className="min-w-0">
          <span
            className={cn(
              "flex items-center gap-1 text-[9.5px] font-semibold uppercase leading-none tracking-[0.1em]",
              accountKind === "DEMO" ? "text-accent" : "text-up",
            )}
          >
            {accountKind === "DEMO" ? "Demo" : "Live"}
          </span>
          <span className="tnum mt-1 block font-mono text-[13.5px] font-semibold leading-none text-ink">
            {amount(accountKind)}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="rise-in z-50 w-[248px] border border-line bg-surface-1 p-1 shadow-[0_12px_32px_-8px_rgba(8,12,24,0.28)]"
        >
          {options.map(({ kind, label, hint }) => {
            const active = kind === accountKind;
            return (
              <DropdownMenu.Item
                key={kind}
                onSelect={() =>
                  kind === "LIVE" && !signedIn ? showGate() : setAccountKind(kind)
                }
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-3 py-2.5 outline-none",
                  "data-[highlighted]:bg-surface-2",
                  active && "bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 shrink-0",
                    kind === "DEMO" ? "bg-accent" : "bg-up",
                  )}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-ink">{label}</span>
                  <span className="block text-[11px] text-ink-faint">{hint}</span>
                </span>
                <span className="tnum font-mono text-[12px] text-ink-secondary">
                  {kind === "LIVE" && !signedIn ? "Sign in" : amount(kind)}
                </span>
                {active ? <Check className="h-3.5 w-3.5 text-ink" aria-hidden /> : null}
              </DropdownMenu.Item>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
