import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { ADMIN_COOKIE, isAdminEnabled, verifyToken } from "@/lib/admin/session";
import { isAdminDbConfigured } from "@/lib/supabase/admin";
import { supabaseProjectRef } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Admin console" };

// The session cookie decides what renders, so this page can never be static.
export const dynamic = "force-dynamic";

/**
 * /admin
 *
 * The gate is evaluated on the server before anything is sent, so an unlocked
 * console is never briefly rendered and then hidden — a client-side check would
 * ship the whole screen to anyone who asked and merely decline to paint it.
 */
export default async function Page() {
  if (!isAdminEnabled() || !isAdminDbConfigured()) {
    return <SetupNotice hasPasscode={isAdminEnabled()} hasDb={isAdminDbConfigured()} />;
  }

  const token = (await cookies()).get(ADMIN_COOKIE)?.value;

  return (
    <AdminPanel
      initiallySignedIn={verifyToken(token)}
      projectRef={supabaseProjectRef()}
    />
  );
}


/** Shown when the environment is incomplete. Never hints at the passcode. */
function SetupNotice({ hasPasscode, hasDb }: { hasPasscode: boolean; hasDb: boolean }) {
  const missing = [
    hasPasscode ? null : "ADMIN_PASSCODE",
    hasDb ? null : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean) as string[];

  return (
    <div className="adm-root flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="adm-card w-full max-w-[440px] p-6">
        <h1 className="text-[17px] font-semibold tracking-[-0.015em] text-adm-ink">
          Admin console is off
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-adm-ink-3">
          Set the following in{" "}
          <code className="rounded-none bg-adm-subtle px-1 py-0.5 font-mono text-[12px] text-adm-ink-2">
            .env.local
          </code>{" "}
          or{" "}
          <code className="rounded-none bg-adm-subtle px-1 py-0.5 font-mono text-[12px] text-adm-ink-2">
            secrets.local.json
          </code>{" "}
          and restart the server:
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
