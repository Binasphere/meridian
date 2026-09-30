import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { SupportPage } from "@/components/account/SupportPage";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Raise a support ticket about a deposit, withdrawal, trade or your account, and read answers to common questions.",
  alternates: { canonical: "/support" },
};

export default function Page() {
  return (
    <AccountShell
      title="Support"
      publicPage
    >
      <SupportPage />
    </AccountShell>
  );
}
