import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { AccountDetails } from "@/components/account/AccountDetails";
import { NO_INDEX } from "@/lib/site";

// One person's account details. Nothing here is useful to a
// stranger arriving from a search result.
export const metadata: Metadata = { title: "Account", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell
      title="Account"
      description="Your account details."
    >
      <AccountDetails />
    </AccountShell>
  );
}
