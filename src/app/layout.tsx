import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

/**
 * One typeface for the whole product, numbers included.
 *
 * Prices, balances and P&L are read as columns and compared against the value
 * above them, and a proportional face makes digits shift horizontally as they
 * tick — which reads as instability. What fixes that is fixed-width digits, not
 * a second typeface: Inter ships tabular figures, and `globals.css` turns them
 * on for every numeric surface. So the column holds still and the interface
 * speaks in one voice.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
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
    <html lang="en" className={inter.variable}>
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
