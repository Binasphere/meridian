import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { PositionsPage } from "@/components/account/views";
import { NO_INDEX } from "@/lib/site";

// One person's open and settled contracts.
export const metadata: Metadata = { title: "Positions", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell
      title="Positions"
      description="Contracts running now, and every one that has settled."
    >
      <PositionsPage />
    </AccountShell>
  );
}
