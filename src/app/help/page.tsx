import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { HelpPage } from "@/components/account/views";

export const metadata: Metadata = { title: "Help & support" };

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
