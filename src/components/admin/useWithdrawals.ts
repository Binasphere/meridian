"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminWithdrawal } from "@/lib/admin/types";

/**
 * The payout queue's data and its two verdicts.
 *
 * Mirrors the shape of `useUsers`: one fetch feeding the view, per-row busy
 * flags while a verdict is in flight. No optimistic update here, deliberately
 * — a tier badge can flicker back on failure and no harm is done, but a row
 * that shows "paid" for even a moment when the database said "already decided"
 * is exactly the confusion that gets a request paid twice by two admins.
 */

export type WithdrawalVerdict =
  | { action: "PAID"; reference: string }
  | { action: "REJECT"; reason?: string };

export interface WithdrawalsState {
  withdrawals: AdminWithdrawal[] | null;
  loading: boolean;
  error: string | null;
  pending: Record<string, boolean>;
  reload: () => void;
  decide: (
    id: string,
    verdict: WithdrawalVerdict,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function useWithdrawals(onUnauthorised: () => void): WithdrawalsState {
  const [withdrawals, setWithdrawals] = useState<AdminWithdrawal[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/withdrawals");
      const body = (await response.json().catch(() => ({}))) as {
        withdrawals?: AdminWithdrawal[];
        error?: string;
      };

      if (response.status === 401) {
        onUnauthorised();
        return;
      }
      if (!response.ok) {
        setError(body.error ?? "Could not load withdrawals");
        setWithdrawals([]);
        return;
      }

      setError(null);
      setWithdrawals(body.withdrawals ?? []);
    } catch {
      setError("Could not reach the server");
      setWithdrawals([]);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorised]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const decide = useCallback<WithdrawalsState["decide"]>(
    async (id, verdict) => {
      setPending((state) => ({ ...state, [id]: true }));

      try {
        const response = await fetch(`/api/admin/withdrawals/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(verdict),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Update failed (${response.status})`);
        }

        // Re-read rather than patch in place: the decided row's final state
        // (reference, settled time) is the server's to report.
        await reload();
        return { ok: true };
      } catch (cause) {
        return {
          ok: false,
          reason: cause instanceof Error ? cause.message : "Update failed",
        };
      } finally {
        setPending((state) => {
          const next = { ...state };
          delete next[id];
          return next;
        });
      }
    },
    [reload],
  );

  return { withdrawals, loading, error, pending, reload, decide };
}
