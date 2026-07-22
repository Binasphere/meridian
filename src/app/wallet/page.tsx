import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { WalletView } from "@/components/account/views";

export const metadata: Metadata = { title: "Deposits & withdrawals" };

export default function Page() {
  return (
    <AccountShell title="Deposits & withdrawals" description="Move money between M-Pesa and your live account.">
      <WalletView />
    </AccountShell>
  );
}
