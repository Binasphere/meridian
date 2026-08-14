/**
 * Where this deployment lives, as far as the outside world is concerned.
 *
 * One constant, because three separate things have to agree on it exactly and
 * a disagreement between them is silent: `metadataBase` resolves canonical and
 * Open Graph URLs against it, `sitemap.ts` emits absolute URLs from it, and
 * `robots.ts` points crawlers at the sitemap with it. Google treats a sitemap
 * whose host differs from the property it was submitted under as covering URLs
 * it was not authorised for, and simply drops them — no error, just nothing
 * indexed.
 *
 * The env var wins so that preview deploys advertise themselves rather than
 * production. Set `NEXT_PUBLIC_SITE_URL` on any environment that is not the
 * live domain; the fallback is the live domain because that is the one that
 * must be right without anybody remembering to configure it.
 */
const FALLBACK_ORIGIN = "https://ventitradingfx.com";

/** Absolute origin, no trailing slash. */
export const SITE_ORIGIN = (
  process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_ORIGIN
).replace(/\/+$/, "");

/** `SITE_ORIGIN` as a `URL`, which is the shape Next's `metadataBase` wants. */
export const SITE_URL = new URL(SITE_ORIGIN);

/** `https://ventitradingfx.com/help` from `/help`. */
export function absoluteUrl(path: string): string {
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * What the product calls itself in a browser tab and a link preview.
 *
 * Deliberately *not* the brand. The app is served on more than one domain, and
 * a title carrying one domain's name is wrong on every other one — a visitor
 * who opens the second domain and sees the first domain's name in the tab has
 * been told, at a glance, that they are somewhere other than where they typed.
 * A descriptive name is true on all of them, which is the only property a
 * shared title can have.
 *
 * The env var exists for the day the domains stop being mirrors. One Vercel
 * project serving both means one value for both, so setting it changes every
 * domain at once; splitting into a project per domain is what makes it a
 * per-domain name, and that split then needs no code change. The default is
 * generic rather than a real name because a default is what ships when nobody
 * remembers to configure it, and a wrong name is worse than a plain one.
 *
 * The brand still appears where it is unambiguously correct: the `Wordmark`
 * component, which renders inside the app the visitor is already looking at.
 */
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Trading Terminal";

/**
 * Spread into the `metadata` of any page that must stay out of search.
 *
 * A constant rather than an inline literal at each call site so that the six
 * pages relying on it cannot drift apart, and so that grepping for it lists
 * every private surface in one go.
 */
export const NO_INDEX = { index: false, follow: false } as const;

/**
 * The routes a search engine is welcome to index — the whole public product.
 *
 * Everything absent from this list is absent on purpose and falls into one of
 * two groups, both of which also carry their own `robots: { index: false }` so
 * that a stray link cannot get them crawled anyway:
 *
 *   - Personal surfaces (`/account`, `/wallet`, `/positions`, `/performance`).
 *     They render one person's balances and contracts. Nothing there is useful
 *     to a stranger arriving from a search result, and the titles alone would
 *     leak what the page is for.
 *   - Staff surfaces (`/admin`, `/sessions`). A console and a live desk should
 *     never turn up in a search for the product they run.
 *
 * `changeFrequency` and `priority` are hints Google has said publicly it
 * ignores, so they are not here. `lastModified` it does read, which is why the
 * one field present is the one that is true.
 */
export const PUBLIC_ROUTES: { path: string; lastModified: Date }[] = [
  // The terminal itself. No sign-in wall — an anonymous visitor lands on a
  // funded demo account — so it is both the landing page and the product.
  { path: "/", lastModified: new Date("2026-08-06") },
  // How contracts settle and how money moves. The one page here that answers a
  // question somebody types into a search box.
  { path: "/help", lastModified: new Date("2026-08-06") },
];
