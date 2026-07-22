import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * A monospace face for every number on screen.
 *
 * Prices, balances and P&L are read as columns and compared against the value
 * above them. A proportional face makes digits shift horizontally as they tick,
 * which reads as instability; fixed-width digits hold the column still.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Meridian — Fixed-time derivatives",
    template: "%s · Meridian",
  },
  description:
    "A fixed-time derivatives terminal. Transparent payouts, server-priced settlement, and a practice account that behaves exactly like the live one.",
  applicationName: "Meridian",
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
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
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
