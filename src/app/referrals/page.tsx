import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { ReferralsPage } from "@/components/account/ReferralsPage";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Refer & earn", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell title="Refer & earn">
      <ReferralsPage />
    </AccountShell>
  );
}
