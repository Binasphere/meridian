/**
 * The products this codebase serves, and which one the browser is looking at.
 *
 * One build answers on more than one domain, so "which product am I" cannot be
 * a build-time constant — two customers running the same JavaScript are using
 * two different products, and the only thing that distinguishes them is the
 * address they typed. So it is read from `window.location.origin` at the moment
 * it is needed.
 *
 * This list must stay in step with the `sites` table seeded by
 * `supabase/sites.sql` and with `FALLBACK_SITES` in the payments service's
 * `sites.js`. Three copies is two too many, but the alternatives are worse: the
 * browser cannot query the table (it is service-role only, deliberately), and
 * fetching the list before a customer can sign in would put a network round
 * trip in front of the login form. The ids are the stable part and they change
 * approximately never.
 */

export interface Site {
  id: string;
  origin: string;
  name: string;
  primary: boolean;
}

export const SITES: readonly Site[] = [
  {
    id: "venti",
    origin: "https://ventitradingfx.com",
    name: "Venti",
    primary: true,
  },
  {
    id: "candix",
    origin: "https://candixfx.com",
    name: "Candix FX",
    primary: false,
  },
];

// The non-null assertion is load-bearing rather than lazy: `SITES` is a literal
// in this file with a primary entry, so the lookup cannot miss. Widening the
// type to `Site | undefined` would push a null check into every caller for a
// case that cannot occur.
export const PRIMARY_SITE: Site = SITES.find((site) => site.primary) ?? SITES[0]!;

function canonical(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.toLowerCase();
  } catch {
    return "";
  }
}

/**
 * The site this browser is on.
 *
 * Falls back to the primary site during server rendering and on any origin not
 * in the list — a preview deploy, `localhost`, a domain added to Vercel before
 * this file was updated. That is the same rule the service applies to an
 * unrecognised `Origin` header, and the two must agree: a customer whose
 * browser decided one thing while the backend decided another would be signing
 * in as an account that does not exist.
 *
 * Development therefore behaves as the primary site, which is what makes an
 * existing account testable on `localhost` at all.
 */
export function currentSite(): Site {
  if (typeof window === "undefined") return PRIMARY_SITE;

  const here = canonical(window.location.origin);
  return SITES.find((site) => canonical(site.origin) === here) ?? PRIMARY_SITE;
}

/** Shorthand — the id is what everything downstream actually wants. */
export function currentSiteId(): string {
  return currentSite().id;
}

/** `candixfx.com` from `https://candixfx.com`. */
export function siteHost(site: Site): string {
  return site.origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

export function siteById(id: string | null | undefined): Site | null {
  return SITES.find((site) => site.id === id) ?? null;
}

/** The product's name for display, falling back to the raw id. */
export function siteName(id: string | null | undefined): string {
  return siteById(id)?.name ?? id ?? "—";
}
