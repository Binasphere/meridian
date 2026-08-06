import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { AccountPage } from "@/components/account/views";
import { NO_INDEX } from "@/lib/site";

// One person's profile and verification tier. Nothing here is useful to a
// stranger arriving from a search result.
export const metadata: Metadata = { title: "Account", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell
      title="Account"
      description="Your profile, verification tier and trading defaults."
    >
      <AccountPage />
    </AccountShell>
  );
}
