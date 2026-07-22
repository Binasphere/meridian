import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { BalancesView } from "@/components/account/views";

export const metadata: Metadata = { title: "Balances" };

export default function Page() {
  return (
    <AccountShell title="Balances" description="Your practice and live accounts. Only the live account holds real funds.">
      <BalancesView />
    </AccountShell>
  );
}
