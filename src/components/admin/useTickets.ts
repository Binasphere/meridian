"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";
import type { AdminTicket } from "@/lib/admin/types";

export type TicketFilter = "OPEN" | "RESOLVED" | "ALL";

export interface TicketsState {
  tickets: AdminTicket[] | null;
  loading: boolean;
  error: string | null;
  filter: TicketFilter;
  setFilter: (filter: TicketFilter) => void;
  reload: () => void;
  update: (
    id: string,
    patch: { status?: "OPEN" | "RESOLVED"; adminNote?: string | null },
  ) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

/** The support queue. Same shape as `useWithdrawals`, without the money. */
export function useTickets(
  onUnauthorised: () => void,
  enabled = true,
  site: string | null = null,
): TicketsState {
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TicketFilter>("OPEN");

  const reload = useCallback(async () => {
    if (!enabled) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (site) params.set("site", site);
      params.set("status", filter);
      const response = await adminFetch(`/api/admin/tickets?${params.toString()}`);
      const body = (await response.json().catch(() => ({}))) as {
        tickets?: AdminTicket[];
        error?: string;
      };
      if (response.status === 401) {
        onUnauthorised();
        return;
      }
      if (!response.ok) {
        setError(body.error ?? "Could not load tickets");
        setTickets([]);
        return;
      }
      setError(null);
      setTickets(body.tickets ?? []);
    } catch {
      setError("Could not reach the backend");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, site, filter, onUnauthorised]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const update = useCallback<TicketsState["update"]>(
    async (id, patch) => {
      const response = await adminFetch(`/api/admin/tickets/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => null);
      if (!response) return { ok: false, reason: "Could not reach the backend" };
      const body = (await response.json().catch(() => ({}))) as {
        ticket?: AdminTicket;
        error?: string;
      };
      if (response.status === 401) {
        onUnauthorised();
        return { ok: false, reason: "Signed out" };
      }
      if (!response.ok || !body.ticket) {
        return { ok: false, reason: body.error ?? "Could not update the ticket" };
      }
      const next = body.ticket;
      setTickets((current) =>
        (current ?? [])
          .map((t) => (t.id === id ? next : t))
          // A ticket that no longer matches the filter leaves the list.
          .filter((t) => filter === "ALL" || t.status === filter),
      );
      return { ok: true };
    },
    [filter, onUnauthorised],
  );

  return { tickets, loading, error, filter, setFilter, reload, update };
}
