"use client";

import { useCallback, useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminSidebar, type AdminView } from "./AdminSidebar";
import { OverviewView } from "./OverviewView";
import { PasscodeGate } from "./PasscodeGate";
import { UsersView } from "./UsersView";
import { Button, ToastHost } from "./ui";
import { useUsers } from "./useUsers";

/**
 * The admin console.
 *
 * Light, on its own canvas, in a fixed sidebar layout — deliberately nothing
 * like the terminal it administers. The whole surface is a client component
 * with no Supabase client of its own: everything it knows arrives from
 * `/api/admin/*`, which is the only place the service-role key exists.
 */

const VIEW_META: Record<AdminView, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "Accounts, tiers and balances across the platform.",
  },
  users: {
    title: "Users",
    description: "Every account, and the tier its live contracts are booked at.",
  },
};

export function AdminPanel({
  initiallySignedIn,
  projectRef,
}: {
  initiallySignedIn: boolean;
  projectRef: string | null;
}) {
  const [signedIn, setSignedIn] = useState(initiallySignedIn);

  return signedIn ? (
    <ToastHost>
      <Console projectRef={projectRef} onSignedOut={() => setSignedIn(false)} />
    </ToastHost>
  ) : (
    <PasscodeGate onUnlock={() => setSignedIn(true)} />
  );
}

function Console({
  projectRef,
  onSignedOut,
}: {
  projectRef: string | null;
  onSignedOut: () => void;
}) {
  const [view, setView] = useState<AdminView>("overview");
  const [menuOpen, setMenuOpen] = useState(false);

  // Memoised: `useUsers` fetches from an effect keyed on this callback, so a
  // fresh identity each render would re-request in a loop.
  const handleUnauthorised = useCallback(() => onSignedOut(), [onSignedOut]);
  const state = useUsers(handleUnauthorised);

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    onSignedOut();
  }

  function navigate(next: AdminView) {
    setView(next);
    setMenuOpen(false);
  }

  const meta = VIEW_META[view];

  return (
    <div className="adm-root min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* --- Sidebar: fixed on desktop, a drawer below `lg` ---------------- */}
      <aside className="sticky top-0 hidden h-dvh lg:block">
        <AdminSidebar
          view={view}
          onNavigate={navigate}
          userCount={state.users?.length ?? null}
          projectRef={projectRef}
          onSignOut={() => void signOut()}
        />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-[#101426]/30 backdrop-blur-[1px]"
          />
          <div className="absolute inset-y-0 left-0 w-[268px] max-w-[85vw] shadow-[0_16px_48px_-12px_rgba(16,20,38,.28)]">
            <AdminSidebar
              view={view}
              onNavigate={navigate}
              userCount={state.users?.length ?? null}
              projectRef={projectRef}
              onSignOut={() => void signOut()}
              onClose={() => setMenuOpen(false)}
            />
          </div>
        </div>
      ) : null}

      {/* --- Main --------------------------------------------------------- */}
      <div className="flex min-w-0 flex-col">
        <header
          className={cn(
            "sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-adm-line",
            // Translucent rather than solid: content scrolling underneath stays
            // faintly visible, which is what keeps a sticky bar reading as a
            // layer over the page instead of a lid on it.
            "bg-adm-canvas/85 px-4 py-4 backdrop-blur-md sm:px-6 lg:px-8",
          )}
        >
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-none border border-adm-line-strong bg-adm-surface p-2 text-adm-ink-2 transition-colors hover:bg-adm-subtle lg:hidden"
          >
            <Menu size={16} />
          </button>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[19px] font-semibold tracking-[-0.02em] text-adm-ink">
              {meta.title}
            </h1>
            <p className="mt-0.5 hidden text-[12.5px] text-adm-ink-3 sm:block">
              {meta.description}
            </p>
          </div>

          <Button
            onClick={() => void state.reload()}
            disabled={state.loading}
            title="Reload from Supabase"
          >
            <RefreshCw
              size={14}
              className={state.loading ? "animate-spin" : undefined}
            />
            Refresh
          </Button>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {view === "overview" ? (
            <OverviewView users={state.users} />
          ) : (
            <UsersView state={state} />
          )}
        </main>
      </div>
    </div>
  );
}
