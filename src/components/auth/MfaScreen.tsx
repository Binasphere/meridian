"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/Wordmark";
import { Spinner } from "@/components/ui/Spinner";

/** The 6-digit code from the authenticator app, after the password. */
export function MfaScreen() {
  const verifyMfa = useAuth((s) => s.verifyMfa);
  const signOut = useAuth((s) => s.signOut);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await verifyMfa(code);
    setBusy(false);
    if (!result.ok) setError(result.reason);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <Wordmark className="h-6" />
        </div>
        <div className="border border-line bg-surface-1 p-6">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Enter code</h1>
          <p className="mt-1 text-[13px] text-ink-muted">From your authenticator app.</p>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              aria-label="6-digit code"
              data-keep-size
              className="tnum h-14 w-full border border-line-strong bg-surface-1 text-center font-mono text-[24px] tracking-[0.4em] text-ink outline-none focus:border-cash"
            />
            {error ? (
              <p role="alert" className="text-[12.5px] text-down">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              className={cn(
                "flex h-11 items-center justify-center bg-cash text-[14px] font-semibold text-white",
                "transition-colors hover:bg-cash-hover disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {busy ? <Spinner size={18} onColor /> : "Verify"}
            </button>
          </form>
          <p className="mt-5 text-center text-[13px] text-ink-muted">
            <button onClick={signOut} className="font-semibold text-ink hover:underline">
              Cancel
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
