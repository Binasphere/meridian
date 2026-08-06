import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { WalletPage } from "@/components/account/views";
import { NO_INDEX } from "@/lib/site";

// One person's balances and full statement.
export const metadata: Metadata = { title: "Wallet", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell
      title="Wallet"
      description="Your balances, moving money in and out, and the full statement."
    >
      <WalletPage />
    </AccountShell>
  );
}
