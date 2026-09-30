"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Wordmark";
import { Spinner } from "@/components/ui/Spinner";

/**
 * The one extra step after a first Google sign-in.
 *
 * Every account here is an M-Pesa number: it is where withdrawals are paid and
 * how support finds you. Google does not supply one, so the account asks for
 * it once — and a name to trade under — before anything else opens.
 */
export function LinkNumberScreen() {
  const linkPhone = useAuth((s) => s.linkPhone);
  const signOut = useAuth((s) => s.signOut);

  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await linkPhone(phone, username);
    setBusy(false);
    if (!result.ok) setError(result.reason);
  };

  const label = "mb-1.5 block text-[12px] font-medium text-ink-secondary";
  const field =
    "flex items-stretch border border-line-strong bg-surface-1 transition-colors focus-within:border-cash";

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <Wordmark className="h-6" />
        </div>

        <div className="border border-line bg-surface-1 p-6">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Add your M-Pesa number
          </h1>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            One last step. Withdrawals are paid to this number, and it cannot be
            changed later without support.
          </p>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <div>
              <label htmlFor="link-username" className={label}>
                Username
              </label>
              <div className={field}>
                <input
                  id="link-username"
                  autoComplete="username"
                  maxLength={24}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. akinyi_254"
                  className="h-11 w-full bg-transparent px-3 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
            </div>

            <div>
              <label htmlFor="link-phone" className={label}>
                M-Pesa number
              </label>
              <div className={field}>
                <span className="flex items-center pl-3 pr-1 font-mono text-[14px] text-ink-muted">
                  +254
                </span>
                <input
                  id="link-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="712 345 678"
                  className="tnum h-11 w-full bg-transparent px-2 font-mono text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
            </div>

            {error ? (
              <div role="alert" className="text-[12.5px] text-down">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy || !phone || !username.trim()}
              className={cn(
                "mt-1 flex h-11 items-center justify-center gap-2",
                "bg-cash text-[14px] font-semibold text-white hover:bg-cash-hover",
                "transition-colors disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {busy ? <Spinner size={18} onColor /> : "Continue"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-ink-muted">
            Wrong Google account?{" "}
            <button
              type="button"
              onClick={signOut}
              className="font-semibold text-ink hover:underline"
            >
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
