import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { supabaseProjectRef } from "@/lib/supabase/config";
import { NO_INDEX } from "@/lib/site";

// Staff surface on a public host, same as /sessions: it should never turn up
// in a search result for the product it administers.
export const metadata: Metadata = { title: "Admin console", robots: NO_INDEX };

/**
 * /admin
 *
 * A shell and nothing more. The console's data, its passcode check, and its
 * session all live on the backend service — this deployment holds no secrets,
 * so there is nothing here for a server component to gate with. `AdminPanel`
 * probes the backend on mount and renders the setup notice, the passcode
 * gate, or the console accordingly, and paints nothing until it knows which.
 */
export default function Page() {
  return <AdminPanel projectRef={supabaseProjectRef()} />;
}
