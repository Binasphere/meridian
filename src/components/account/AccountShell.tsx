"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { useAuth, useAuthHydrated } from "@/lib/auth";
import { selectBalance, useStore, useStoreHydrated } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Wordmark } from "@/components/Wordmark";

/**
 * Chrome for the account pages.
 *
 * These are real routes rather than views inside the trading panel, which means
 * they are linkable, back-button-able, and survive a refresh. That matters most
 * for the ones a customer reaches while confused or annoyed — a statement or a
 * withdrawal receipt they want to send someone should have a URL.
 *
 * The trading terminal is deliberately not mounted underneath: the market
 * engine keeps running, but the chart, the ticket and the settlement driver all
 * unmount, so reading your statement costs nothing in frames.
 */
export function AccountShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const authHydrated = useAuthHydrated();
  const currentPhone = useAuth((s) => s.currentPhone);
  const storeHydrated = useStoreHydrated();
  const balance = useStore(selectBalance);
  const accountKind = useStore((s) => s.accountKind);

  if (!mounted || !authHydrated) {
    return <div className="min-h-dvh bg-base" />;
  }
  if (!currentPhone) return <AuthScreen />;

  return (
    <div className="min-h-dvh bg-base">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface-1 px-3 sm:px-4">
        <Link
          href="/"
          aria-label="Back to terminal"
          className="grid h-9 w-9 shrink-0 place-items-center border border-line bg-surface-2 text-ink-muted transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <Link href="/" className="hidden shrink-0 sm:block">
          <Wordmark className="h-[18px]" />
        </Link>

        <div className="ml-auto text-right">
          <div className="text-[9.5px] font-medium uppercase tracking-[0.09em] text-ink-muted">
            {accountKind === "DEMO" ? "Demo balance" : "Live balance"}
          </div>
          <div className="tnum -mt-0.5 font-mono text-[15px] font-medium leading-tight text-ink">
            {storeHydrated ? formatMoney(balance, { currency: "KSh" }) : "—"}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[720px] px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-5">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-[60ch] text-[13.5px] leading-relaxed text-ink-secondary">
              {description}
            </p>
          ) : null}
        </div>

        <div className="border border-line bg-surface-1">{children}</div>
      </main>
    </div>
  );
}
