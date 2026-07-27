import type { LiveTier } from "@/lib/trading";

/**
 * The shape the admin API returns for a user.
 *
 * Kept in its own module with no server imports so the client component can
 * type against it without dragging `node:crypto` or the service-role client
 * anywhere near the browser bundle.
 *
 * Balances are minor-unit *strings*, matching the discipline everywhere else in
 * the app: a KES balance in cents past ~90 trillion loses precision as a
 * JavaScript number, and more to the point, never letting money become a
 * `number` is what keeps rounding bugs out of the codebase.
 */
export interface AdminUser {
  id: string;
  phone: string;
  username: string;
  liveTier: LiveTier;
  demoBalanceMinor: string;
  liveBalanceMinor: string;
  createdAt: string;
}

export const LIVE_TIERS = ["STANDARD", "VIP"] as const;

export function isLiveTier(value: unknown): value is LiveTier {
  return typeof value === "string" && (LIVE_TIERS as readonly string[]).includes(value);
}

/**
 * A withdrawal request as the console sees it: the cash event joined with
 * enough of the requester's profile to know who is being paid.
 *
 * PENDING rows are the queue — the funds are already held (debited when the
 * request was raised), and the admin either pays the number via M-Pesa and
 * confirms with the reference, or rejects and the hold is refunded.
 */
export interface AdminWithdrawal {
  id: string;
  userId: string;
  phone: string;
  username: string;
  amountMinor: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reference: string | null;
  failureReason: string | null;
  createdAt: string;
  settledAt: string | null;
}
