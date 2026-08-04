"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Gift,
  Loader2,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatMoney, formatRelative, wholeToMinor } from "@/lib/format";
import { formatPhoneMasked, useCurrentAccount } from "@/lib/auth";
import {
  CASH_STAGE_DETAIL,
  CASH_STAGE_LABEL,
  MAX_WITHDRAWAL_MINOR,
  MIN_WITHDRAWAL_MINOR,
  useStore,
  type CashEvent,
  type CashStage,
} from "@/lib/store";
import {
  serverWalletActive,
  startServerDeposit,
  startServerWithdrawal,
} from "@/lib/wallet";
import { depositFromPhone, usesMpesaRail, withdrawToPhone } from "@/lib/mpesaRail";

// Neither form offers amounts. A menu of chips beside a "pay now" button is a
// suggestion nobody asked for, and the one it makes loudest is always the
// largest. What the customer needs instead is the two numbers that bound the
// field, stated plainly under it.
const MIN_DEPOSIT = 10_000n; // KSh 100
// KSh 250,000 — M-Pesa's own per-transaction ceiling, so this is the rail's
// limit rather than a house rule. A larger deposit is two pushes.
const MAX_DEPOSIT = 25_000_000n;
// Withdrawal bounds live in the store, alongside the simulation that enforces
// the same ones when Supabase is unconfigured.
const MIN_WITHDRAWAL = MIN_WITHDRAWAL_MINOR;
const MAX_WITHDRAWAL = MAX_WITHDRAWAL_MINOR;

/**
 * First-deposit bonus, shown as a promo only.
 *
 * The customer is credited an extra 20% of their first deposit, capped at the
 * bonus on KSh 500 — i.e. a maximum of KSh 100. This is display copy for now;
 * no bonus funds are credited client-side. The crediting moves server-side with
 * Supabase, where it can be enforced once per account.
 */
const FIRST_DEPOSIT_BONUS_PCT = 20;
const FIRST_DEPOSIT_BONUS_BASE = 50_000n; // KSh 500 — the amount the bonus is figured on
const FIRST_DEPOSIT_BONUS_MAX = 10_000n; // KSh 100 — 20% of KSh 500

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
  const cashEvents = useStore((s) => s.cashEvents);

  // The bonus is a first-deposit offer, so it disappears once any deposit has
  // completed. A pending one does not count — it may yet fail.
  const hasDeposited = cashEvents.some(
    (e) => e.kind === "DEPOSIT" && e.status === "COMPLETED",
  );

  // Starts empty. A prefilled figure is an amount the product chose, and the
  // customer either accepts it or has to clear it first — neither is a
  // decision they made.
  const [amountMinor, setAmountMinor] = useState<bigint>(0n);
  const [stage, setStage] = useState<Stage>("form");
  const [result, setResult] = useState<CashEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The id of the request in flight, so the dialog can watch it move through
  // the STK stages rather than waiting on one promise with nothing to show.
  // On the real-money path the stages arrive from `startServerDeposit`'s
  // callback instead of from a store event.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [serverStage, setServerStage] = useState<CashStage>("REQUESTING");
  const liveStage: CashStage =
    (pendingId ? cashEvents.find((e) => e.id === pendingId)?.stage : undefined) ??
    serverStage;

  const isDeposit = mode === "deposit";
  const minimum = isDeposit ? MIN_DEPOSIT : MIN_WITHDRAWAL;
  const maximum = isDeposit ? MAX_DEPOSIT : MAX_WITHDRAWAL;

  // VIP accounts settle against the companion M-Pesa app: instant both ways,
  // no STK push out to PayHero and no queue for a withdrawal.
  const onMpesaRail = serverWalletActive() && usesMpesaRail(account?.liveTier);

  // Reset whenever the dialog is reopened, so a previous receipt never greets
  // the next transaction.
  useEffect(() => {
    if (open) {
      setStage("form");
      setResult(null);
      setError(null);
      setAmountMinor(0n);
    }
  }, [open]);

  // An empty field is not yet a mistake. It blocks the button, but it does not
  // get an error message — telling someone they are below the minimum before
  // they have typed anything is scolding them for the form's own initial state.
  const empty = amountMinor === 0n;

  const problem = empty
    ? null
    : amountMinor < minimum
      ? `Minimum is ${formatMoney(minimum, { currency: "KSh" })}`
      : amountMinor > maximum
        ? `Maximum is ${formatMoney(maximum, { currency: "KSh" })}`
        : !isDeposit && amountMinor > liveBalance
          ? "Amount exceeds your Live balance"
          : null;

  const submit = async () => {
    if (problem || empty || !account) return;
    setError(null);
    setStage("pending");

    // --- VIP: settled against the M-Pesa app ------------------------------
    if (onMpesaRail) {
      try {
        if (isDeposit) {
          setServerStage("REQUESTING");
          const { reference } = await depositFromPhone(amountMinor, setServerStage);
          setResult({
            id: reference,
            kind: "DEPOSIT",
            amountMinor: amountMinor.toString(),
            status: "COMPLETED",
            stage: "SETTLED",
            phone: account.phone,
            reference,
            createdAt: Date.now(),
            settledAt: Date.now(),
          });
          setStage("done");
          toast.success(
            `Deposit received · ${formatMoney(amountMinor, { currency: "KSh" })}`,
            { description: `M-Pesa ref ${reference}` },
          );
        } else {
          const event = await withdrawToPhone(amountMinor);
          setResult(event);
          setStage("done");
          toast.success(
            `Withdrawal sent · ${formatMoney(amountMinor, { currency: "KSh" })}`,
            { description: `M-Pesa ref ${event.reference}` },
          );
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Something went wrong");
        setStage("form");
      }
      return;
    }

    // --- Real money: Supabase configured, PayHero raises the push ----------
    if (serverWalletActive()) {
      try {
        if (isDeposit) {
          setServerStage("REQUESTING");
          const { event, timedOut } = await startServerDeposit(
            amountMinor,
            setServerStage,
          );
          setResult(event);
          setStage("done");
          if (timedOut) {
            toast("Deposit pending", {
              description:
                "Your balance updates automatically once M-Pesa confirms.",
            });
          } else {
            toast.success(
              `Deposit received · ${formatMoney(amountMinor, { currency: "KSh" })}`,
              { description: `M-Pesa ref ${event.reference}` },
            );
          }
        } else {
          const event = await startServerWithdrawal(amountMinor);
          setResult(event);
          setStage("done");
          toast.success(
            `Withdrawal requested · ${formatMoney(amountMinor, { currency: "KSh" })}`,
            {
              description:
                "Reviewed and paid to your M-Pesa number, usually within a few hours.",
            },
          );
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Something went wrong",
        );
        setStage("form");
      }
      return;
    }

    // --- Local simulation (Supabase unconfigured) --------------------------
    if (isDeposit) {
      const { id, done } = requestDeposit(amountMinor, account.phone);
      setPendingId(id);
      const event = await done;
      setPendingId(null);
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
            // A centred box taller than the screen loses *both* ends, and the
            // top one silently: the first-deposit banner sits at the top of the
            // form, so on a short viewport — a phone, or any phone once the
            // keyboard opens and halves it — it was pushed above the edge with
            // no way to reach it. Capping the height and scrolling the body
            // keeps every element reachable at any size.
            //
            // `dvh`, not `vh`: on mobile `vh` is the tallest the viewport ever
            // gets, so a `vh` cap is not a cap at the moment it is needed.
            "flex max-h-[calc(100dvh-2rem)] flex-col",
          )}
        >
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
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

          {/* `min-h-0` is what lets this shrink below its content inside the
              flex column — without it the child's intrinsic height wins and
              nothing ever scrolls. `overscroll-contain` stops a flick at the
              end of the list scrolling the terminal behind the dialog. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {stage === "form" ? (
              <div className="flex flex-col gap-4 p-4">
                {/* --- First-deposit bonus (promo only) ---------------------- */}
                {isDeposit && !hasDeposited ? (
                  <div className="flex items-start gap-2.5 border border-cash/40 bg-cash/10 p-3">
                    <Gift className="mt-0.5 h-4 w-4 shrink-0 text-cash" aria-hidden />
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold text-ink">
                        First deposit bonus · +{FIRST_DEPOSIT_BONUS_PCT}%
                      </div>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                        Get an extra {FIRST_DEPOSIT_BONUS_PCT}% on your first{" "}
                        {formatMoney(FIRST_DEPOSIT_BONUS_BASE, { currency: "KSh" })}{" "}
                        deposited — up to{" "}
                        {formatMoney(FIRST_DEPOSIT_BONUS_MAX, { currency: "KSh" })}{" "}
                        free.
                      </p>
                    </div>
                  </div>
                ) : null}

                {/* --- Number (fixed) ---------------------------------------- */}
                <div>
                  <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
                    {isDeposit ? "Paying from" : "Paying to"}
                  </div>
                  <div className="flex items-center gap-2 border border-line bg-surface-1 px-3 py-2.5">
                    <Smartphone className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                    <span className="tnum font-mono text-[15px] text-ink">
                      {account ? formatPhoneMasked(account.phone) : "—"}
                    </span>
                    {/* One label whichever rail settles this. Which rail it is
                        is an implementation detail of the account, and naming it
                        on the payment form invites the question. */}
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
                      inputMode="numeric"
                      placeholder="0"
                      // Whole shillings, in and out. Nobody deposits a fraction
                      // of one, and a field that read `1000` as ten was a trap.
                      value={empty ? "" : formatMoney(amountMinor, { whole: true })}
                      onChange={(e) => setAmountMinor(wholeToMinor(e.target.value))}
                      className="tnum w-full bg-transparent py-3 font-mono text-[20px] tracking-tight text-ink outline-none placeholder:text-ink-faint"
                    />
                  </div>

                  {/* With nothing prefilled, the bounds have to be stated up
                      front rather than only in the error that appears once you
                      have already got them wrong. */}
                  <p className="tnum mt-1.5 font-mono text-[10.5px] text-ink-faint">
                    Min {formatMoney(minimum, { currency: "KSh", whole: true })} ·
                    Max {formatMoney(maximum, { currency: "KSh", whole: true })}
                    {isDeposit ? " per deposit" : " per request"}
                  </p>
                </div>

                {problem || error ? (
                  <p role="alert" className="text-[12px] text-down">
                    {problem ?? error}
                  </p>
                ) : null}

                <button
                  onClick={submit}
                  disabled={!!problem || empty || !account}
                  className={cn(
                    "flex h-11 items-center justify-center gap-2 text-[14px] font-semibold transition-colors",
                    "disabled:pointer-events-none disabled:opacity-40",
                    isDeposit
                      ? "bg-cash text-white hover:bg-cash-hover"
                      : "border border-line-strong bg-surface-3 text-ink hover:bg-surface-4",
                  )}
                >
                  {isDeposit ? "Pay now" : "Confirm withdrawal"}
                </button>

                <p className="text-center text-[10.5px] leading-relaxed text-ink-faint">
                  {/* True on either rail, and it promises nothing the customer
                      will not actually see happen on their handset. */}
                  {isDeposit
                    ? "Charged to your M-PESA account and credited to your Live balance once confirmed."
                    : onMpesaRail
                      ? "Paid to your verified M-PESA number."
                      : "Requests are reviewed and paid to your verified M-PESA number."}
                </p>
              </div>
            ) : stage === "pending" ? (
              isDeposit ? (
                <StkProgress stage={liveStage} amountMinor={amountMinor} />
              ) : (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-ink-muted" aria-hidden />
                  <p className="text-[14px] font-medium text-ink">Submitting request</p>
                  <p className="max-w-[260px] text-[12px] leading-relaxed text-ink-muted">
                    {`Requesting ${formatMoney(amountMinor, { currency: "KSh" })} to ${account ? formatPhoneMasked(account.phone) : "your number"}.`}
                  </p>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <span className="grid h-11 w-11 place-items-center border border-cash/40 bg-cash/15">
                  <Check className="h-5 w-5 text-cash" aria-hidden />
                </span>
                <p className="text-[14px] font-medium text-ink">
                  {isDeposit
                    ? result?.status === "PENDING"
                      ? "Deposit pending"
                      : "Deposit received"
                    : result?.status === "PENDING"
                      ? "Withdrawal requested"
                      : "Withdrawal sent"}
                </p>
                <p className="tnum font-mono text-[24px] leading-none text-ink">
                  {formatMoney(amountMinor, { currency: "KSh" })}
                </p>
                {result?.reference ? (
                  <p className="font-mono text-[11px] text-ink-muted">
                    Ref {result.reference}
                  </p>
                ) : null}
                {result?.status === "PENDING" ? (
                  <p className="max-w-[280px] text-[12px] leading-relaxed text-ink-muted">
                    {isDeposit
                      ? "Waiting on M-Pesa. Your balance updates automatically once the payment confirms."
                      : "Your request is being reviewed. The money is sent to your verified M-Pesa number once approved — usually within a few hours."}
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
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The STK push, step by step.
 *
 * Four rows rather than one spinner, because they are four genuinely different
 * waits and only one of them is the customer's to act on. Showing which step is
 * live is what turns "is this broken?" into "it's waiting for me" — the
 * difference between a customer entering their PIN and a customer closing the
 * dialog at four seconds.
 */
function StkProgress({
  stage,
  amountMinor,
}: {
  stage: CashStage;
  amountMinor: bigint;
}) {
  const steps: CashStage[] = ["REQUESTING", "AWAITING_CUSTOMER", "CONFIRMING"];
  const currentIndex = steps.indexOf(stage);
  // The final stage is reached only as the dialog flips to its receipt, so
  // treat it as "all steps done" rather than as an unknown index.
  const activeIndex = currentIndex === -1 ? steps.length : currentIndex;

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="text-center">
        <div className="tnum font-mono text-[22px] leading-none text-ink">
          {formatMoney(amountMinor, { currency: "KSh" })}
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-muted">
          {CASH_STAGE_DETAIL[stage]}
        </p>
      </div>

      <ol className="divide-y divide-line border border-line bg-surface-1">
        {steps.map((step, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;

          return (
            <li key={step} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center border",
                  complete && "border-cash/40 bg-cash/15 text-cash",
                  active && "border-line-strong bg-surface-3 text-ink",
                  !complete && !active && "border-line text-ink-faint",
                )}
              >
                {complete ? (
                  <Check className="h-3 w-3" aria-hidden />
                ) : active ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <span className="text-[10px] font-mono">{index + 1}</span>
                )}
              </span>

              <span
                className={cn(
                  "text-[12.5px]",
                  active ? "font-medium text-ink" : "text-ink-muted",
                )}
              >
                {CASH_STAGE_LABEL[step]}
              </span>

              {active ? (
                <span className="ml-auto text-[10.5px] uppercase tracking-wide text-ink-faint">
                  in progress
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
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
