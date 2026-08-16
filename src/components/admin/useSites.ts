"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin/client";
import type { SiteTotals } from "@/lib/admin/types";

/**
 * What each domain has actually done.
 *
 * One request, no polling — the figures here are lifetime totals per product,
 * and a number that only moves when a customer deposits does not need a
 * fifteen-second refresh to stay useful.
 *
 * `money` mirrors the sessions hook: the server states whether this role was
 * sent the shilling figures rather than the console inferring it from a missing
 * field, so "withheld" and "zero" can never be confused.
 */

export interface SitesState {
  sites: SiteTotals[] | null;
  loading: boolean;
  error: string | null;
  money: boolean;
  reload: () => Promise<void>;
}

export function useSites(onUnauthorised: () => void): SitesState {
  const [sites, setSites] = useState<SiteTotals[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [money, setMoney] = useState(false);

  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    try {
      const response = await adminFetch("/api/admin/sites");

      if (response.status === 401) {
        onUnauthorised();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        sites?: SiteTotals[];
        money?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Could not load domains");
        setSites([]);
        return;
      }

      setError(null);
      setSites(body.sites ?? []);
      setMoney(Boolean(body.money));
    } catch {
      setError("Could not reach the server");
      setSites([]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [onUnauthorised]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { sites, loading, error, money, reload };
}
