"use client";

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Smartphone, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatPhoneMasked, useAuth, useCurrentAccount } from "@/lib/auth";
import { formatPhone, normalisePhone } from "@/lib/phone";
import { depositPhoneOf } from "@/lib/prefs";
import { Spinner } from "@/components/ui/Spinner";
import { useUi } from "@/lib/ui";

/**
 * The number M-Pesa deposit prompts go to.
 *
 * One field and one button. It changes where money comes *from* and nothing
 * else: withdrawals are paid to the registered number whatever is saved here,
 * and the dialog says so in the line under the field rather than in a banner.
 */
export function DepositNumberDialog() {
  const open = useUi((s) => s.depositNumberOpen);
  const setOpen = useUi((s) => s.setDepositNumberOpen);
  const account = useCurrentAccount();
  const current = depositPhoneOf(account);
  const setDepositPhone = useAuth((s) => s.setDepositPhone);

  const [value, setValue] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(current ? `0${current.slice(3)}` : "");
      setTouched(false);
      setError(null);
    }
  }, [open, current]);

  const normalised = normalisePhone(value);
  const invalid = touched && value.trim() !== "" && !normalised;
  const unchanged = normalised !== null && normalised === current;

  const commit = async (phone: string | null) => {
    setBusy(true);
    setError(null);
    const result = await setDepositPhone(phone);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setOpen(false);
    toast.success(
      phone ? "Deposit number updated" : "Deposits will use your registered number",
      phone ? { description: formatPhone(phone) } : undefined,
    );
  };

  const save = () => {
    if (!account || !normalised) return;
    void commit(normalised);
  };

  const isCustom = !!account && current !== account.phone;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content
          className={cn(
            "dialog-pop fixed left-1/2 top-1/2 z-[60] w-[calc(100vw-2rem)] max-w-[380px]",
            "-translate-x-1/2 -translate-y-1/2 border border-line bg-surface-1 shadow-2xl",
            "focus:outline-none",
          )}
        >
          <div className="flex h-12 items-center justify-between border-b border-line px-4">
            <Dialog.Title className="text-[14px] font-semibold text-ink">
              Deposit number
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="grid h-8 w-8 place-items-center text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form
            className="flex flex-col gap-4 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              save();
            }}
          >
            <Dialog.Description className="text-[12.5px] leading-relaxed text-ink-secondary">
              M-Pesa deposit prompts are sent to this number. It can be any
              Safaricom or Airtel line — the same number can fund more than one
              account.
            </Dialog.Description>

            <div>
              <label
                htmlFor="deposit-number"
                className="mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
              >
                M-Pesa number
              </label>
              <div
                className={cn(
                  "flex items-center gap-2 border bg-surface-1 px-3 transition-colors",
                  invalid ? "border-down" : "border-line-strong focus-within:border-accent",
                )}
              >
                <Smartphone className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <input
                  id="deposit-number"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="07XX XXX XXX"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={invalid}
                  className="tnum h-11 w-full bg-transparent font-mono text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
              {invalid || error ? (
                <p role="alert" className="mt-1.5 text-[11.5px] text-down">
                  {error ?? "Enter a Safaricom or Airtel number, e.g. 0712 345 678."}
                </p>
              ) : (
                <p className="mt-1.5 text-[11.5px] text-ink-faint">
                  Withdrawals are always paid to your registered number
                  {account ? ` ${formatPhoneMasked(account.phone)}` : ""}.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              {isCustom ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void commit(null)}
                  className="h-11 flex-1 border border-line-strong bg-surface-1 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3"
                >
                  Use registered
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!normalised || unchanged || busy}
                className="flex h-11 flex-1 items-center justify-center bg-ink text-[13px] font-semibold text-surface-1 transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? <Spinner size={16} className="[--loader-1:var(--color-surface-1)]" /> : "Save number"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
