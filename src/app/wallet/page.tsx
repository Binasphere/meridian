import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { WalletPage } from "@/components/account/views";

export const metadata: Metadata = { title: "Wallet" };

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
