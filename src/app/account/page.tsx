import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { AccountPage } from "@/components/account/views";

export const metadata: Metadata = { title: "Account" };

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
