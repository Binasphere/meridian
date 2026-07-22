"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { useAuth, useAuthHydrated } from "@/lib/auth";
import { selectBalance, useStore, useStoreHydrated } from "@/lib/store";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { Wordmark } from "@/components/Wordmark";

/**
 * Chrome for the account pages.
 *
 * ## Why these fill the viewport instead of scrolling
 *
 * On a desktop these are dashboards, not documents. The page is pinned to the
 * viewport height and its sections lay out left-to-right in columns, so
 * everything is visible at once and the eye moves rather than the scrollbar.
 * Anything that can grow without bound — the movement list, the statement, the
 * FAQ — scrolls *inside its own panel*, which keeps the page frame still and
 * means one long list can never push the rest of the page off screen.
 *
 * Below `lg` this inverts to a single stacked column with ordinary page
 * scrolling, because columns on a phone are just narrower paragraphs.
 *
 * ## Why the header renders before hydration
 *
 * Returning a blank div until persisted state loads is what makes navigation
 * feel slow — every hop blanks the screen for a frame and the eye reads that
 * pause as fetching. The chrome depends on nothing persisted, so it renders
 * immediately; only the balance readout and the body wait, and the balance
 * falls back to a dash so the layout never shifts.
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
  const authHydrated = useAuthHydrated();
  const currentPhone = useAuth((s) => s.currentPhone);
  const storeHydrated = useStoreHydrated();
  const balance = useStore(selectBalance);
  const accountKind = useStore((s) => s.accountKind);

  // Only once we know there is no session do we swap in sign-in — showing it
  // while storage is still being read would flash it at signed-in users.
  if (authHydrated && !currentPhone) return <AuthScreen />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface-1 px-3 sm:px-4">
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

      {/* Scrolls on phones, pinned on desktop. */}
      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-3 py-4 sm:px-5 sm:py-5">
          <div className="mb-4 shrink-0">
            <h1 className="text-[20px] font-semibold tracking-tight text-ink">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-ink-secondary">
                {description}
              </p>
            ) : null}
          </div>

          <div className="min-h-0 lg:flex-1">
            {storeHydrated ? (
              children
            ) : (
              // Occupies roughly the space the content will, so nothing jumps.
              <div className="h-[60vh] border border-line bg-surface-1" />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/**
 * A titled block within a page.
 *
 * `fill` makes the panel take the remaining height of its column and scroll its
 * own body. Use it for anything unbounded — a list of movements, a statement, a
 * FAQ — so the column height stays fixed regardless of how much data exists.
 */
export function Section({
  title,
  description,
  action,
  children,
  className,
  fill = false,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  fill?: boolean;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col", className)}>
      <div className="mb-2 flex shrink-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-muted">
            {title}
          </h2>
          {description ? (
            <p className="mt-0.5 max-w-[52ch] text-[11px] leading-relaxed text-ink-faint">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>

      <div
        className={cn(
          "border border-line bg-surface-1",
          fill && "min-h-0 lg:flex-1 lg:overflow-y-auto",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** The page-level column grid. Stacks below `lg`, fills the viewport above it. */
export function Columns({
  count = 3,
  children,
  className,
}: {
  count?: 2 | 3;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-5 gap-y-6 lg:h-full lg:gap-y-0",
        count === 2 ? "lg:grid-cols-2" : "lg:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A single column within `Columns`; stacks its own sections vertically. */
export function Column({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col gap-5", className)}>
      {children}
    </div>
  );
}
