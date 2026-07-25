"use client";

import { useState } from "react";
import { ArrowRight, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Card } from "./ui";

/**
 * The door.
 *
 * A single centred card on the console's own canvas — no sidebar, no chrome,
 * nothing that hints at what is behind it. The error copy never distinguishes
 * "wrong passcode" from "no passcode configured" beyond what the server chooses
 * to say, and the server says as little as it can.
 */
export function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [passcode, setPasscode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy || passcode.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passcode }),
      });

      if (response.ok) {
        onUnlock();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Incorrect passcode");
    } catch {
      setError("Could not reach the server");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-root flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex items-center gap-2.5">
          <span
            aria-hidden
            className="grid h-9 w-9 place-items-center rounded-none bg-adm-ink text-[14px] font-semibold text-white"
          >
            M
          </span>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold tracking-[-0.01em] text-adm-ink">
              Meridian
            </div>
            <div className="text-[12px] text-adm-ink-3">Admin console</div>
          </div>
        </div>

        <Card className="p-6">
          <span className="grid h-9 w-9 place-items-center rounded-none bg-adm-accent-tint text-adm-accent">
            <Lock size={16} />
          </span>

          <h1 className="mt-4 text-[17px] font-semibold tracking-[-0.015em] text-adm-ink">
            Restricted access
          </h1>
          <p className="mt-1.5 text-[13px] leading-relaxed text-adm-ink-3">
            Enter the admin passcode to manage customer accounts.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="mt-5 space-y-3"
          >
            <div>
              <label
                htmlFor="adm-passcode"
                className="mb-1.5 block text-[12.5px] font-medium text-adm-ink-2"
              >
                Passcode
              </label>
              <input
                id="adm-passcode"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
                placeholder="••••••••"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "adm-passcode-error" : undefined}
                className={cn(
                  "h-10 w-full rounded-none border bg-adm-surface px-3 text-[14px] text-adm-ink",
                  "outline-none transition-colors placeholder:text-adm-ink-4",
                  error
                    ? "border-adm-neg focus:ring-2 focus:ring-[#fdeceb]"
                    : "border-adm-line-strong focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
                )}
              />
            </div>

            {error ? (
              <p
                id="adm-passcode-error"
                role="alert"
                className="text-[12.5px] text-adm-neg"
              >
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              className="h-10 w-full"
              disabled={busy || passcode.length === 0}
            >
              {busy ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ArrowRight size={15} />
              )}
              Continue
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-[11.5px] text-adm-ink-3">
          Sessions expire after 8 hours.
        </p>
      </div>
    </div>
  );
}
