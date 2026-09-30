"use client";

import { cn } from "@/lib/utils";
import { useAuth, useAuthHydrated } from "@/lib/auth";
import { useStoreHydrated } from "@/lib/store";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { LinkNumberScreen } from "@/components/auth/LinkNumberScreen";
import { SignInGate } from "@/components/auth/SignInGate";
import { BottomTabs } from "@/components/terminal/BottomTabs";
import { Overlays } from "@/components/terminal/Overlays";
import { TopBar } from "@/components/terminal/TopBar";
import { useApplyTheme } from "@/lib/prefs";
import { Spinner } from "@/components/ui/Spinner";

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
  publicPage = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Readable signed out — Markets and Support. Everything else gates. */
  publicPage?: boolean;
}) {
  const authHydrated = useAuthHydrated();
  const currentPhone = useAuth((s) => s.currentPhone);
  const linkPending = useAuth((s) => s.linkPending);
  const storeHydrated = useStoreHydrated();
  useApplyTheme();

  // A Google account with no number yet finishes that first, on every page.
  if (authHydrated && linkPending) return <LinkNumberScreen />;

  // Only once we know there is no session do we swap in sign-in — showing it
  // while storage is still being read would flash it at signed-in users.
  if (!publicPage && authHydrated && !currentPhone) return <AuthScreen />;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-base">
      {/* The same bar as the terminal: menu, brand, the balance chip and
          Deposit — so the account you are on reads identically everywhere. */}
      <TopBar />
      <Overlays />
      <SignInGate />

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
            {storeHydrated && authHydrated ? (
              children
            ) : (
              // Occupies roughly the space the content will, so nothing jumps.
              <div className="grid h-[60vh] place-items-center border border-line bg-surface-1">
                <Spinner size={36} label="Loading" />
              </div>
            )}
          </div>
        </div>
      </main>

      <BottomTabs />
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
