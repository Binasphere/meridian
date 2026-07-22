import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { StatementView } from "@/components/account/views";

export const metadata: Metadata = { title: "Transaction statement" };

export default function Page() {
  return (
    <AccountShell title="Transaction statement" description="Every deposit, withdrawal and settled contract, as one ledger.">
      <StatementView />
    </AccountShell>
  );
}
