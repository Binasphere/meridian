"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Loader2,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative } from "@/lib/format";
import { formatPhone, useCurrentAccount } from "@/lib/auth";
import { useStore, type CashEvent } from "@/lib/store";

const QUICK_AMOUNTS = [50_000n, 100_000n, 250_000n, 500_000n, 1_000_000n, 5_000_000n];
const MIN_DEPOSIT = 5_000n; // KSh 50
const MIN_WITHDRAWAL = 10_000n; // KSh 100

type Stage = "form" | "pending" | "done";

/**
 * Deposit / withdraw.
 *
 * The number is prefilled from the account and shown read-only. Letting someone
 * type a *different* number here is how funds end up on a stranger's handset;
 * changing the payout number should be a deliberate, verified account action,
 * not a field in the payment form.
 */
export function CashDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: "deposit" | "withdraw";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const account = useCurrentAccount();
  const requestDeposit = useStore((s) => s.requestDeposit);
  const requestWithdrawal = useStore((s) => s.requestWithdrawal);
  const liveBalance = useStore((s) => BigInt(s.balances.LIVE));

  const [amountMinor, setAmountMinor] = useState<bigint>(100_000n);
  const [stage, setStage] = useState<Stage>("form");
  const [result, setResult] = useState<CashEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDeposit = mode === "deposit";
  const minimum = isDeposit ? MIN_DEPOSIT : MIN_WITHDRAWAL;

  // Reset whenever the dialog is reopened, so a previous receipt never greets
  // the next transaction.
  useEffect(() => {
    if (open) {
      setStage("form");
      setResult(null);
      setError(null);
    }
  }, [open]);

  const problem =
    amountMinor < minimum
      ? `Minimum is ${formatMoney(minimum, { currency: "KSh" })}`
      : !isDeposit && amountMinor > liveBalance
        ? "Amount exceeds your Live balance"
        : null;

  const submit = async () => {
    if (problem || !account) return;
    setError(null);
    setStage("pending");

    if (isDeposit) {
      const event = await requestDeposit(amountMinor, account.phone);
      setResult(event);
      setStage("done");
      toast.success(`Deposit received · ${formatMoney(amountMinor, { currency: "KSh" })}`, {
        description: `M-Pesa ref ${event.reference}`,
      });
      return;
    }

    const outcome = requestWithdrawal(amountMinor, account.phone);
    if ("ok" in outcome) {
      setError(outcome.reason);
      setStage("form");
      return;
    }

    const event = await outcome;
    setResult(event);
    setStage("done");
    toast.success(`Withdrawal sent · ${formatMoney(amountMinor, { currency: "KSh" })}`, {
      description: `M-Pesa ref ${event.reference}`,
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "dialog-pop fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-[400px]",
            "-translate-x-1/2 -translate-y-1/2 border border-line bg-surface-2 shadow-2xl",
            "focus:outline-none",
          )}
        >
          <div className="flex h-12 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="flex items-center gap-2 text-[13px] font-medium text-ink">
              {isDeposit ? (
                <ArrowDownToLine className="h-4 w-4 text-cash" aria-hidden />
              ) : (
                <ArrowUpFromLine className="h-4 w-4 text-ink-muted" aria-hidden />
              )}
              {isDeposit ? "Deposit via M-Pesa" : "Withdraw to M-Pesa"}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {stage === "form" ? (
            <div className="flex flex-col gap-4 p-4">
              {/* --- Number (fixed) ---------------------------------------- */}
              <div>
                <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
                  {isDeposit ? "Paying from" : "Paying to"}
                </div>
                <div className="flex items-center gap-2 border border-line bg-surface-1 px-3 py-2.5">
                  <Smartphone className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                  <span className="tnum font-mono text-[15px] text-ink">
                    {account ? formatPhone(account.phone) : "—"}
                  </span>
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-ink-faint">
                    verified
                  </span>
                </div>
              </div>

              {/* --- Amount ------------------------------------------------- */}
              <div>
                <div className="mb-1.5 flex items-baseline justify-between">
                  <label
                    htmlFor="cash-amount"
                    className="text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
                  >
                    Amount
                  </label>
                  {!isDeposit ? (
                    <span className="tnum font-mono text-[11px] text-ink-faint">
                      Available {formatMoney(liveBalance, { currency: "KSh" })}
                    </span>
                  ) : null}
                </div>

                <div
                  className={cn(
                    "flex items-center gap-2 border bg-surface-1 px-3",
                    problem ? "border-down/40" : "border-line focus-within:border-line-strong",
                  )}
                >
                  <span className="shrink-0 font-mono text-[13px] text-ink-muted">
                    KSh
                  </span>
                  <input
                    id="cash-amount"
                    inputMode="decimal"
                    value={formatMoney(amountMinor)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setAmountMinor(digits ? BigInt(digits) : 0n);
                    }}
                    className="tnum w-full bg-transparent py-3 font-mono text-[20px] tracking-tight text-ink outline-none"
                  />
                </div>

                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount.toString()}
                      onClick={() => setAmountMinor(amount)}
                      className={cn(
                        "tnum h-8 border font-mono text-[11.5px] transition-colors",
                        amountMinor === amount
                          ? "border-line-strong bg-surface-3 text-ink"
                          : "border-line bg-surface-1 text-ink-muted hover:bg-surface-3 hover:text-ink-secondary",
                      )}
                    >
                      {formatMoney(amount, { compact: true })}
                    </button>
                  ))}
                </div>
              </div>

              {problem || error ? (
                <p role="alert" className="text-[12px] text-down">
                  {problem ?? error}
                </p>
              ) : null}

              <button
                onClick={submit}
                disabled={!!problem || !account}
                className={cn(
                  "flex h-11 items-center justify-center gap-2 text-[14px] font-semibold transition-colors",
                  "disabled:pointer-events-none disabled:opacity-40",
                  isDeposit
                    ? "bg-cash text-white hover:bg-cash-hover"
                    : "border border-line-strong bg-surface-3 text-ink hover:bg-surface-4",
                )}
              >
                {isDeposit ? "Send STK push" : "Confirm withdrawal"}
              </button>

              <p className="text-center text-[10.5px] leading-relaxed text-ink-faint">
                Simulated payment — no STK push is sent and no money moves.
              </p>
            </div>
          ) : stage === "pending" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <Loader2 className="h-7 w-7 animate-spin text-ink-muted" aria-hidden />
              <p className="text-[14px] font-medium text-ink">
                {isDeposit ? "Check your phone" : "Sending to M-Pesa"}
              </p>
              <p className="max-w-[260px] text-[12px] leading-relaxed text-ink-muted">
                {isDeposit
                  ? `Enter your M-Pesa PIN to authorise ${formatMoney(amountMinor, { currency: "KSh" })} to Meridian.`
                  : `Transferring ${formatMoney(amountMinor, { currency: "KSh" })} to ${account ? formatPhone(account.phone) : "your number"}.`}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
              <span className="grid h-11 w-11 place-items-center border border-cash/40 bg-cash/15">
                <Check className="h-5 w-5 text-cash" aria-hidden />
              </span>
              <p className="text-[14px] font-medium text-ink">
                {isDeposit ? "Deposit received" : "Withdrawal sent"}
              </p>
              <p className="tnum font-mono text-[24px] leading-none text-ink">
                {formatMoney(amountMinor, { currency: "KSh" })}
              </p>
              {result?.reference ? (
                <p className="font-mono text-[11px] text-ink-muted">
                  Ref {result.reference}
                </p>
              ) : null}
              <button
                onClick={() => onOpenChange(false)}
                className="mt-2 h-10 w-full border border-line-strong bg-surface-3 text-[13.5px] font-medium text-ink transition-colors hover:bg-surface-4"
              >
                Done
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Compact row for the statement and the wallet page. */
export function CashRow({ event }: { event: CashEvent }) {
  const isDeposit = event.kind === "DEPOSIT";
  const amount = BigInt(event.amountMinor);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center border",
          isDeposit
            ? "border-cash/30 bg-cash/10 text-cash"
            : "border-line-strong bg-surface-3 text-ink-muted",
        )}
        aria-hidden
      >
        {isDeposit ? (
          <ArrowDownToLine className="h-3.5 w-3.5" />
        ) : (
          <ArrowUpFromLine className="h-3.5 w-3.5" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-ink">
          {isDeposit ? "Deposit" : "Withdrawal"}
        </div>
        <div className="truncate font-mono text-[10.5px] text-ink-faint">
          {event.reference ?? "pending"} · {formatRelative(event.createdAt)}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={cn(
            "tnum font-mono text-[12.5px]",
            isDeposit ? "text-cash" : "text-ink-secondary",
          )}
        >
          {isDeposit ? "+" : "−"}
          {formatMoney(amount)}
        </div>
        <div
          className={cn(
            "text-[9.5px] uppercase tracking-wide",
            event.status === "PENDING" ? "text-warning" : "text-ink-faint",
          )}
        >
          {event.status.toLowerCase()}
        </div>
      </div>
    </div>
  );
}
