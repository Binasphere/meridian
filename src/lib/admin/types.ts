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
