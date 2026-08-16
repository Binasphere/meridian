"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "@/lib/admin/client";
import type { DailyPoint, SiteTotals } from "@/lib/admin/types";

/**
 * The Overview page's data: per-domain lifetime totals plus a daily series.
 *
 * One endpoint for both, because the page draws them together and two requests
 * would let the headline figure and the chart under it disagree by a few
 * seconds — which is exactly the kind of discrepancy somebody screenshots.
 *
 * The window is a parameter rather than fixed, and changing it **holds the
 * previous render** instead of dropping back to a skeleton: `data` is only
 * cleared on an error, never at the start of a fetch. A dashboard that flashes
 * empty every time you change the range reads as broken.
 */

export interface OverviewState {
  sites: SiteTotals[] | null;
  daily: DailyPoint[] | null;
  days: number;
  setDays: (days: number) => void;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

/** The ranges offered above the charts. Kept small — a picker is not a feature. */
export const OVERVIEW_RANGES = [7, 30, 90] as const;

export function useOverview(
  onUnauthorised: () => void,
  enabled = true,
): OverviewState {
  const [sites, setSites] = useState<SiteTotals[] | null>(null);
  const [daily, setDaily] = useState<DailyPoint[] | null>(null);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (!enabled) {
      setSites([]);
      setDaily([]);
      setLoading(false);
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);

    try {
      const response = await adminFetch(`/api/admin/overview?days=${days}`);

      if (response.status === 401) {
        onUnauthorised();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as {
        sites?: SiteTotals[];
        daily?: DailyPoint[];
        error?: string;
      };

      if (!response.ok) {
        setError(body.error ?? "Could not load the overview");
        setSites([]);
        setDaily([]);
        return;
      }

      setError(null);
      setSites(body.sites ?? []);
      setDaily(body.daily ?? []);
    } catch {
      setError("Could not reach the server");
      setSites([]);
      setDaily([]);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [days, enabled, onUnauthorised]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { sites, daily, days, setDays, loading, error, reload };
}
