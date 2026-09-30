"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import googleIcon from "@/app/assets/google.svg";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/lib/auth";
import { Wordmark } from "@/components/Wordmark";
import { Spinner } from "@/components/ui/Spinner";

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

  // Google hands back an account with no number; the link screen asks for
  // it once on return (see LinkNumberScreen). Needs the Google provider
  // switched on in Supabase → Authentication → Providers.
  const signInWithGoogle = useAuth((s) => s.signInWithGoogle);
  const [googleBusy, setGoogleBusy] = useState(false);
  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    const result = await signInWithGoogle();
    if (!result.ok) {
      setGoogleBusy(false);
      toast.error(result.reason);
    }
    // On success the browser is already leaving for Google.
  };

  const switchTo = (next: Mode) => {
    setMode(next);
    setError(null);
    setUsername("");
    setPassword("");
    setConfirm("");
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
            {mode === "register" ? "Create account" : "Log in"}
          </h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {mode === "register"
              ? "Sign up with your M-Pesa number."
              : "Welcome back. Log in with your M-Pesa number."}
          </p>

          <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
            {/* --- Username (register only) -------------------------------- */}
            {mode === "register" ? (
              <div>
                <label htmlFor="username" className={label}>
                  Username
                </label>
                <div className={field}>
                  <input
                    id="username"
                    type="text"
                    autoComplete="username"
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. akinyi_254"
                    className="h-11 w-full bg-transparent px-3 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                  />
                </div>
              </div>
            ) : null}

            {/* --- Phone --------------------------------------------------- */}
            <div>
              <label htmlFor="phone" className={label}>
                M-Pesa number
              </label>
              <div className={field}>
                <span className="flex items-center pl-3 pr-1 font-mono text-[14px] text-ink-muted">
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
                  className="tnum h-11 w-full bg-transparent px-2 font-mono text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
            </div>

            {/* --- Password ------------------------------------------------ */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="password" className="block text-[12px] font-medium text-ink-secondary">
                  Password
                </label>
                {mode === "signin" ? (
                  <Link
                    href="/support?topic=PASSWORD"
                    className="text-[12px] font-semibold text-ink hover:underline"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <div className={field}>
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
                  className="h-11 w-full bg-transparent px-3 text-[15px] text-ink outline-none placeholder:text-ink-faint"
                />
                <button
                  type="button"
                  onClick={() => setReveal((v) => !v)}
                  aria-label={reveal ? "Hide password" : "Show password"}
                  className="grid w-11 place-items-center text-ink-muted transition-colors hover:text-ink"
                >
                  {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* --- Confirm ------------------------------------------------- */}
            {mode === "register" ? (
              <div>
                <label htmlFor="confirm" className={label}>
                  Confirm password
                </label>
                <div className={field}>
                  <input
                    id="confirm"
                    type={reveal ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-11 w-full bg-transparent px-3 text-[15px] text-ink outline-none"
                  />
                </div>
              </div>
            ) : null}

            {error ? (
              <div role="alert" className="text-[12.5px] text-down">
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
                  <Spinner size={18} onColor />
                  Securing…
                </>
              ) : mode === "register" ? (
                "Create account"
              ) : (
                "Log in"
              )}
            </button>
          </form>

          {/* --- Or ------------------------------------------------------- */}
          <div className="my-5 flex items-center gap-3" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-ink-faint">or</span>
            <span className="h-px flex-1 bg-line" />
          </div>

          <button
            type="button"
            onClick={() => void continueWithGoogle()}
            disabled={googleBusy}
            className="flex h-11 w-full items-center justify-center gap-2.5 border border-line-strong bg-surface-1 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-3"
          >
            {googleBusy ? (
              <Spinner size={18} />
            ) : (
              <Image src={googleIcon} alt="" width={18} height={18} aria-hidden />
            )}
            Continue with Google
          </button>

          <p className="mt-5 text-center text-[13px] text-ink-muted">
            {mode === "register" ? "Already have an account? " : "New here? "}
            <button
              type="button"
              onClick={() => switchTo(mode === "register" ? "signin" : "register")}
              className="font-semibold text-ink hover:underline"
            >
              {mode === "register" ? "Log in" : "Create an account"}
            </button>
          </p>
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-ink-faint">
          By continuing you agree to the Terms of Service and Privacy Policy.
          Trading carries a high risk of loss.
        </p>
      </div>
    </div>
  );
}
