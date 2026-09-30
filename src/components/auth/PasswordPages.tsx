"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { MIN_PASSWORD_LENGTH, useAuth } from "@/lib/auth";
import { useApplyTheme } from "@/lib/prefs";
import { raiseTicket } from "@/lib/support";
import { Wordmark } from "@/components/Wordmark";
import { Spinner } from "@/components/ui/Spinner";

const label = "mb-1.5 block text-[12px] font-medium text-ink-secondary";
const field =
  "flex items-stretch border border-line-strong bg-surface-1 transition-colors focus-within:border-cash";
const primary = cn(
  "flex h-11 w-full items-center justify-center bg-cash text-[14px] font-semibold text-white",
  "transition-colors hover:bg-cash-hover disabled:pointer-events-none disabled:opacity-40",
);

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  useApplyTheme();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-base px-4 py-10">
      <div className="w-full max-w-[380px]">
        <Link href="/" className="mb-6 flex justify-center" aria-label="Home">
          <Wordmark className="h-6" />
        </Link>
        <div className="border border-line bg-surface-1 p-6">
          <h1 className="mb-5 text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
          {children}
        </div>
        <p className="mt-5 text-center text-[13px] text-ink-muted">
          <Link href="/" className="font-semibold text-ink hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}

function PhoneField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        M-Pesa number
      </label>
      <div className={field}>
        <span className="flex items-center pl-3 pr-1 font-mono text-[14px] text-ink-muted">+254</span>
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          autoFocus
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="712 345 678"
          className="tnum h-11 w-full bg-transparent px-2 font-mono text-[15px] text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
    </div>
  );
}

/**
 * Forgot password: the number goes to support, who confirm it is the owner by
 * phone and give them a reset code. There is no email to send a link to — the
 * account is the number.
 */
export function ForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await raiseTicket({
      category: "PASSWORD",
      subject: "Password reset",
      message: "Password reset requested from the sign-in page.",
      phone,
    });
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setSent(true);
  };

  if (sent) {
    return (
      <Frame title="Check your phone">
        <div className="flex flex-col items-center gap-3 text-center">
          <CheckCircle2 className="h-8 w-8 text-up" aria-hidden />
          <p className="text-[13.5px] text-ink-secondary">
            We will call you with a reset code.
          </p>
          <Link href="/reset-password" className={cn(primary, "mt-2")}>
            I have a code
          </Link>
        </div>
      </Frame>
    );
  }

  return (
    <Frame title="Forgot password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <PhoneField id="forgot-phone" value={phone} onChange={setPhone} />
        {error ? (
          <p role="alert" className="text-[12.5px] text-down">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={busy || !phone} className={primary}>
          {busy ? <Spinner size={18} onColor /> : "Request reset"}
        </button>
        <Link
          href="/reset-password"
          className="text-center text-[13px] font-semibold text-ink hover:underline"
        >
          I already have a code
        </Link>
      </form>
    </Frame>
  );
}

/** Reset: number, the code support gave, and the new password. */
export function ResetPasswordPage() {
  const router = useRouter();
  const resetPassword = useAuth((s) => s.resetPassword);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Passwords do not match");
    setBusy(true);
    const result = await resetPassword(phone, code, password);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    router.push("/");
  };

  return (
    <Frame title="Reset password">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <PhoneField id="reset-phone" value={phone} onChange={setPhone} />

        <div>
          <label htmlFor="reset-code" className={label}>
            Reset code
          </label>
          <div className={field}>
            <input
              id="reset-code"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tnum h-11 w-full bg-transparent px-3 font-mono text-[15px] text-ink outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="reset-password" className={label}>
            New password
          </label>
          <div className={field}>
            <input
              id="reset-password"
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
              className="h-11 w-full bg-transparent px-3 text-[15px] text-ink outline-none placeholder:text-ink-faint"
            />
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide password" : "Show password"}
              className="grid w-11 place-items-center text-ink-muted hover:text-ink"
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="reset-confirm" className={label}>
            Confirm password
          </label>
          <div className={field}>
            <input
              id="reset-confirm"
              type={reveal ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 w-full bg-transparent px-3 text-[15px] text-ink outline-none"
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-[12.5px] text-down">
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={busy || !phone || !code || !password} className={primary}>
          {busy ? <Spinner size={18} onColor /> : "Save password"}
        </button>
      </form>
    </Frame>
  );
}
