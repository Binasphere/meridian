"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch, siteQuery } from "@/lib/admin/client";
import type {
  AdminPromoSession,
  HostStatus,
  PromoHost,
} from "@/lib/sessions/types";

/**
 * The promo desk, from the admin's side.
 *
 * One endpoint returns every broadcast and the roster that ran them, and it is
 * re-read on a timer for the same reason the host's own page is: while somebody
 * is live these figures move on their own, and an admin watching a live is
 * watching precisely that.
 *
 * Both verdicts re-read rather than patching in place. Ending a broadcast is
 * the moment its duration and its final takings stop moving, and those are the
 * server's to state.
 */

const POLL_MS = 15_000;

export type SessionsResult = { ok: true } | { ok: false; reason: string };

export interface SessionsState {
  sessions: AdminPromoSession[] | null;
  hosts: PromoHost[] | null;
  loading: boolean;
  error: string | null;
  pending: Record<string, boolean>;
  /**
   * Whether this admin's role was sent the money figures. Read from the
   * server's own answer, never inferred from a missing field.
   */
  money: boolean;
  reload: () => Promise<void>;
  startSession: (hostId: string, spendMinor: string) => Promise<SessionsResult>;
  endSession: (id: string) => Promise<SessionsResult>;
  setHostStatus: (id: string, status: HostStatus) => Promise<SessionsResult>;
}

export function useSessions(
  onUnauthorised: () => void,
  enabled = true,
  /** Narrows to one product. Null shows every domain, which is the default. */
  site: string | null = null,
): SessionsState {
  const [sessions, setSessions] = useState<AdminPromoSession[] | null>(null);
  const [hosts, setHosts] = useState<PromoHost[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  // Assume withheld until told otherwise: if the flag never arrives, the
  // console shows no figures, which is the safe direction to fail in.
  const [money, setMoney] = useState(false);

  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setSessions([]);
      setHosts([]);
      setLoading(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    try {
      const response = await adminFetch(`/api/admin/sessions${siteQuery(site)}`);

      if (response.status === 401) {
        onUnauthorised();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        sessions?: AdminPromoSession[];
        hosts?: PromoHost[];
        money?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Could not load sessions");
        setSessions([]);
        setHosts([]);
        return;
      }

      setError(null);
      setSessions(body.sessions ?? []);
      setHosts(body.hosts ?? []);
      setMoney(Boolean(body.money));
    } catch {
      setError("Could not reach the server");
      setSessions([]);
      setHosts([]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [enabled, onUnauthorised, site]);

  useEffect(() => {
    void reload();

    const tick = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const patch = useCallback(
    async (
      key: string,
      path: string,
      payload: unknown,
      method: "PATCH" | "POST" = "PATCH",
    ): Promise<SessionsResult> => {
      setPending((state) => ({ ...state, [key]: true }));

      try {
        const response = await adminFetch(path, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Update failed (${response.status})`);
        }

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
          delete next[key];
          return next;
        });
      }
    },
    [reload],
  );

  const startSession = useCallback(
    (hostId: string, spendMinor: string) =>
      patch("start", "/api/admin/sessions", { hostId, spendMinor }, "POST"),
    [patch],
  );

  const endSession = useCallback(
    (id: string) => patch(id, `/api/admin/sessions/${id}`, { action: "END" }),
    [patch],
  );

  const setHostStatus = useCallback(
    (id: string, status: HostStatus) =>
      patch(id, `/api/admin/hosts/${id}`, { status }),
    [patch],
  );

  return {
    sessions,
    hosts,
    loading,
    error,
    pending,
    money,
    reload,
    startSession,
    endSession,
    setHostStatus,
  };
}
