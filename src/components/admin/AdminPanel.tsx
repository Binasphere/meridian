"use client";

import { useCallback, useEffect, useState } from "react";
import { Menu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, setAdminToken } from "@/lib/admin/client";
import type { AdminAccount, SiteTotals } from "@/lib/admin/types";
import { roleCan } from "@/lib/admin/types";
import { AdminSidebar, visibleViews, type AdminView } from "./AdminSidebar";
import { AdminsView } from "./AdminsView";
import { DomainsView } from "./DomainsView";
import { OverviewView } from "./OverviewView";
import { SessionsView } from "./SessionsView";
import { SignInGate } from "./SignInGate";
import { UsersView } from "./UsersView";
import { WithdrawalsView } from "./WithdrawalsView";
import { Button, ToastHost } from "./ui";
import { useAdmins } from "./useAdmins";
import { useOverview } from "./useOverview";
import { useSessions } from "./useSessions";
import { useSites } from "./useSites";
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
  sessions: {
    title: "Sessions",
    description:
      "Every TikTok live, how long it ran, and what it collected against what it cost to promote.",
  },
  domains: {
    title: "Domains",
    description: "The addresses this platform answers on, and what they share.",
  },
  admins: {
    title: "Admins",
    description: "Who can sign in to this console, and what each of them may do.",
  },
};

type Phase = "checking" | "setup" | "locked" | "open";

export function AdminPanel({ projectRef }: { projectRef: string | null }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [missing, setMissing] = useState<string[]>([]);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  /**
   * Who is signed in, as the server describes them.
   *
   * Held here rather than derived in the console, because the role decides what
   * the Admins view is allowed to render, and asking a second endpoint for it
   * would let the two answers disagree for a render or two.
   */
  const [me, setMe] = useState<AdminAccount | null>(null);

  const probe = useCallback(async () => {
    try {
      const response = await adminFetch("/api/admin/session");
      const body = (await response.json()) as {
        enabled?: boolean;
        db?: boolean;
        signedIn?: boolean;
        admin?: AdminAccount | null;
        needsBootstrap?: boolean;
        bootstrapBlocked?: boolean;
      };

      if (!body.enabled || !body.db || body.bootstrapBlocked) {
        setMissing(
          [
            body.enabled ? null : "AUTH_SECRET",
            body.db ? null : "SUPABASE_SERVICE_ROLE_KEY",
            // A console with no super admin and no passcode cannot be entered
            // by anybody, and the only fix is an environment variable.
            body.bootstrapBlocked ? "ADMIN_PASSCODE" : null,
          ].filter((name): name is string => name !== null),
        );
        setPhase("setup");
        return;
      }

      setNeedsBootstrap(Boolean(body.needsBootstrap));
      setMe(body.admin ?? null);
      setPhase(body.signedIn ? "open" : "locked");
    } catch {
      // Unreachable backend: show the gate — its submit will say plainly
      // that the server could not be reached.
      setPhase("locked");
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  if (phase === "checking") {
    return <div className="adm-root min-h-dvh" />;
  }
  if (phase === "setup") {
    return <SetupNotice missing={missing} />;
  }

  return phase === "open" ? (
    <ToastHost>
      <Console
        projectRef={projectRef}
        me={me}
        onSignedOut={() => {
          setMe(null);
          setPhase("locked");
        }}
      />
    </ToastHost>
  ) : (
    <SignInGate
      needsBootstrap={needsBootstrap}
      // Re-probe rather than assuming: the sign-in handed us a token, and this
      // is what turns it into a name and a role without a second source.
      onUnlock={() => void probe()}
    />
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
          There are no default credentials. Until the console has a super admin
          — or a passcode to create the first one with — it serves nothing at
          all.
        </p>
      </div>
    </div>
  );
}

function Console({
  projectRef,
  me,
  onSignedOut,
}: {
  projectRef: string | null;
  me: AdminAccount | null;
  onSignedOut: () => void;
}) {
  const role = me?.role ?? null;
  const canSeeMoney = roleCan(role, "finance");

  // The first view this role is allowed to open. A session manager landing on
  // Overview would open the console on a 403 and a page of empty tiles.
  const [view, setView] = useState<AdminView>(
    () => visibleViews(role)[0] ?? "domains",
  );
  const [menuOpen, setMenuOpen] = useState(false);

  // Memoised: `useUsers` fetches from an effect keyed on this callback, so a
  // fresh identity each render would re-request in a loop.
  const handleUnauthorised = useCallback(() => onSignedOut(), [onSignedOut]);

  // The finance hooks are given a no-op when the role may not use them, so they
  // never fire the request in the first place. Letting them 403 on a timer
  // would work, but it would also mean a session manager's console spends its
  // life being refused — noise in the logs and a standing invitation to
  // misread one of those 403s as a bug.
  /**
   * Which product the console is showing, or null for both.
   *
   * Held here rather than per view so that switching domain does not silently
   * un-switch when you move between Users and Withdrawals — an admin who filtered
   * to one product and then saw the other product's payout queue would act on
   * the wrong customer.
   */
  const [site, setSite] = useState<string | null>(null);

  const state = useUsers(handleUnauthorised, canSeeMoney, site);
  const withdrawalsState = useWithdrawals(handleUnauthorised, canSeeMoney, site);
  const sessionsState = useSessions(
    handleUnauthorised,
    roleCan(role, "sessions"),
    site,
  );
  const adminsState = useAdmins(handleUnauthorised);
  const sitesState = useSites(handleUnauthorised);
  const overviewState = useOverview(handleUnauthorised, canSeeMoney);

  const pendingWithdrawals =
    withdrawalsState.withdrawals?.filter((w) => w.status === "PENDING").length ??
    null;

  const liveNow = Boolean(
    sessionsState.sessions?.some((session) => session.endedAt === null),
  );

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
          liveNow={liveNow}
          projectRef={projectRef}
          role={role}
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
              liveNow={liveNow}
              projectRef={projectRef}
              role={role}
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

          {/* Only where it changes what you see. Domains is the comparison
              itself and Admins is platform-wide, so a filter on either would
              be a control that does nothing. */}
          {view === "users" || view === "withdrawals" || view === "sessions" ? (
            <SiteFilter
              value={site}
              sites={sitesState.sites}
              onChange={setSite}
            />
          ) : null}

          <Button
            onClick={() => {
              void state.reload();
              void withdrawalsState.reload();
              void sessionsState.reload();
              void adminsState.reload();
              void sitesState.reload();
              void overviewState.reload();
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
            <OverviewView state={overviewState} />
          ) : view === "users" ? (
            <UsersView state={state} />
          ) : view === "withdrawals" ? (
            <WithdrawalsView state={withdrawalsState} />
          ) : view === "sessions" ? (
            <SessionsView state={sessionsState} />
          ) : view === "domains" ? (
            <DomainsView state={sitesState} />
          ) : (
            <AdminsView state={adminsState} me={me} />
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Which product the figures cover.
 *
 * "All domains" is first and is the default, because the combined number is the
 * one an owner asks for first and a filter that starts narrowed hides the
 * existence of the other product from anyone who does not go looking.
 *
 * Rendered only once the site list has arrived. A picker that briefly offers
 * one option and then grows is a picker people click twice.
 */
function SiteFilter({
  value,
  sites,
  onChange,
}: {
  value: string | null;
  sites: SiteTotals[] | null;
  onChange: (site: string | null) => void;
}) {
  if (!sites || sites.length < 2) return null;

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Domain</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
        className={cn(
          "h-9 rounded-none border border-adm-line-strong bg-adm-surface px-2.5",
          "text-[13px] font-medium text-adm-ink-2 outline-none transition-colors",
          "hover:bg-adm-subtle focus:border-adm-accent focus:ring-2 focus:ring-adm-accent-tint",
          value && "border-adm-accent-line bg-adm-accent-tint text-adm-accent-deep",
        )}
      >
        <option value="">All domains</option>
        {sites.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>
    </label>
  );
}
