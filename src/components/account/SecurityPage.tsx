"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCurrentAccount } from "@/lib/auth";
import {
  changePassword,
  disableTwoFactor,
  startTwoFactor,
  twoFactorStatus,
  verifyTwoFactor,
  type Enrollment,
  type TwoFactorStatus,
} from "@/lib/security";
import { Spinner } from "@/components/ui/Spinner";
import { Column, Columns, Section } from "./AccountShell";

const label = "mb-1.5 block text-[12px] font-medium text-ink-secondary";
const input =
  "h-11 w-full border border-line-strong bg-surface-1 px-3 text-[15px] text-ink outline-none transition-colors focus:border-cash";
const primary =
  "flex h-11 items-center justify-center bg-cash px-5 text-[14px] font-semibold text-white transition-colors hover:bg-cash-hover disabled:pointer-events-none disabled:opacity-40";

export function SecurityPage() {
  const account = useCurrentAccount();
  return (
    <Columns count={2}>
      <Column>
        <Section title="Password">
          {account?.method === "google" ? (
            <p className="p-4 text-[13px] text-ink-muted">You sign in with Google.</p>
          ) : (
            <PasswordForm phone={account?.phone ?? ""} />
          )}
        </Section>
      </Column>
      <Column>
        <Section title="Two-step verification">
          <TwoFactor />
        </Section>
      </Column>
    </Columns>
  );
}

function PasswordForm({ phone }: { phone: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== confirm) return setError("Passwords do not match");
    setBusy(true);
    const result = await changePassword(phone, current, next);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.success("Password changed");
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-4">
      <div>
        <label htmlFor="pw-current" className={label}>Current password</label>
        <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
      </div>
      <div>
        <label htmlFor="pw-next" className={label}>New password</label>
        <input id="pw-next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={input} />
      </div>
      <div>
        <label htmlFor="pw-confirm" className={label}>Confirm new password</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
      </div>
      {error ? <p role="alert" className="text-[12.5px] text-down">{error}</p> : null}
      <button type="submit" disabled={busy || !current || !next} className={primary}>
        {busy ? <Spinner size={18} onColor /> : "Change password"}
      </button>
    </form>
  );
}

function TwoFactor() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void twoFactorStatus().then(setStatus);
  }, []);

  const begin = async () => {
    setBusy(true);
    setError(null);
    const result = await startTwoFactor();
    setBusy(false);
    if ("error" in result) return setError(result.error);
    setEnrollment(result);
  };

  const confirmCode = async () => {
    if (!enrollment) return;
    setBusy(true);
    setError(null);
    const result = await verifyTwoFactor(enrollment.factorId, code);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setEnrollment(null);
    setCode("");
    setStatus({ enabled: true, factorId: enrollment.factorId });
    toast.success("Two-step verification is on");
  };

  const turnOff = async () => {
    if (!status?.factorId) return;
    setBusy(true);
    const result = await disableTwoFactor(status.factorId);
    setBusy(false);
    if (!result.ok) return setError(result.reason);
    setStatus({ enabled: false, factorId: null });
    toast.success("Two-step verification is off");
  };

  if (status === null) {
    return (
      <div className="grid place-items-center py-10">
        <Spinner size={28} label="Loading" />
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="flex flex-col items-center gap-4 p-4">
        <p className="self-start text-[13px] text-ink-secondary">
          Scan with Google Authenticator or any authenticator app.
        </p>
        {/* The QR arrives as an SVG data URL from Supabase. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={enrollment.qr} alt="Two-step QR code" width={180} height={180} className="bg-white p-2" />
        <code className="tnum break-all text-center font-mono text-[12px] text-ink-muted">
          {enrollment.secret}
        </code>
        <input
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          aria-label="6-digit code"
          data-keep-size
          className="tnum h-12 w-full border border-line-strong bg-surface-1 text-center font-mono text-[20px] tracking-[0.35em] text-ink outline-none focus:border-cash"
        />
        {error ? <p role="alert" className="self-start text-[12.5px] text-down">{error}</p> : null}
        <button onClick={() => void confirmCode()} disabled={busy || code.length !== 6} className={cn(primary, "w-full")}>
          {busy ? <Spinner size={18} onColor /> : "Turn on"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 p-4">
      <div>
        <div className="text-[14px] font-semibold text-ink">{status.enabled ? "On" : "Off"}</div>
        <div className="text-[12.5px] text-ink-muted">Authenticator app code at sign-in</div>
        {error ? <p role="alert" className="mt-1 text-[12.5px] text-down">{error}</p> : null}
      </div>
      {status.enabled ? (
        <button
          onClick={() => void turnOff()}
          disabled={busy}
          className="h-10 border border-line-strong px-4 text-[13px] font-medium text-ink transition-colors hover:bg-surface-3 disabled:opacity-40"
        >
          Turn off
        </button>
      ) : (
        <button onClick={() => void begin()} disabled={busy} className={primary}>
          {busy ? <Spinner size={18} onColor /> : "Enable"}
        </button>
      )}
    </div>
  );
}
