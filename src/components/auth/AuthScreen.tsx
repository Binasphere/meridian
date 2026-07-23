"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Smartphone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";

type Mode = "signin" | "register";

/**
 * Sign in / create account.
 *
 * One identifier: the M-Pesa number. It is the account name, the login, and the
 * rail money will move on — asking for an email as well would be a second thing
 * to remember that the product never uses.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("register");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const register = useAuth((s) => s.register);
  const signIn = useAuth((s) => s.signIn);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (mode === "register" && password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    // PBKDF2 at 210k iterations takes a beat; that is the point of it.
    const result =
      mode === "register"
        ? await register(phone, username, password)
        : await signIn(phone, password);
    setBusy(false);

    if (!result.ok) setError(result.reason);
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setUsername("");
    setPassword("");
    setConfirm("");
  };

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-base px-4 py-10">
      <div className="grid-noise pointer-events-none absolute inset-0 opacity-30" aria-hidden />

      <div className="relative w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center gap-3">
          <Wordmark className="h-6" />
          <p className="text-center text-[13px] leading-relaxed text-ink-muted">
            {mode === "register"
              ? "Create an account with your M-Pesa number."
              : "Sign in with your M-Pesa number."}
          </p>
        </div>

        <div className="panel p-5">
          {/* --- Mode switch ------------------------------------------------ */}
          <div
            role="tablist"
            className="mb-5 grid grid-cols-2 gap-0.5 border border-line bg-surface-1 p-0.5"
          >
            {(
              [
                ["register", "Create account"],
                ["signin", "Sign in"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={mode === value}
                onClick={() => switchTo(value)}
                className={cn(
                  "h-9 text-[12.5px] font-medium transition-colors",
                  mode === value
                    ? "bg-surface-4 text-ink shadow-[inset_0_1px_0_rgba(255,255,255,.06)]"
                    : "text-ink-muted hover:text-ink-secondary",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-4">
            {/* --- Username (register only) -------------------------------- */}
            {mode === "register" ? (
              <div>
                <label
                  htmlFor="username"
                  className="mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
                >
                  Username
                </label>
                <div className="flex items-stretch border border-line bg-surface-1 transition-colors focus-within:border-line-strong">
                  <span className="flex items-center border-r border-line px-2.5 text-ink-muted">
                    <User className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. akinyi_254"
                    className="w-full bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                  />
                </div>
              </div>
            ) : null}

            {/* --- Phone --------------------------------------------------- */}
            <div>
              <label
                htmlFor="phone"
                className="mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
              >
                M-Pesa number
              </label>
              <div className="flex items-stretch border border-line bg-surface-1 transition-colors focus-within:border-line-strong">
                <span className="flex items-center gap-1.5 border-r border-line px-2.5 font-mono text-[13px] text-ink-muted">
                  <Smartphone className="h-3.5 w-3.5" aria-hidden />
                  +254
                </span>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="712 345 678"
                  className="tnum w-full bg-transparent px-3 py-2.5 font-mono text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
            </div>

            {/* --- Password ------------------------------------------------ */}
            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
              >
                Password
              </label>
              <div className="flex items-stretch border border-line bg-surface-1 transition-colors focus-within:border-line-strong">
                <input
                  id="password"
                  type={reveal ? "text" : "password"}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "register"
                      ? `At least ${MIN_PASSWORD_LENGTH} characters`
                      : "Your password"
                  }
                  className="w-full bg-transparent px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  className="grid w-10 place-items-center text-ink-muted transition-colors hover:text-ink"
                >
                  {reveal ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {/* --- Confirm ------------------------------------------------- */}
            {mode === "register" ? (
              <div>
                <label
                  htmlFor="confirm"
                  className="mb-1.5 block text-[10.5px] font-medium uppercase tracking-[0.09em] text-ink-muted"
                >
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type={reveal ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full border border-line bg-surface-1 px-3 py-2.5 text-[15px] text-ink outline-none transition-colors focus:border-line-strong"
                />
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="border border-down/30 bg-down/10 px-3 py-2 text-[12.5px] text-down"
              >
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={
                busy ||
                !phone ||
                !password ||
                (mode === "register" && !username.trim())
              }
              className={cn(
                "mt-1 flex h-11 items-center justify-center gap-2",
                "bg-cash text-[14px] font-semibold text-white hover:bg-cash-hover",
                "transition-colors duration-150 active:scale-[0.99]",
                "disabled:pointer-events-none disabled:opacity-40",
              )}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Securing…
                </>
              ) : mode === "register" ? (
                "Create account"
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-faint">
          Secured with industry-standard encryption. By continuing you agree to
          the Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
