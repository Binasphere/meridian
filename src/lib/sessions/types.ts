import { toMinor } from "@/lib/format";

/**
 * A promo session — one TikTok live — as both surfaces see it.
 *
 * Kept free of server imports so the host portal and the admin console can type
 * against it without pulling the service-role client anywhere near the browser
 * bundle, exactly like `lib/admin/types.ts`.
 *
 * Money is minor-unit *strings* throughout, for the reason stated there: a KES
 * figure in cents stops being exact as a JavaScript number long before it stops
 * being plausible, and never letting money become a `number` is what keeps
 * rounding bugs out of the codebase.
 */

export type HostStatus = "ACTIVE" | "SUSPENDED";

/** Who closed a broadcast. `AUTO` is the 12-hour reaper in `sessions.sql`. */
export type EndedBy = "HOST" | "ADMIN" | "AUTO";

export interface PromoHost {
  id: string;
  fullName: string;
  phone: string;
  status: HostStatus;
  createdAt: string;
}

/**
 * What a broadcast brought in. Every field is derived from the ledger on read,
 * so none of it can drift away from the cash events it summarises.
 */
export interface SessionScore {
  /** Completed deposits stamped to this session — the takings. */
  depositCount: number;
  depositMinor: string;
  /** Raised but not yet answered by M-Pesa. Not money yet, so never added in. */
  pendingCount: number;
  pendingMinor: string;
  /** Cancelled or timed out. A live where most pushes fail has a problem. */
  failedCount: number;
  /** Distinct people who actually paid. */
  depositors: number;
  /** Of those, the ones depositing for the first time ever. */
  newDepositors: number;
  /** Accounts created while the broadcast was open. */
  signups: number;
}

export interface PromoSession {
  id: string;
  hostId: string;
  hostName: string;
  hostPhone: string;
  hostStatus: HostStatus;
  /** What the host paid to promote this broadcast, entered before it started. */
  spendMinor: string;
  startedAt: string;
  endedAt: string | null;
  endedBy: EndedBy | null;
  stats: SessionScore;
}

/** Everything `/api/sessions/me` returns — the host portal's whole state. */
export interface HostSnapshot {
  host: PromoHost;
  /** This host's own open broadcast. */
  live: PromoSession | null;
  /** Set when somebody *else* holds the desk, so Start can say what is in the way. */
  blockedBy: { hostName: string; startedAt: string } | null;
  history: PromoSession[];
}

// ---------------------------------------------------------------------------
// The admin console's variant
// ---------------------------------------------------------------------------

/**
 * The same broadcast, as seen by a console role that may not see money.
 *
 * A separate type rather than making the fields optional on `PromoSession`,
 * because they are not optional everywhere — they are optional in exactly one
 * place. The host portal reads its own takings from `/api/sessions/me` and
 * always receives them; only `/api/admin/sessions` withholds, and only for a
 * SESSION_MANAGER. Loosening the shared type would have pushed an
 * `undefined` check into the host's console, where the case cannot arise.
 *
 * `PromoSession` is assignable to this, so an admin *with* the finance
 * capability needs no conversion — the redacted type is simply the wider one.
 */
export type AdminSessionScore = Omit<
  SessionScore,
  "depositMinor" | "pendingMinor"
> & {
  depositMinor?: string;
  pendingMinor?: string;
};

export type AdminPromoSession = Omit<PromoSession, "spendMinor" | "stats"> & {
  spendMinor?: string;
  stats: AdminSessionScore;
};

/** Everything `/api/admin/sessions` returns. */
export interface SessionsReport {
  sessions: AdminPromoSession[];
  hosts: PromoHost[];
  /**
   * Whether this caller's role was given the money figures.
   *
   * Stated by the server rather than inferred from the absent fields, so the
   * console never has to guess whether a missing amount means "withheld" or
   * "the payload changed shape".
   */
  money: boolean;
}

// ---------------------------------------------------------------------------
// Derived figures
// ---------------------------------------------------------------------------

/**
 * Takings less what the live cost to promote.
 *
 * An **admin figure**: it is rendered only by the admin console. The host
 * portal shows takings and promotion cost but never the difference, so keep
 * this out of anything under `components/sessions`.
 *
 * Pending deposits are excluded on purpose: counting money M-Pesa has not
 * confirmed would make a broadcast look profitable minutes before it turns out
 * not to be.
 */
export function netMinor(session: AdminPromoSession): bigint | null {
  const takings = session.stats.depositMinor;
  const spend = session.spendMinor;
  // Null rather than zero when either half was withheld. A net of zero and a
  // net nobody is allowed to see must not render the same.
  if (takings === undefined || spend === undefined) return null;
  return toMinor(takings) - toMinor(spend);
}

/** How long a broadcast ran, or has been running. */
export function elapsedMs(
  // Only the two timestamps, so this serves both the host's `PromoSession` and
  // the console's redacted `AdminPromoSession` without either being converted.
  // A duration was never a money figure and should not have depended on one.
  session: Pick<PromoSession, "startedAt" | "endedAt">,
  now: number,
): number {
  const end = session.endedAt ? Date.parse(session.endedAt) : now;
  return Math.max(0, end - Date.parse(session.startedAt));
}

/**
 * `2:14:07` — hours always present once there are any, because a live is
 * measured in hours and a bare `14:07` reads as fourteen minutes.
 */
export function formatElapsed(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const pad = (value: number) => value.toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/** The same span, spelled out — for records, where a ticking clock is noise. */
export function formatSpan(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
