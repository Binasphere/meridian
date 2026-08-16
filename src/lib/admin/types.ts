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

  /**
   * The M-Pesa clone wallet, when this VIP has one. `null` on every account the
   * admin has not set up for the demo, which is all of them by default.
   *
   * `mpesaPin` is readable on purpose: an admin has to be able to tell the
   * customer what to type into the handset. It is admin-assigned and guards a
   * prop balance — it is never the customer's real M-Pesa PIN. See
   * `supabase/mpesa-demo.sql`.
   */
  mpesaPin: string | null;
  mpesaBalanceMinor: string | null;
}

export const LIVE_TIERS = ["STANDARD", "VIP"] as const;

export function isLiveTier(value: unknown): value is LiveTier {
  return typeof value === "string" && (LIVE_TIERS as readonly string[]).includes(value);
}

/**
 * A console operator — a row of `admin_users`, not a customer.
 *
 * `AdminAccount` rather than `AdminUser` because that name was taken years
 * earlier in this very file by the *customer* shape, and two types called
 * almost the same thing on either side of the same console is how somebody
 * eventually renders a balance where a role belongs.
 *
 * There is no password field of any kind, including a digest. The API never
 * sends one — `admin_roster()` in `supabase/admins.sql` names its columns
 * precisely so it cannot — and the absence here is the type system agreeing.
 */
export interface AdminAccount {
  id: string;
  username: string;
  fullName: string;
  role: AdminRole;
  status: AdminStatus;
  createdAt: string | null;
  /** Null until they have signed in once. */
  lastLoginAt: string | null;
  /** Null for the bootstrap super admin, which nobody created. */
  createdByName: string | null;
}

export const ADMIN_ROLES = ["SUPER_ADMIN", "ADMIN", "SESSION_MANAGER"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export type AdminStatus = "ACTIVE" | "SUSPENDED";

/**
 * What each role may do — the mirror of `CAPABILITIES` in the service's
 * `admin.js`.
 *
 * A mirror, and only a mirror. Nothing here grants anything: the service
 * refuses the routes and omits the figures on its own, and this copy exists
 * solely so the console can avoid rendering a menu item that would 403. If the
 * two ever disagree, the service wins and the user sees an error instead of a
 * leak — which is the right way round for a duplicated rule.
 */
const CAPABILITIES: Record<AdminRole, readonly AdminCapability[]> = {
  SUPER_ADMIN: ["admins", "finance", "sessions"],
  ADMIN: ["finance", "sessions"],
  SESSION_MANAGER: ["sessions"],
};

export type AdminCapability = "admins" | "finance" | "sessions";

export function roleCan(
  role: AdminRole | null | undefined,
  capability: AdminCapability,
): boolean {
  return role ? CAPABILITIES[role].includes(capability) : false;
}

/** How each role is named to the people using the console. */
export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  ADMIN: "Admin",
  SESSION_MANAGER: "Session manager",
};

export const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Everything, including adding and removing admins",
  ADMIN: "Everything except managing admins",
  SESSION_MANAGER: "Broadcasts only — no customers, balances or money figures",
};

/** The password floor, mirrored from `MIN_ADMIN_PASSWORD_LENGTH` on the service. */
export const MIN_ADMIN_PASSWORD_LENGTH = 10;

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
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
