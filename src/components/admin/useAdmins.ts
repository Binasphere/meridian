"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch, setAdminToken } from "@/lib/admin/client";
import type { AdminAccount, AdminRole, AdminStatus } from "@/lib/admin/types";

/**
 * The admin roster, and the operations on it.
 *
 * Unlike `useSessions` this does **not** poll. The roster changes when somebody
 * in this console changes it, not on its own, and a background request that
 * re-reads who holds the keys every fifteen seconds is a request that keeps a
 * privileged endpoint warm for no reason.
 *
 * Every mutation re-reads rather than patching state in place. Roles and
 * statuses have server-side invariants — the last super admin cannot be
 * demoted — so the row that comes back is the truth and the row we predicted
 * might not be.
 */

export type AdminsResult = { ok: true } | { ok: false; reason: string };

export interface AdminsState {
  admins: AdminAccount[] | null;
  loading: boolean;
  error: string | null;
  /** Keyed by admin id, or by an operation name for the ones without one. */
  pending: Record<string, boolean>;
  reload: () => Promise<void>;
  create: (input: {
    username: string;
    fullName: string;
    password: string;
    role: AdminRole;
  }) => Promise<AdminsResult>;
  setRole: (id: string, role: AdminRole) => Promise<AdminsResult>;
  setStatus: (id: string, status: AdminStatus) => Promise<AdminsResult>;
  resetPassword: (id: string, password: string) => Promise<AdminsResult>;
  remove: (id: string) => Promise<AdminsResult>;
  changeOwnPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<AdminsResult>;
}

export function useAdmins(onUnauthorised: () => void): AdminsState {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});

  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    try {
      const response = await adminFetch("/api/admin/admins");

      if (response.status === 401) {
        onUnauthorised();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        admins?: AdminAccount[];
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Could not load admins");
        setAdmins([]);
        return;
      }

      setError(null);
      setAdmins(body.admins ?? []);
    } catch {
      setError("Could not reach the server");
      setAdmins([]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [onUnauthorised]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const send = useCallback(
    async (
      key: string,
      path: string,
      method: "POST" | "PATCH" | "DELETE",
      payload?: unknown,
      /** Skipped by the password change, which re-reads nothing. */
      refresh = true,
    ): Promise<AdminsResult> => {
      setPending((state) => ({ ...state, [key]: true }));

      try {
        const response = await adminFetch(path, {
          method,
          ...(payload === undefined
            ? {}
            : {
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
              }),
        });

        if (response.status === 401) {
          onUnauthorised();
          return { ok: false, reason: "Your session has expired" };
        }

        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          token?: string;
        };

        if (!response.ok) {
          return { ok: false, reason: body.error ?? `Failed (${response.status})` };
        }

        // A password change mints a replacement token, because the change
        // itself invalidates the one this browser is holding.
        if (body.token) setAdminToken(body.token);

        if (refresh) await reload();
        return { ok: true };
      } catch {
        return { ok: false, reason: "Could not reach the server" };
      } finally {
        setPending((state) => {
          const next = { ...state };
          delete next[key];
          return next;
        });
      }
    },
    [onUnauthorised, reload],
  );

  return {
    admins,
    loading,
    error,
    pending,
    reload,
    create: useCallback(
      (input) => send("create", "/api/admin/admins", "POST", input),
      [send],
    ),
    setRole: useCallback(
      (id, role) => send(id, `/api/admin/admins/${id}`, "PATCH", { role }),
      [send],
    ),
    setStatus: useCallback(
      (id, status) => send(id, `/api/admin/admins/${id}`, "PATCH", { status }),
      [send],
    ),
    resetPassword: useCallback(
      (id, password) => send(id, `/api/admin/admins/${id}`, "PATCH", { password }),
      [send],
    ),
    remove: useCallback(
      (id) => send(id, `/api/admin/admins/${id}`, "DELETE"),
      [send],
    ),
    changeOwnPassword: useCallback(
      (currentPassword, newPassword) =>
        send(
          "own-password",
          "/api/admin/password",
          "POST",
          { currentPassword, newPassword },
          false,
        ),
      [send],
    ),
  };
}
