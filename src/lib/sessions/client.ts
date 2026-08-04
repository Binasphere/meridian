"use client";

import { BACKEND_ORIGIN } from "@/lib/backend";

/**
 * The host portal's transport.
 *
 * Same arrangement as the admin console's (`lib/admin/client.ts`): the routes
 * live on the backend service, because that is where the service-role key is,
 * and the session is an HMAC-signed expiring token carried as a Bearer header.
 *
 * One deliberate difference — `localStorage`, not `sessionStorage`. The admin's
 * token is per-tab and dies with it, which is right for a passcode shared by
 * one person on one machine. A host signs in on their own phone, goes live for
 * three hours, and switches apps constantly while doing it; a token that did
 * not survive the tab being closed would mean re-entering a password on air.
 * The exposure is small by construction: the token opens a page that can start
 * and stop that host's own broadcasts and read their own figures. It touches
 * no money and no customer data, and it expires after a week regardless.
 */

const TOKEN_KEY = "venti.host.token";

export function hostToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setHostToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode quirks). The portal still works for
    // this page's lifetime; the cost is signing in again after a refresh.
  }
}

/** `fetch` against the sessions API, with the host's token attached. */
export function hostFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = hostToken();
  return fetch(`${BACKEND_ORIGIN}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}
