import type { Metadata } from "next";
import { SessionsPortal } from "@/components/sessions/SessionsPortal";

export const metadata: Metadata = {
  title: "Live desk",
  // Staff surface on a public host. It should never turn up in a search result
  // for the product it markets.
  robots: { index: false, follow: false },
};

/**
 * /sessions
 *
 * A shell, like `/admin`. The host's credentials, their broadcasts and the
 * figures those broadcasts earned all live on the backend service; this
 * deployment holds no secrets, so there is nothing here for a server component
 * to gate with.
 */
export default function Page() {
  return <SessionsPortal />;
}
