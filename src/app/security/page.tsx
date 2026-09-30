import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";
import { SecurityPage } from "@/components/account/SecurityPage";
import { NO_INDEX } from "@/lib/site";

export const metadata: Metadata = { title: "Security", robots: NO_INDEX };

export default function Page() {
  return (
    <AccountShell title="Security">
      <SecurityPage />
    </AccountShell>
  );
}
