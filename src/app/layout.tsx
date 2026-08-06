import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "sonner";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

/**
 * Two faces of one family: Plex Sans for the interface, Plex Mono for the
 * numbers.
 *
 * A price column is read vertically and compared against the value above it, so
 * the digits must not shift horizontally as they tick. Tabular figures fix
 * that on their own — `globals.css` turns them on everywhere — and a mono face
 * is not required for it. What the mono buys on top is *voice*: Plex Mono's
 * digits are drawn mechanically rather than editorially, so a ladder of prices
 * reads as instrument output instead of body copy set in numerals.
 *
 * They are siblings by design. Plex Sans and Plex Mono share a skeleton, so the
 * pairing adds a register without adding a second personality — which is the
 * failure mode of pairing an arbitrary mono with an arbitrary sans.
 *
 * Weights are declared explicitly because Plex is not a variable font on
 * Google Fonts: 400 for body, 500 for `font-medium`, 600 for `font-semibold`.
 * Asking for weights nothing uses just ships dead bytes.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

/**
 * `robots` is deliberately *not* set here.
 *
 * It used to say `{ index: false, follow: false }`, which is correct for a site
 * nobody is meant to find and fatal for one that is: inherited by every route,
 * it makes the sitemap a list of pages Google is under orders to ignore, and
 * the failure is silent — Search Console reports the URLs as discovered and
 * excluded rather than as an error.
 *
 * So the default is now "indexable", and the pages that must stay out carry
 * their own `robots: { index: false, follow: false }`: `/account`, `/wallet`,
 * `/positions` and `/performance` because they render one person's money, and
 * `/admin` and `/sessions` because they are staff surfaces. `lib/site.ts` holds
 * the list and the reasoning; `robots.ts` repeats it for crawl budget.
 *
 * `metadataBase` resolves canonical and Open Graph URLs. Without it Next warns
 * at build and falls back to `localhost` in any context that needs an absolute
 * URL — which is the sort of thing that ships.
 *
 * `alternates.canonical` is likewise absent, and must stay absent: metadata is
 * merged down the tree, so a canonical set here would be inherited by every
 * page and declare the entire site a duplicate of the home page. It is set on
 * the two indexable pages individually.
 */
export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: {
    default: "Venti — Fixed-time derivatives",
    template: "%s · Venti",
  },
  description:
    "A fixed-time derivatives terminal. Transparent payouts, server-priced settlement, and a practice account that behaves exactly like the live one.",
  applicationName: "Venti",
};

/**
 * `maximumScale` and `userScalable` are stated rather than left to the default,
 * because the value that used to be here — `maximumScale: 1` — is the one thing
 * in this file that silently breaks the product for people who need it most.
 *
 * It reads as a way to stop iOS zooming when a field is focused. What it
 * actually does is disable pinch-zoom for the entire document, permanently, for
 * everyone. On a terminal whose smallest text is 10.5px, that is not a
 * preference — it fails WCAG 1.4.4, and it means anyone who cannot read a price
 * at arm's length simply cannot use the site. (The chart kept zooming only
 * because lightweight-charts implements pinch in JavaScript and never asks the
 * browser.)
 *
 * The focus-zoom it was guarding against is dealt with where it belongs, in
 * `globals.css`: form controls are floored at 16px on touch devices, which is
 * the threshold iOS uses to decide whether to zoom at all.
 */
export const viewport: Viewport = {
  themeColor: "#08090d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="min-h-dvh bg-base text-ink antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                "panel flex items-start gap-3 w-[340px] p-3.5 text-sm shadow-2xl backdrop-blur-xl",
              title: "font-medium text-ink",
              description: "text-ink-secondary text-[13px] mt-0.5",
            },
          }}
        />
      </body>
    </html>
  );
}
