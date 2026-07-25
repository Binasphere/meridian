import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The admin panel's door. **Server only.**
 *
 * Deliberately the smallest thing that is actually a lock: one shared passcode,
 * checked in constant time, exchanged for a short-lived HMAC-signed cookie.
 * There is no admin user table and no roles yet, because the app's own accounts
 * are still a client-side simulation (`lib/auth.ts`) — inventing an admin
 * identity on top of a simulated one would be theatre. When users move onto
 * Supabase Auth, this file and `guard.ts` are the only two that change — the
 * question becomes "is this signed-in user flagged as an admin?" and every
 * route downstream is untouched.
 *
 * Two properties are non-negotiable even at this size:
 *
 *   - No default passcode. Unset means the panel is *off*, not open. A shipped
 *     default is a published password.
 *   - The cookie is signed, httpOnly and expiring. A bare `admin=true` cookie
 *     is not a session; it is a suggestion the browser is free to forge.
 */

export const ADMIN_COOKIE = "meridian_admin";

/** Eight hours — a working day, and short enough that a stale tab re-asks. */
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function passcode(): string {
  return process.env.ADMIN_PASSCODE ?? "";
}

function secret(): string {
  // Falls back to the passcode so a half-configured env still signs cookies
  // with *something* secret rather than with a constant.
  return process.env.AUTH_SECRET || passcode();
}

/** True when a passcode has been set. When false, /admin serves nothing. */
export function isAdminEnabled(): boolean {
  return passcode().length > 0;
}

/**
 * Constant-time comparison.
 *
 * `a === b` short-circuits at the first differing byte, which turns response
 * latency into an oracle that leaks the passcode a character at a time. Lengths
 * are compared through the HMAC so even that does not leak.
 */
function safeEqual(a: string, b: string): boolean {
  const key = secret();
  const ha = createHmac("sha256", key).update(a).digest();
  const hb = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Verifies a submitted passcode. */
export function verifyPasscode(input: string): boolean {
  const expected = passcode();
  if (!expected) return false;
  return safeEqual(input, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

/** Mints a session token: `<expiry>.<signature>`. */
export function issueToken(now = Date.now()): string {
  const expiry = String(now + SESSION_TTL_MS);
  return `${expiry}.${sign(expiry)}`;
}

/** Seconds until the token issued now expires — for the cookie's Max-Age. */
export const SESSION_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000);

/** Validates a session token: well-formed, correctly signed, unexpired. */
export function verifyToken(token: string | undefined, now = Date.now()): boolean {
  if (!token || !isAdminEnabled()) return false;

  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const expiry = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  // Signature first: an expired-but-authentic token and a forged one should be
  // indistinguishable in how long they take to reject.
  if (!safeEqual(signature, sign(expiry))) return false;

  const expiresAt = Number(expiry);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
