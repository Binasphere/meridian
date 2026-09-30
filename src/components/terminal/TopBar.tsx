"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowDownToLine, Check, ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import type { AccountKind } from "@/lib/trading";
import { useStore, useStoreHydrated } from "@/lib/store";
import { useUi } from "@/lib/ui";
import { Wordmark } from "@/components/Wordmark";
import { KenyaFlag } from "./CoinIcon";
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

      <Wordmark showMark={false} className="h-[18px] min-w-0 shrink [&>span]:truncate" />

      <div className="ml-auto flex items-center gap-2">
        <AccountMenu />

        {/* One button whether or not there is an account yet: signed out, it
            opens sign-up, which is where a deposit has to start anyway. */}
        <button
          onClick={() => (signedIn ? setCash("deposit") : showGate())}
          aria-label="Deposit"
          title="Deposit"
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cash text-white",
            "transition-colors hover:bg-cash-hover active:scale-[0.95]",
          )}
        >
          <ArrowDownToLine className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>
    </header>
  );
}

/**
 * The balance chip, and the Demo / Live switch behind it: a small centred
 * modal with the two accounts as cards.
 */
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const accountKind = useStore((s) => s.accountKind);
  const setAccountKind = useStore((s) => s.setAccountKind);
  const balances = useStore((s) => s.balances);
  const hydrated = useStoreHydrated();
  const signedIn = useAuth((s) => s.currentPhone) !== null;
  const showGate = useAuthGate((s) => s.show);

  const amount = (kind: AccountKind) =>
    hydrated ? formatMoney(BigInt(balances[kind])) : "—";

  const choose = (kind: AccountKind) => {
    setOpen(false);
    if (kind === "LIVE" && !signedIn) showGate();
    else setAccountKind(kind);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        className={cn(
          "flex h-10 min-w-0 items-center gap-2 border border-line bg-surface-1 pl-2 pr-2 text-left",
          "transition-colors hover:border-line-strong data-[state=open]:border-accent",
        )}
      >
        <KenyaFlag size={20} />
        <span className="min-w-0">
          <span
            className={cn(
              "block text-[9.5px] font-semibold uppercase leading-none tracking-[0.1em]",
              accountKind === "DEMO" ? "text-accent" : "text-up",
            )}
          >
            {accountKind === "DEMO" ? "Demo" : "Live"}
          </span>
          <span className="tnum mt-1 block truncate font-mono text-[13.5px] font-semibold leading-none text-ink">
            {amount(accountKind)}
          </span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "dialog-pop fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-[360px]",
            "-translate-x-1/2 -translate-y-1/2 border border-line bg-surface-1 p-4 shadow-2xl focus:outline-none",
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-[14px] font-semibold text-ink">Account</Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Choose the demo or live account.</Dialog.Description>

          <div className="flex flex-col gap-2">
            {(["DEMO", "LIVE"] as const).map((kind) => {
              const active = kind === accountKind;
              return (
                <button
                  key={kind}
                  onClick={() => choose(kind)}
                  className={cn(
                    "flex items-center gap-3 border p-3 text-left transition-colors",
                    active ? "border-ink" : "border-line-strong hover:border-ink-muted",
                  )}
                >
                  <KenyaFlag size={28} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">
                      {kind === "DEMO" ? "Demo" : "Live"}
                    </span>
                    <span className="tnum block font-mono text-[13px] text-ink-secondary">
                      {kind === "LIVE" && !signedIn ? "Sign up to trade live" : `KSh ${amount(kind)}`}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "grid h-5 w-5 shrink-0 place-items-center rounded-full border",
                      active ? "border-ink bg-ink text-surface-1" : "border-line-strong",
                    )}
                    aria-hidden
                  >
                    {active ? <Check className="h-3 w-3" /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
