"use client";

import { useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { adminFetch } from "@/lib/admin/client";
import { cn } from "@/lib/utils";
import { useNotify } from "./ui";

/**
 * Issues a temporary password for a customer who has forgotten theirs.
 *
 * The password is shown here once — to read out on the call after confirming
 * who the customer is — and is not stored anywhere readable afterwards.
 */
export function ResetPasswordControl({ userId, name }: { userId: string; name: string }) {
  const notify = useNotify();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    const response = await adminFetch(`/api/admin/users/${userId}/password`, {
      method: "POST",
    }).catch(() => null);
    const body = response
      ? ((await response.json().catch(() => ({}))) as { password?: string; error?: string })
      : { error: "Could not reach the backend" };
    setBusy(false);
    setConfirming(false);

    if (!response?.ok || !body.password) {
      notify({ tone: "error", title: "Could not reset the password", body: body.error });
      return;
    }
    setPassword(body.password);
  }

  if (password) {
    return (
      <div className="flex items-center gap-2 border border-adm-accent-line bg-adm-accent-tint px-2 py-1 text-[11.5px] text-adm-accent-deep">
        Temporary password
        <span className="tnum select-all font-mono font-semibold">{password}</span>
        <button
          onClick={() => {
            void navigator.clipboard?.writeText(password);
            notify({ tone: "success", title: "Copied", body: `Read it to ${name}.` });
          }}
          aria-label="Copy password"
          className="text-adm-accent-deep/70 hover:text-adm-accent-deep"
        >
          <Copy size={12} />
        </button>
        <button onClick={() => setPassword(null)} className="text-adm-ink-3 hover:text-adm-ink">
          Done
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => (confirming ? void reset() : setConfirming(true))}
      onBlur={() => setConfirming(false)}
      disabled={busy}
      className={cn(
        "flex items-center gap-1.5 rounded-none border px-2 py-1 text-[11.5px] transition-colors disabled:opacity-40",
        confirming
          ? "border-adm-neg text-adm-neg"
          : "border-adm-line-strong text-adm-ink-2 hover:border-adm-accent hover:text-adm-ink",
      )}
    >
      <KeyRound size={12} className={confirming ? "" : "text-adm-ink-4"} />
      {busy ? "Resetting…" : confirming ? "Confirm reset" : "Reset password"}
    </button>
  );
}
