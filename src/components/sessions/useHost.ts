"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hostFetch } from "@/lib/sessions/client";
import type { HostSnapshot } from "@/lib/sessions/types";

/**
 * The host portal's data.
 *
 * One endpoint feeds the whole page, and the page re-reads it on a timer: a
 * broadcast's figures move while nobody touches the screen, which is the
 * opposite of every other surface in this app. That is also why the poll is
 * suspended while the tab is hidden — a host has their phone in their hand for
 * three hours and the page is behind the camera app for most of it.
 *
 * The clock is *not* driven from here. Elapsed time ticks locally once a
 * second in the component; asking the server what time it is ten times a
 * second would be absurd, and the start timestamp is all that is needed.
 */

const POLL_MS = 12_000;

export type HostResult = { ok: true } | { ok: false; reason: string };

export interface HostState {
  snapshot: HostSnapshot | null;
  loading: boolean;
  error: string | null;
  busy: boolean;
  reload: () => Promise<void>;
  start: (spendMinor: bigint) => Promise<HostResult>;
  end: (sessionId: string) => Promise<HostResult>;
}

export function useHost(onSignedOut: () => void): HostState {
  const [snapshot, setSnapshot] = useState<HostSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Read inside the interval callback so the poll never restarts when a
  // request lands — an effect keyed on `loading` would re-arm the timer on
  // every tick and drift.
  const inFlight = useRef(false);

  const reload = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    try {
      const response = await hostFetch("/api/sessions/me");

      if (response.status === 401) {
        onSignedOut();
        return;
      }

      const body = (await response.json().catch(() => ({}))) as
        | (HostSnapshot & { error?: string })
        | { error?: string };

      if (!response.ok) {
        setError(("error" in body && body.error) || "Could not load your sessions");
        return;
      }

      setError(null);
      setSnapshot(body as HostSnapshot);
    } catch {
      setError("Could not reach the server");
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [onSignedOut]);

  useEffect(() => {
    void reload();

    const tick = () => {
      if (document.visibilityState === "visible") void reload();
    };
    const timer = setInterval(tick, POLL_MS);

    // A tab coming back to the front should not wait out the rest of the
    // interval to show the figures it missed.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [reload]);

  const post = useCallback(
    async (path: string, payload: unknown): Promise<HostResult> => {
      setBusy(true);
      try {
        const response = await hostFetch(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (response.status === 401) {
          onSignedOut();
          return { ok: false, reason: "Your session expired. Sign in again." };
        }

        const body = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) {
          return { ok: false, reason: body.error ?? "Something went wrong" };
        }

        // Re-read rather than patch in place: what a broadcast is worth is the
        // server's to say, and it already differs from anything guessed here
        // the moment the first deposit lands.
        await reload();
        return { ok: true };
      } catch {
        return { ok: false, reason: "Could not reach the server" };
      } finally {
        setBusy(false);
      }
    },
    [onSignedOut, reload],
  );

  const start = useCallback(
    (spendMinor: bigint) =>
      post("/api/sessions/start", { spendMinor: Number(spendMinor) }),
    [post],
  );

  const end = useCallback(
    (sessionId: string) => post("/api/sessions/end", { id: sessionId }),
    [post],
  );

  return { snapshot, loading, error, busy, reload, start, end };
}
