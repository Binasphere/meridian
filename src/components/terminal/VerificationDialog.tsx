"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhoneMasked, useCurrentAccount } from "@/lib/auth";
import { depositPhoneOf } from "@/lib/prefs";
import { useUi } from "@/lib/ui";

const TIERS = [
  {
    name: "Tier 1",
    status: "active" as const,
    requirement: "M-Pesa number confirmed",
    daily: "KSh 70,000",
    perTx: "KSh 20,000",
  },
  {
    name: "Tier 2",
    status: "available" as const,
    requirement: "National ID or passport",
    daily: "KSh 300,000",
    perTx: "KSh 150,000",
  },
  {
    name: "Tier 3",
    status: "available" as const,
    requirement: "ID, proof of address, and source of funds",
    daily: "KSh 1,000,000",
    perTx: "KSh 500,000",
  },
];

/**
 * Verification and limits, as a modal off the menu.
 *
 * Opens on the numbers the account moves money with — registered and deposit
 * — because those are what verification is about here, then the tier ladder.
 */
export function VerificationDialog() {
  const open = useUi((s) => s.verificationOpen);
  const setOpen = useUi((s) => s.setVerificationOpen);
  const openDepositNumber = useUi((s) => s.setDepositNumberOpen);
  const account = useCurrentAccount();
  const depositPhone = depositPhoneOf(account);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "dialog-pop fixed left-1/2 top-1/2 z-[60] flex w-[calc(100vw-2rem)] max-w-[420px]",
            "max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col",
            "border border-line bg-surface-1 shadow-2xl focus:outline-none",
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-[14px] font-semibold text-ink">
              Verification
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <Dialog.Description className="sr-only">
              Your verification tier, limits and M-Pesa numbers.
            </Dialog.Description>

            <div className="flex items-center gap-3 border-b border-line p-4">
              <ShieldCheck className="h-5 w-5 shrink-0 text-up" aria-hidden />
              <div>
                <div className="text-[14px] font-semibold text-ink">Tier 1 verified</div>
                <div className="text-[12px] text-ink-muted">Your M-Pesa number is confirmed</div>
              </div>
            </div>

            <dl className="divide-y divide-line border-b border-line">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-[12.5px] text-ink-muted">Registered number</dt>
                <dd className="tnum font-mono text-[13px] text-ink">
                  {account?.phone ? formatPhoneMasked(account.phone) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-[12.5px] text-ink-muted">Deposit number</dt>
                <dd className="flex items-center gap-3">
                  <span className="tnum font-mono text-[13px] text-ink">
                    {depositPhone ? formatPhoneMasked(depositPhone) : "—"}
                  </span>
                  <button
                    onClick={() => openDepositNumber(true)}
                    className="text-[12px] font-semibold text-accent hover:underline"
                  >
                    Change
                  </button>
                </dd>
              </div>
            </dl>

            <div className="divide-y divide-line">
              {TIERS.map((tier) => (
                <div key={tier.name} className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-ink">{tier.name}</span>
                    <span
                      className={cn(
                        "border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide",
                        tier.status === "active"
                          ? "border-up/30 bg-up/10 text-up"
                          : "border-line-strong text-ink-muted",
                      )}
                    >
                      {tier.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink-muted">{tier.requirement}</p>
                  <dl className="mt-2.5 grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">Daily limit</dt>
                      <dd className="tnum font-mono text-[13px] text-ink-secondary">{tier.daily}</dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-ink-faint">Per transaction</dt>
                      <dd className="tnum font-mono text-[13px] text-ink-secondary">{tier.perTx}</dd>
                    </div>
                  </dl>
                  {tier.status === "available" ? (
                    <button
                      onClick={() =>
                        toast("Document upload is coming soon", {
                          description: "Raise a ticket on the Support page to verify now.",
                        })
                      }
                      className="mt-3 h-9 border border-line-strong px-4 text-[12.5px] font-medium text-ink transition-colors hover:bg-surface-3"
                    >
                      Start {tier.name} verification
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
