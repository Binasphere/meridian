"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Lock, ShieldCheck, ShieldPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, setAdminToken } from "@/lib/admin/client";
import { MIN_ADMIN_PASSWORD_LENGTH } from "@/lib/admin/types";
import { Button, Card } from "./ui";

/**
 * The door.
 *
 * A single centred card on the console's own canvas — no sidebar, no chrome,
 * nothing that hints at what is behind it. It renders one of two things:
 *
 *   - **Sign in**, the ordinary case: a username and a password, checked
 *     against `admin_users`.
 *   - **First super admin**, when the table has none and `ADMIN_PASSCODE` is
 *     still set. Two steps — passcode, then the account details — because the
 *     passcode buys a fifteen-minute token and nothing else.
 *
 * The error copy never distinguishes "no such admin" from "wrong password"
 * from "suspended", because the server does not either. Which of the three it
 * was is exactly what somebody guessing wants to learn.
 */

type Mode = "signin" | "bootstrap";

export function SignInGate({
  needsBootstrap,
  onUnlock,
}: {
  /** True when the console has no super admin yet and one can still be made. */
  needsBootstrap: boolean;
  onUnlock: () => void;
}) {
  const [mode, setMode] = useState<Mode>(needsBootstrap ? "bootstrap" : "signin");

  return (
    <div className="adm-root flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px]">
        {/* Unbranded, matching the sidebar: the console spans every domain, so
            naming it after one product is wrong before you have even signed
            in. See `AdminSidebar`. */}
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-none bg-adm-ink text-white"
          >
            <ShieldCheck size={16} />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-[-0.01em] text-adm-ink">
              Admin console
            </div>
            <div className="text-[12px] text-adm-ink-3">All domains</div>
          </div>
        </div>

        {mode === "bootstrap" ? (
          <BootstrapCard
            onDone={onUnlock}
            onCancel={() => setMode("signin")}
          />
        ) : (
          <SignInCard
            onDone={onUnlock}
            onBootstrap={needsBootstrap ? () => setMode("bootstrap") : null}
          />
        )}

        <p className="mt-4 text-center text-[11.5px] text-adm-ink-3">
          Sessions expire after 8 hours.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SignInCard({
  onDone,
  onBootstrap,
}: {
  onDone: () => void;
  onBootstrap: (() => void) | null;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = username.trim().length > 0 && password.length > 0;

  async function submit() {
    if (busy || !ready) return;

    setBusy(true);
    setError(null);
    try {
      const response = await adminFetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };

      if (response.ok && body.token) {
        // The password bought a session token; the password itself is never
        // kept anywhere.
        setAdminToken(body.token);
        onDone();
        return;
      }

      setError(body.error ?? "Incorrect username or password");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <span className="grid h-9 w-9 place-items-center rounded-none bg-adm-accent-tint text-adm-accent">
        <Lock size={16} />
      </span>

      <h1 className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-adm-ink">
        Restricted access
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-adm-ink-3">
        Sign in with your admin account.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="mt-5 space-y-3"
      >
        <Field
          id="adm-username"
          label="Username"
          type="text"
          autoFocus
          autoComplete="username"
          value={username}
          onChange={setUsername}
          placeholder="yourname"
          invalid={Boolean(error)}
        />
        <Field
          id="adm-password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••••"
          invalid={Boolean(error)}
          describedBy={error ? "adm-signin-error" : undefined}
        />

        {error ? (
          <p id="adm-signin-error" role="alert" className="text-[12.5px] text-adm-neg">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full"
          disabled={busy || !ready}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          Sign in
        </Button>
      </form>

      {onBootstrap ? (
        <button
          onClick={onBootstrap}
          className="mt-4 w-full border-t border-adm-line pt-4 text-center text-[12px] text-adm-ink-3 transition-colors hover:text-adm-ink"
        >
          No accounts yet — set up the first super admin
        </button>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------

/**
 * First-run only. Step one exchanges `ADMIN_PASSCODE` for a short-lived token;
 * step two spends it on the one account it is allowed to create.
 *
 * Both steps hit the same endpoint, which re-checks against the live table
 * every time — so if somebody else completes setup while this form is open,
 * step two fails cleanly rather than creating a second super admin.
 */
function BootstrapCard({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [passcode, setPasscode] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function post(payload: unknown) {
    const response = await adminFetch("/api/admin/bootstrap", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json().catch(() => ({}))) as {
      token?: string;
      error?: string;
    };
    return { ok: response.ok, ...body };
  }

  async function submitPasscode() {
    if (busy || passcode.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const body = await post({ passcode });
      if (body.ok && body.token) {
        setTicket(body.token);
        setStep(2);
        return;
      }
      setError(body.error ?? "Incorrect passcode");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  async function submitAccount() {
    if (busy || !ticket) return;
    setBusy(true);
    setError(null);
    try {
      const body = await post({
        token: ticket,
        username: username.trim(),
        fullName: fullName.trim(),
        password,
      });
      if (body.ok && body.token) {
        setAdminToken(body.token);
        onDone();
        return;
      }
      setError(body.error ?? "Could not create the account");
      // An expired ticket is unrecoverable from step two, so send them back
      // rather than leaving a form that can only keep failing.
      if (/expired/i.test(body.error ?? "")) {
        setTicket(null);
        setStep(1);
      }
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const accountReady =
    username.trim().length >= 3 &&
    fullName.trim().length >= 3 &&
    password.length >= MIN_ADMIN_PASSWORD_LENGTH;

  return (
    <Card className="p-6">
      <span className="grid h-9 w-9 place-items-center rounded-none bg-adm-accent-tint text-adm-accent">
        <ShieldPlus size={16} />
      </span>

      <h1 className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-adm-ink">
        {step === 1 ? "Set up the console" : "Your super admin account"}
      </h1>
      <p className="mt-1.5 text-[13px] leading-relaxed text-adm-ink-3">
        {step === 1
          ? "This console has no accounts yet. Enter the passcode from the backend environment to create the first one."
          : "This account can create and remove every other admin. The passcode stops working the moment it exists."}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void (step === 1 ? submitPasscode() : submitAccount());
        }}
        className="mt-5 space-y-3"
      >
        {step === 1 ? (
          <Field
            id="adm-bootstrap-passcode"
            label="Setup passcode"
            type="password"
            autoFocus
            autoComplete="one-time-code"
            value={passcode}
            onChange={setPasscode}
            placeholder="••••••••"
            invalid={Boolean(error)}
          />
        ) : (
          <>
            <Field
              id="adm-new-name"
              label="Full name"
              type="text"
              autoFocus
              autoComplete="name"
              value={fullName}
              onChange={setFullName}
              placeholder="Jane Wanjiru"
              invalid={false}
            />
            <Field
              id="adm-new-username"
              label="Username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={setUsername}
              placeholder="jane"
              invalid={false}
              hint="Lowercase letters, numbers, dot, dash or underscore."
            />
            <Field
              id="adm-new-password"
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••••"
              invalid={false}
              hint={`At least ${MIN_ADMIN_PASSWORD_LENGTH} characters. It cannot be recovered — only reset.`}
            />
          </>
        )}

        {error ? (
          <p role="alert" className="text-[12.5px] text-adm-neg">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          className="h-10 w-full"
          disabled={busy || (step === 1 ? passcode.length === 0 : !accountReady)}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
          {step === 1 ? "Continue" : "Create super admin"}
        </Button>
      </form>

      <button
        onClick={onCancel}
        className="mt-4 w-full border-t border-adm-line pt-4 text-center text-[12px] text-adm-ink-3 transition-colors hover:text-adm-ink"
      >
        I already have an account
      </button>
    </Card>
  );
}

// ---------------------------------------------------------------------------

/** One labelled input. Extracted because this file needs seven of them. */
function Field({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  invalid,
  hint,
  describedBy,
  autoFocus,
  autoComplete,
}: {
  id: string;
  label: string;
  type: "text" | "password";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  invalid: boolean;
  hint?: string;
  describedBy?: string;
  autoFocus?: boolean;
  autoComplete?: string;
}) {
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={[describedBy, hintId].filter(Boolean).join(" ") || undefined}
        className={cn(
          "h-10 w-full rounded-none border bg-adm-surface px-3 text-[14px] text-adm-ink",
          "outline-none transition-colors placeholder:text-adm-ink-4",
          invalid
            ? "border-adm-neg focus:ring-2 focus:ring-[#fdeceb]"
            : "border-adm-line-strong focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
        )}
      />
      {hint ? (
        <p id={hintId} className="mt-1 text-[11.5px] text-adm-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
