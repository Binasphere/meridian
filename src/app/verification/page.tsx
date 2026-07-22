import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { VerificationView } from "@/components/account/views";

export const metadata: Metadata = { title: "Verification & limits" };

export default function Page() {
  return (
    <AccountShell title="Verification & limits" description="Your verification tier and the transaction limits that come with it.">
      <VerificationView />
    </AccountShell>
  );
}
