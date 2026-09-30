import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { TransactionsPage } from "@/components/account/views";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Transactions", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell title="Transactions">
      <TransactionsPage />
    </AccountShell>
  );
}
