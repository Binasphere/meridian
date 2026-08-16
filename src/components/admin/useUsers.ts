"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, siteQuery } from "@/lib/admin/client";
import type { AdminUser } from "@/lib/admin/types";
import type { LiveTier } from "@/lib/trading";

/**
 * The console's single source of user data.
 *
 * One fetch feeds both views, so Overview's counts and the Users table can
 * never disagree with each other — which they would if each owned its own
 * request and one of them was a few seconds stale.
 *
 * Search is applied in the browser. `/api/admin/users` also accepts a `q`
 * parameter, and that is what to switch to when the population outgrows the
 * route's 200-row page; below that, filtering an array already in memory is
 * instant and avoids a debounce, a request per keystroke, and the stale-response
 * race that comes with them.
 */

export interface UsersState {
  users: AdminUser[] | null;
  loading: boolean;
  error: string | null;
  /** Set while a specific user's tier is being written. */
  pending: Record<string, boolean>;
  reload: () => void;
  setTier: (
    user: AdminUser,
    tier: LiveTier,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /**
   * Assigns (or clears) the M-Pesa clone wallet for one account.
   *
   * `pin: null` unlinks the handset and deletes the wallet. Unlike `setTier`
   * this is not optimistic: a PIN can be refused for being already in use, and
   * showing a PIN the database rejected would have an admin reading the wrong
   * four digits out to a customer.
   */
  setWallet: (
    user: AdminUser,
    input: { pin: string | null; balanceMinor?: string },
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

/**
 * `enabled` is false for a console role without the `finance` capability. The
 * request would be refused server-side anyway; not sending it keeps a session
 * manager's console from generating a stream of 403s that look like a fault.
 */
export function useUsers(
  onUnauthorised: () => void,
  enabled = true,
  /** Narrows to one product. Null shows every domain, which is the default. */
  site: string | null = null,
): UsersState {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const reload = useCallback(async () => {
    if (!enabled) {
      // An empty list rather than null: null means "still loading", and a view
      // that will never load would sit on a skeleton for ever.
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const response = await adminFetch(`/api/admin/users${siteQuery(site)}`);
      const body = (await response.json().catch(() => ({}))) as {
        users?: AdminUser[];
        error?: string;
      };

      if (response.status === 401) {
        onUnauthorised();
        return;
      }
      if (!response.ok) {
        setError(body.error ?? "Could not load users");
        setUsers([]);
        return;
      }

      setError(null);
      setUsers(body.users ?? []);
    } catch {
      setError("Could not reach the server");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, onUnauthorised, site]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /**
   * Writes a tier optimistically and rolls back if the write is refused.
   *
   * A round-trip's delay before the badge moves reads as a dead control, and an
   * admin who cannot tell whether the click registered clicks again. The
   * rollback is the other half of the bargain: the row must never keep showing
   * a tier the database did not accept.
   */
  const setTier = useCallback<UsersState["setTier"]>(async (user, tier) => {
    const previous = user.liveTier;
    if (previous === tier) return { ok: true };

    setPending((state) => ({ ...state, [user.id]: true }));
    setUsers((state) =>
      state?.map((row) => (row.id === user.id ? { ...row, liveTier: tier } : row)) ?? state,
    );

    try {
      const response = await adminFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ liveTier: tier }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Update failed (${response.status})`);
      }

      return { ok: true };
    } catch (cause) {
      setUsers((state) =>
        state?.map((row) => (row.id === user.id ? { ...row, liveTier: previous } : row)) ??
        state,
      );
      return {
        ok: false,
        reason: cause instanceof Error ? cause.message : "Update failed",
      };
    } finally {
      setPending((state) => {
        const next = { ...state };
        delete next[user.id];
        return next;
      });
    }
  }, []);

  const setWallet = useCallback<UsersState["setWallet"]>(async (user, input) => {
    setPending((state) => ({ ...state, [user.id]: true }));

    try {
      const response = await adminFetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mpesaPin: input.pin,
          ...(input.balanceMinor === undefined
            ? {}
            : { mpesaBalanceMinor: input.balanceMinor }),
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        user?: AdminUser;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? `Update failed (${response.status})`);
      }

      // The route answers with the row as it now stands, so the table takes
      // the server's version rather than guessing at what it wrote.
      if (body.user) {
        setUsers((state) =>
          state?.map((row) => (row.id === user.id ? body.user! : row)) ?? state,
        );
      }

      return { ok: true };
    } catch (cause) {
      return {
        ok: false,
        reason: cause instanceof Error ? cause.message : "Update failed",
      };
    } finally {
      setPending((state) => {
        const next = { ...state };
        delete next[user.id];
        return next;
      });
    }
  }, []);

  return { users, loading, error, pending, reload, setTier, setWallet };
}
