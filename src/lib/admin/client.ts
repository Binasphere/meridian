"use client";

import { BACKEND_ORIGIN } from "@/lib/backend";

/**
 * The admin console's transport.
 *
 * The admin API lives on the backend service (see `lib/backend.ts`), not on
 * this deployment — the frontend host holds no secrets, so it has nothing to
 * guard an admin route with. The session is an HMAC-signed expiring token,
 * exchanged for the passcode and carried as a Bearer header on every call.
 *
 * It used to be an httpOnly `SameSite=strict` cookie; a cookie cannot cross
 * from the app's domain to the backend's, so the console now holds the token
 * itself, in sessionStorage: per-tab, gone when the tab closes, survives a
 * refresh. The trade is stated in the backend's `admin.js` — an XSS on this
 * origin could read it — accepted because the app serves no third-party
 * scripts and the token expires in eight hours regardless.
 */

const TOKEN_KEY = "venti.admin.token";

export function adminToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAdminToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage unavailable (private mode quirks): the console still works for
    // this page's lifetime if callers keep the token in memory — they don't,
    // so the worst case is re-entering the passcode after a refresh.
  }
}

/** `fetch` against the admin API, with the session token attached. */
export function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = adminToken();
  return fetch(`${BACKEND_ORIGIN}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}
