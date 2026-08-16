/**
 * The domains this platform is served on.
 *
 * A hardcoded list, and honestly so. There is no `sites` table yet: every
 * domain currently serves the same build against the same Supabase project,
 * which means the database has no way to tell you which one a customer or a
 * deposit came from. A "domain management" screen backed by nothing would be a
 * screen that lies — it would imply the split exists.
 *
 * So this file is the single place the two domains are named, the console
 * renders them read-only, and everything that would need a `site` column says
 * plainly that it is not built yet. When that column lands, this list becomes
 * the seed for the table and the console's Domains view starts showing real
 * figures instead of a notice.
 *
 * Kept in `lib/admin` rather than `lib/site.ts` because that module answers
 * "which domain am I being served from right now" — a per-build question — and
 * this one answers "which domains exist", which is a platform-wide fact the
 * console needs regardless of where it is being viewed.
 */

export interface PlatformDomain {
  /** Stable key. This is what a `cash_events.site` column would store. */
  id: string;
  /** Origin, no trailing slash. */
  origin: string;
  /** What this product calls itself to its own customers. */
  name: string;
  /**
   * True for the domain the shared infrastructure was built around — the one
   * whose accounts carry the untagged identity (`254…@meridian.invalid`) and
   * whose canonical URLs the sitemap advertises.
   */
  primary: boolean;
  note: string;
}

export const PLATFORM_DOMAINS: readonly PlatformDomain[] = [
  {
    id: "venti",
    origin: "https://ventitradingfx.com",
    name: "Venti",
    primary: true,
    note: "The original deployment. Every existing account and every deposit on record belongs to this domain.",
  },
  {
    id: "candix",
    origin: "https://candixfx.com",
    name: "Candix FX",
    primary: false,
    note: "Serving the same build and the same database. Not yet separated — its customers and takings are indistinguishable from Venti's.",
  },
];

/** The display host: `candixfx.com` from `https://candixfx.com`. */
export function domainHost(domain: PlatformDomain): string {
  return domain.origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
}
