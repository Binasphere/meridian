"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/admin/client";
import type { AdminDeposit, AdminDepositTotals } from "@/lib/admin/types";

/**
 * The Deposits page's data. Read-only: nothing here can change a deposit —
 * crediting stays with PayHero's callback and `deposit_settle`.
 *
 * Filters are applied on the server so the totals cover everything that
 * matches, not just what happened to be on the first page.
 */

export type DepositStatusFilter = "ALL" | "COMPLETED" | "PENDING" | "FAILED";
export type DepositDemoFilter = "real" | "demo" | "all";
export type DepositPeriod = "today" | "7d" | "30d" | "all" | "custom";

export interface DepositFilters {
  status: DepositStatusFilter;
  demo: DepositDemoFilter;
  period: DepositPeriod;
  /** YYYY-MM-DD, used when period is "custom". */
  from: string;
  to: string;
  q: string;
}

export const DEFAULT_DEPOSIT_FILTERS: DepositFilters = {
  status: "ALL",
  demo: "real",
  period: "30d",
  from: "",
  to: "",
  q: "",
};

export interface DepositsState {
  deposits: AdminDeposit[] | null;
  totals: AdminDepositTotals | null;
  truncated: boolean;
  loading: boolean;
  error: string | null;
  filters: DepositFilters;
  setFilters: (patch: Partial<DepositFilters>) => void;
  resetFilters: () => void;
  reload: () => void;
}

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The from/to a period stands for. Days are the admin's local calendar days. */
export function periodRange(filters: DepositFilters): { from: string; to: string } {
  const today = new Date();
  const back = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return isoDay(d);
  };
  switch (filters.period) {
    case "today":
      return { from: isoDay(today), to: isoDay(today) };
    case "7d":
      return { from: back(6), to: isoDay(today) };
    case "30d":
      return { from: back(29), to: isoDay(today) };
    case "custom":
      return { from: filters.from, to: filters.to };
    default:
      return { from: "", to: "" };
  }
}

export function useDeposits(
  onUnauthorised: () => void,
  enabled = true,
  site: string | null = null,
): DepositsState {
  const [deposits, setDeposits] = useState<AdminDeposit[] | null>(null);
  const [totals, setTotals] = useState<AdminDepositTotals | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilterState] = useState<DepositFilters>(DEFAULT_DEPOSIT_FILTERS);

  // The search box is debounced so each keystroke is not a request.
  const [q, setQ] = useState(filters.q);
  useEffect(() => {
    const timer = setTimeout(() => setQ(filters.q.trim()), 350);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const { from, to } = periodRange(filters);

  const reload = useCallback(async () => {
    if (!enabled) {
      setDeposits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (site) params.set("site", site);
      if (filters.status !== "ALL") params.set("status", filters.status);
      params.set("demo", filters.demo);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (q) params.set("q", q);

      const response = await adminFetch(`/api/admin/deposits?${params.toString()}`);
      const body = (await response.json().catch(() => ({}))) as {
        deposits?: AdminDeposit[];
        totals?: AdminDepositTotals;
        truncated?: boolean;
        error?: string;
      };

      if (response.status === 401) {
        onUnauthorised();
        return;
      }
      if (!response.ok) {
        setError(
          response.status === 404
            ? "The backend does not have the deposits endpoint yet — redeploy it."
            : (body.error ?? "Could not load deposits"),
        );
        setDeposits([]);
        setTotals(null);
        return;
      }

      setError(null);
      setDeposits(body.deposits ?? []);
      setTotals(body.totals ?? null);
      setTruncated(Boolean(body.truncated));
    } catch {
      setError("Could not reach the server");
      setDeposits([]);
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [enabled, onUnauthorised, site, filters.status, filters.demo, from, to, q]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setFilters = useCallback(
    (patch: Partial<DepositFilters>) => setFilterState((state) => ({ ...state, ...patch })),
    [],
  );
  const resetFilters = useCallback(() => setFilterState(DEFAULT_DEPOSIT_FILTERS), []);

  return {
    deposits,
    totals,
    truncated,
    loading,
    error,
    filters,
    setFilters,
    resetFilters,
    reload,
  };
}
