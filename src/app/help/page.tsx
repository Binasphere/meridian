import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { HelpPage } from "@/components/account/views";

export const metadata: Metadata = {
  title: "Help & support",
  description:
    "How fixed-time contracts settle, how deposits and withdrawals move over M-Pesa, and how to reach support.",
  alternates: { canonical: "/help" },
};

export default function Page() {
  return (
    <AccountShell
      title="Help & support"
      description="How contracts settle, how money moves, and how to reach us."
    >
      <HelpPage />
    </AccountShell>
  );
}
