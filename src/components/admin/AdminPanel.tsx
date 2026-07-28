"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, setAdminToken } from "@/lib/admin/client";
import { AdminSidebar, type AdminView } from "./AdminSidebar";
import { OverviewView } from "./OverviewView";
import { PasscodeGate } from "./PasscodeGate";
import { UsersView } from "./UsersView";
import { WithdrawalsView } from "./WithdrawalsView";
import { Button, ToastHost } from "./ui";
import { useUsers } from "./useUsers";
import { useWithdrawals } from "./useWithdrawals";

/**
 * The admin console.
 *
 * Light, on its own canvas, in a fixed sidebar layout — deliberately nothing
 * like the terminal it administers. The whole surface is a client component
 * with no Supabase client of its own: everything it knows arrives from the
 * backend service's `/api/admin/*`, which is the only place the service-role
 * key exists.
 *
 * The session lives with the backend too, so what to render — setup notice,
 * passcode gate, or console — is decided by probing `/api/admin/session` on
 * mount. Until the probe answers, nothing renders: a console briefly painted
 * and then snatched away would show data to whoever asked.
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
  withdrawals: {
    title: "Withdrawals",
    description:
      "Requests with funds already held. Pay via M-Pesa, confirm with the reference — or reject to refund.",
  },
};

type Phase = "checking" | "setup" | "locked" | "open";

export function AdminPanel({ projectRef }: { projectRef: string | null }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await adminFetch("/api/admin/session");
        const body = (await response.json()) as {
          enabled?: boolean;
          db?: boolean;
          signedIn?: boolean;
        };

        if (!body.enabled || !body.db) {
          setMissing(
            [
              body.enabled ? null : "ADMIN_PASSCODE",
              body.db ? null : "SUPABASE_SERVICE_ROLE_KEY",
            ].filter((name): name is string => name !== null),
          );
          setPhase("setup");
          return;
        }

        setPhase(body.signedIn ? "open" : "locked");
      } catch {
        // Unreachable backend: show the gate — its submit will say plainly
        // that the server could not be reached.
        setPhase("locked");
      }
    })();
  }, []);

  if (phase === "checking") {
    return <div className="adm-root min-h-dvh" />;
  }
  if (phase === "setup") {
    return <SetupNotice missing={missing} />;
  }

  return phase === "open" ? (
    <ToastHost>
      <Console projectRef={projectRef} onSignedOut={() => setPhase("locked")} />
    </ToastHost>
  ) : (
    <PasscodeGate onUnlock={() => setPhase("open")} />
  );
}

/** Shown when the backend's environment is incomplete. Never hints at the passcode. */
function SetupNotice({ missing }: { missing: string[] }) {
  return (
    <div className="adm-root flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="adm-card w-full max-w-[440px] p-6">
        <h1 className="text-[17px] font-semibold tracking-[-0.015em] text-adm-ink">
          Admin console is off
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-adm-ink-3">
          Set the following on the backend service (Render → Environment) and
          redeploy:
        </p>

        <ul className="mt-4 space-y-2">
          {missing.map((name) => (
            <li
              key={name}
              className="rounded-none border border-adm-line bg-adm-subtle px-3 py-2 font-mono text-[12.5px] text-adm-ink-2"
            >
              {name}
            </li>
          ))}
        </ul>

        <p className="mt-5 border-t border-adm-line pt-4 text-[12px] leading-relaxed text-adm-ink-3">
          There is no default passcode. Until one is set the console serves
          nothing at all.
        </p>
      </div>
    </div>
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
  const withdrawalsState = useWithdrawals(handleUnauthorised);

  const pendingWithdrawals =
    withdrawalsState.withdrawals?.filter((w) => w.status === "PENDING").length ??
    null;

  async function signOut() {
    await adminFetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    // The session is the token; forgetting it is the sign-out.
    setAdminToken(null);
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
          pendingWithdrawals={pendingWithdrawals}
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
              pendingWithdrawals={pendingWithdrawals}
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
            onClick={() => {
              void state.reload();
              void withdrawalsState.reload();
            }}
            disabled={state.loading || withdrawalsState.loading}
            title="Reload from Supabase"
          >
            <RefreshCw
              size={14}
              className={
                state.loading || withdrawalsState.loading
                  ? "animate-spin"
                  : undefined
              }
            />
            Refresh
          </Button>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          {view === "overview" ? (
            <OverviewView users={state.users} />
          ) : view === "users" ? (
            <UsersView state={state} />
          ) : (
            <WithdrawalsView state={withdrawalsState} />
          )}
        </main>
      </div>
    </div>
  );
}
