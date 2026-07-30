import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { Toaster } from "sonner";
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

export const metadata: Metadata = {
  title: {
    default: "Venti — Fixed-time derivatives",
    template: "%s · Venti",
  },
  description:
    "A fixed-time derivatives terminal. Transparent payouts, server-priced settlement, and a practice account that behaves exactly like the live one.",
  applicationName: "Venti",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#08090d",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
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
