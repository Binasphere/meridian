"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Radio } from "lucide-react";
import { BACKEND_ORIGIN } from "@/lib/backend";
import { MIN_PASSWORD_LENGTH, normalisePhone } from "@/lib/phone";
import { setHostToken } from "@/lib/sessions/client";
import { cn } from "@/lib/utils";
import { Button, Card } from "@/components/admin/ui";

/**
 * The host's door.
 *
 * Two forms behind one toggle rather than two pages: a host arrives here for
 * the first time and every time after, and which of those it is should cost one
 * glance, not a navigation. Sign in leads, because after the first week it is
 * the only one anyone uses.
 *
 * The rules mirror the server's exactly — both names, a Kenyan mobile number,
 * eight characters — so the form can refuse instantly. The server runs them
 * again on arrival, because validation that lives only in the browser is
 * decoration.
 */

type Mode = "in" | "up";

export function HostGate({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<Mode>("in");

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function switchTo(next: Mode) {
    setMode(next);
    setError(null);
    setPassword("");
  }

  async function submit() {
    if (busy) return;

    const normalised = normalisePhone(phone);
    if (!normalised) {
      setError("Enter a valid Kenyan mobile number");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (mode === "up" && !fullName.trim().includes(" ")) {
      setError("Enter both your first and last name");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${BACKEND_ORIGIN}/api/sessions/${mode === "up" ? "register" : "login"}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            fullName: fullName.trim(),
            phone: normalised,
            password,
          }),
        },
      );

      const body = (await response.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };

      if (response.ok && body.token) {
        setHostToken(body.token);
        onSignedIn();
        return;
      }

      setError(body.error ?? "Could not sign you in");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  const creating = mode === "up";

  return (
    <div className="adm-root flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-none bg-adm-ink text-white"
          >
            <Radio size={16} />
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-[-0.01em] text-adm-ink">
              Venti
            </div>
            <div className="text-[12px] text-adm-ink-3">Live desk</div>
          </div>
        </div>

        <Card className="p-6">
          {/* Square segmented toggle — the product's geometry, not a pill. */}
          <div
            role="tablist"
            aria-label="Sign in or create an account"
            className="flex border border-adm-line-strong"
          >
            {(
              [
                ["in", "Sign in"],
                ["up", "Create account"],
              ] as const
            ).map(([value, label], index) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() => switchTo(value)}
                className={cn(
                  "h-9 flex-1 text-[13px] font-medium transition-colors",
                  index === 1 && "border-l border-adm-line-strong",
                  mode === value
                    ? "bg-adm-ink text-white"
                    : "bg-adm-surface text-adm-ink-3 hover:bg-adm-subtle hover:text-adm-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <h1 className="mt-5 text-[17px] font-semibold tracking-[-0.015em] text-adm-ink">
            {creating ? "Join the live desk" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-adm-ink-3">
            {creating
              ? "Your own account for running lives. It is separate from any trading account you hold."
              : "Sign in to open a session and watch what it brings in."}
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="mt-5 space-y-3"
          >
            {creating ? (
              <Field
                id="host-name"
                label="Full name"
                value={fullName}
                onChange={setFullName}
                placeholder="Jane Wanjiru"
                autoComplete="name"
                invalid={Boolean(error)}
              />
            ) : null}

            <Field
              id="host-phone"
              label="Mobile number"
              value={phone}
              onChange={setPhone}
              placeholder="07XX XXX XXX"
              type="tel"
              autoComplete="tel"
              invalid={Boolean(error)}
            />

            <Field
              id="host-password"
              label="Password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              type="password"
              autoComplete={creating ? "new-password" : "current-password"}
              invalid={Boolean(error)}
              hint={
                creating
                  ? `At least ${MIN_PASSWORD_LENGTH} characters.`
                  : undefined
              }
            />

            {error ? (
              <p role="alert" className="text-[12.5px] text-adm-neg">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              className="h-10 w-full"
              disabled={busy}
            >
              {busy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ArrowRight size={15} />
              )}
              {creating ? "Create account" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11.5px] leading-relaxed text-adm-ink-3">
          Only one session runs at a time across the whole team.
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  invalid,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  invalid?: boolean;
  hint?: string;
}) {
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
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          "h-10 w-full rounded-none border bg-adm-surface px-3 text-[14px] text-adm-ink",
          "outline-none transition-colors placeholder:text-adm-ink-4",
          invalid
            ? "border-adm-neg focus:ring-2 focus:ring-[#fdeceb]"
            : "border-adm-line-strong focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
        )}
      />
      {hint ? (
        <p className="mt-1 text-[11.5px] text-adm-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}
