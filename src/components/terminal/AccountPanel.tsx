"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BadgeCheck,
  CircleHelp,
  History,
  LogOut,
  RotateCcw,
  Settings,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { formatPhone, useAuth, useCurrentAccount } from "@/lib/auth";
import { instrument, KIND_LABEL } from "@/lib/market/instruments";
import { useStore } from "@/lib/store";
import { StatsPanel } from "./StatsPanel";

/**
 * The account panel.
 *
 * Everything that is *true but not urgent* lives here: balances on both
 * accounts, session performance, what the selected instrument actually is, and
 * the account actions. Pulling these out of the trading surface is the point —
 * while a contract is counting down the only things that should compete for
 * attention are the price, the countdown, and the two buttons.
 */
export function AccountPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useCurrentAccount();
  const signOutAuth = useAuth((s) => s.signOut);

  const balances = useStore((s) => s.balances);
  const accountKind = useStore((s) => s.accountKind);
  const resetDemo = useStore((s) => s.resetDemo);
  const clearSession = useStore((s) => s.signOut);
  const symbol = useStore((s) => s.symbol);

  const spec = instrument(symbol);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "panel-slide fixed inset-y-0 right-0 z-50 flex w-full max-w-[380px] flex-col",
            "border-l border-line bg-surface-1 shadow-2xl focus:outline-none",
          )}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-[13px] font-medium text-ink">
              Account
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* --- Identity ------------------------------------------------- */}
            <div className="flex items-center gap-3 p-4">
              <span
                className="grid h-11 w-11 shrink-0 place-items-center border border-line bg-surface-3 text-[13px] font-semibold text-ink"
                aria-hidden
              >
                {account ? account.phone.slice(-2) : "—"}
              </span>
              <div className="min-w-0">
                <div className="tnum truncate font-mono text-[14px] text-ink">
                  {account ? formatPhone(account.phone) : "Not signed in"}
                </div>
                <div className="text-[11.5px] text-ink-muted">
                  {account
                    ? `Member since ${new Date(account.createdAt).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`
                    : "—"}
                </div>
              </div>
            </div>

            <Section title="Balances">
              <div className="grid grid-cols-2 gap-px bg-line">
                {(["DEMO", "LIVE"] as const).map((kind) => (
                  <div key={kind} className="bg-surface-1 p-3">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          kind === "DEMO" ? "bg-accent" : "bg-up",
                        )}
                        aria-hidden
                      />
                      <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-ink-muted">
                        {kind === "DEMO" ? "Demo" : "Live"}
                      </span>
                      {kind === accountKind ? (
                        <span className="ml-auto text-[9.5px] uppercase tracking-wide text-ink-faint">
                          active
                        </span>
                      ) : null}
                    </div>
                    <div className="tnum mt-1.5 font-mono text-[16px] text-ink">
                      {formatMoney(BigInt(balances[kind]), { currency: "KSh" })}
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Session performance">
              <StatsPanel />
            </Section>

            {/* --- Market detail: moved out of the chart header ------------- */}
            <Section title="Selected market">
              <dl className="divide-y divide-line">
                <Row label="Instrument" value={spec.displayName} />
                <Row label="Symbol" value={spec.symbol} mono />
                <Row label="Class" value={KIND_LABEL[spec.kind]} />
                <Row
                  label="Payout"
                  value={`${spec.payoutBps / 100}%`}
                  mono
                  tone="up"
                />
                <Row
                  label="Break-even"
                  value={`${((1 / (1 + spec.payoutBps / 10_000)) * 100).toFixed(1)}%`}
                  mono
                  tone="warning"
                />
                <Row
                  label="Price feed"
                  value={
                    spec.simulated
                      ? "Simulated — not a live quote"
                      : "Synthetic index"
                  }
                />
              </dl>
            </Section>

            <Section title="Account">
              {[
                { icon: Wallet, label: "Deposits & withdrawals" },
                { icon: History, label: "Transaction statement" },
                { icon: BadgeCheck, label: "Verification & limits" },
                { icon: Settings, label: "Settings" },
                { icon: CircleHelp, label: "Help & support" },
              ].map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={() =>
                    toast(`${label} is not wired up in this build`)
                  }
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
                >
                  <Icon
                    className="h-[15px] w-[15px] shrink-0 text-ink-muted"
                    aria-hidden
                  />
                  <span className="text-[13px] text-ink-secondary">{label}</span>
                </button>
              ))}

              <button
                onClick={() => {
                  resetDemo();
                  toast.success("Demo balance reset to KSh 100,000.00");
                }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <RotateCcw
                  className="h-[15px] w-[15px] shrink-0 text-ink-muted"
                  aria-hidden
                />
                <span className="text-[13px] text-ink-secondary">
                  Reset demo balance
                </span>
              </button>
            </Section>
          </div>

          {/* --- Log out ---------------------------------------------------- */}
          <div className="shrink-0 border-t border-line p-3">
            <button
              onClick={() => {
                clearSession();
                signOutAuth();
                onOpenChange(false);
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
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-line">
      <h3 className="px-4 pb-1.5 pt-3.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-ink-faint">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
  tone = "neutral",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "neutral" | "up" | "warning";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2">
      <dt className="text-[12px] text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "text-right text-[12.5px]",
          mono && "tnum font-mono",
          tone === "up" && "text-up",
          tone === "warning" && "text-warning",
          tone === "neutral" && "text-ink-secondary",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
